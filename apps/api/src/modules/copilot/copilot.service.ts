import type { Knex } from "knex";
import type { AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage, recordAIUsage } from "../ai/usage-meter.service.js";
import { buildCustomerIntelligenceContext } from "../memory/customer-intelligence.service.js";

type MsgRow = {
  message_id: string;
  direction: string;
  content: { text?: string };
  created_at: string;
};

type SkillInvocationRow = {
  skill_name: string;
  decision: string;
  args: unknown;
  result: unknown;
  invoked_at: string;
};

export interface CopilotResult {
  summary: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative" | "angry";
  entities: { orderIds: string[]; phones: string[]; addresses: string[] };
  suggestions: string[];
}

// Copilot prompt returns structured JSON for agent-facing insights
const COPILOT_SYSTEM = `You are an AI copilot assisting a human customer service agent.
Analyse the conversation and respond with valid JSON only — no markdown, no extra text.

Return exactly this JSON shape:
{
  "summary": "<1-2 sentences: what does the customer need and what has been done>",
  "intent": "<one of: order_inquiry | delivery_inquiry | refund_request | cancellation | complaint | payment_inquiry | general_inquiry>",
  "sentiment": "<one of: positive | neutral | negative | angry>",
  "suggestions": ["<3 short ready-to-send reply options in the customer's language>", "...", "..."]
}

Rules:
- Base suggestions on verified conversation context.
- Use the latest verified skill/tool result, if present, as ground truth for current status and next-step wording.
- If older conversation history or memory conflicts with the latest verified skill result, the latest verified skill result always wins.
- Suggestions must be direct agent replies that can be sent immediately.
- Default to declarative statements, not questions.
- Only ask a follow-up question when the skill result explicitly says required input is missing.
- When a verified skill result includes concrete facts, mention at least one concrete fact in each suggestion, such as current status, latest location, or latest update time.
- Do not say you are checking, querying, or waiting when a verified result already exists.
- Do not use placeholders such as [insert status], <status>, TBD, or similar filler.
- Do not offer translation, summarization, or reformatting unless the customer explicitly asked for it.
- Prefer concise, ready-to-send replies that directly answer the customer's latest request.
- Keep suggestions ready-to-send, concise, and customer-facing.
- Do not expose internal fields like code, msg, data, runtime, script name, or raw JSON.`;

export class CopilotService {
  async generate(
    db: Knex | Knex.Transaction,
    input: { tenantId: string; conversationId: string }
  ): Promise<CopilotResult> {
    const conversationRow = await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId } as any)
      .select("customer_id")
      .first<{ customer_id: string | null } | undefined>();
    const rows = await db<MsgRow>("messages")
      .select("message_id", "direction", "content", "created_at")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId } as any)
      .orderBy("created_at", "desc")
      .limit(15);

    const messages = [...rows].reverse();
    const textFeed = messages.filter((m) => m.content?.text).map((m) => m.content.text!);
    const entities = extractEntities(textFeed.join(" "));
    const latestSkillInvocation = await db<SkillInvocationRow>("skill_invocations")
      .select("skill_name", "decision", "args", "result", "invoked_at")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId } as any)
      .andWhere("decision", "allowed")
      .orderBy("invoked_at", "desc")
      .first();
    const skillContext = latestSkillInvocation ? buildSkillContext(latestSkillInvocation) : null;
    const latestSkillFacts = latestSkillInvocation
      ? extractLatestFacts(parseObject(latestSkillInvocation.result), parseObject(latestSkillInvocation.args))
      : null;
    const memoryContext = await buildCustomerIntelligenceContext(
      db,
      input.tenantId,
      input.conversationId,
      conversationRow?.customer_id ?? undefined
    ).catch(() => "");

    // ── LLM-powered analysis (when API key is available) ─────────────────────
    const aiSettings = await resolveTenantAISettingsForScene(db, input.tenantId, "agent_assist");
    let llmResult: Omit<CopilotResult, "entities"> | null = null;

    if (aiSettings && textFeed.length > 0) {
      const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
      if (budgetGate.allowed) {
        const completion = await runLLMCopilot(
          aiSettings.provider,
          aiSettings.model,
          aiSettings.temperature,
          Math.min(1000, aiSettings.maxTokens),
          messages,
          skillContext,
          memoryContext,
          latestSkillFacts
        ).catch(() => null);

        if (completion && completion.result.suggestions.length > 0) {
          llmResult = completion.result;
          await recordAIUsage(db, {
            tenantId: input.tenantId,
            provider: aiSettings.providerName,
            model: aiSettings.model,
            feature: "copilot",
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            metadata: {
              conversationId: input.conversationId
            }
          });
        }
      }
    }

    const result: CopilotResult = llmResult
      ? { ...llmResult, entities }
      : buildFallback(textFeed, entities, skillContext);

    // ── Persist AI trace ─────────────────────────────────────────────────────
    await db("ai_traces").insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      supervisor: "copilot",
      steps: JSON.stringify([
        { step: "summary", output: result.summary },
        { step: "intent", output: result.intent },
        { step: "sentiment", output: result.sentiment },
        { step: "suggestions", output: result.suggestions }
      ]),
      skills_called: JSON.stringify([]),
      token_usage: JSON.stringify({ prompt: 0, completion: 0, total: 0 }),
      total_duration_ms: 0
    });

    return result;
  }
}

// ─── LLM call ─────────────────────────────────────────────────────────────────

async function runLLMCopilot(
  provider: AIProvider,
  model: string,
  temperature: number,
  maxTokens: number,
  rows: MsgRow[],
  skillContext: string | null,
  memoryContext: string,
  latestSkillFacts: ReturnType<typeof extractLatestFacts>
): Promise<{ result: Omit<CopilotResult, "entities">; inputTokens: number; outputTokens: number }> {
  const chatHistory = rows
    .filter((m) => m.content?.text)
    .map((m) => ({
      role: (m.direction === "outbound" ? "assistant" : "user") as "assistant" | "user",
      content: m.content.text!
    }));

  const completion = await provider.complete({
    model,
    messages: [
      { role: "system", content: COPILOT_SYSTEM },
      ...(!latestSkillFacts && memoryContext
        ? [{ role: "system" as const, content: `Customer intelligence context:\n${memoryContext}` }]
        : []),
      ...(latestSkillFacts
        ? [{
            role: "system" as const,
            content: `Authoritative latest skill facts:\n${JSON.stringify(latestSkillFacts, null, 2)}`
          }]
        : []),
      ...(skillContext ? [{ role: "system" as const, content: `Latest verified skill result:\n${skillContext}` }] : []),
      ...chatHistory
    ],
    maxTokens,
    temperature: Math.min(0.4, Math.max(0, temperature)),
    responseFormat: "json_object"
  });
  const parsed = JSON.parse(completion.content ?? "{}") as Partial<CopilotResult>;

  return {
    result: {
      summary: parsed.summary ?? "No summary available.",
      intent: parsed.intent ?? "general_inquiry",
      sentiment: toSentiment(parsed.sentiment),
      suggestions: sanitizeCopilotSuggestions(
        Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
          : defaultSuggestions()
      )
    },
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens
  };
}

// ─── Keyword fallback (when provider is unavailable) ─────────────────────────

function buildFallback(textFeed: string[], entities: CopilotResult["entities"], skillContext: string | null): CopilotResult {
  const lastText = textFeed.at(-1) ?? "";
  const sentiment = kwSentiment(lastText);
  const latestFacts = extractLatestFactsFromSkillContext(skillContext);
  return {
    summary: textFeed.length > 0
      ? `会话聚焦于：${textFeed.slice(-2).join(" / ")}`.slice(0, 160)
      : "暂无会话内容。",
    intent: "general_inquiry",
    sentiment,
    entities,
    suggestions: latestFacts
      ? [buildFactGroundedFallback(latestFacts)]
      : sentiment === "angry"
      ? ["已收到您的反馈，我先帮您核对当前处理进度。",
         "抱歉让您久等了，我现在立即为您跟进。",
         "我先确认订单和处理状态，再给您明确答复。"]
      : defaultSuggestions()
  };
}

function defaultSuggestions() {
  return [
    "您好，我正在为您核对详情，请稍等。",
    "我先帮您查看当前状态，稍后回复您结果。",
    "收到，我这边先核对信息后马上反馈。"
  ];
}

function sanitizeCopilotSuggestions(suggestions: string[]) {
  return suggestions
    .map((item) => item.replace(/\[(.+?)\]|<(.+?)>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((item) => item.length >= 12)
    .filter((item) => !/[?？]$/.test(item))
    .filter((item) => !/(整理成中文|翻译成中文|translate|please wait|稍候|稍等|正在查询|正在核对)/i.test(item));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractEntities(text: string) {
  return {
    orderIds: text.match(/\b[A-Z]{2,5}\d{3,}\b/g) ?? [],
    phones: text.match(/\+?\d{8,15}/g) ?? [],
    addresses: text.includes("地址") || text.includes("alamat") ? [text.slice(0, 60)] : []
  };
}

function kwSentiment(text: string): CopilotResult["sentiment"] {
  const angry = ["退款", "投诉", "生气", "差评", "marah", "kecewa", "angry", "complaint", "fraud", "penipuan"];
  return angry.some((kw) => text.toLowerCase().includes(kw)) ? "angry" : "neutral";
}

function toSentiment(v: unknown): CopilotResult["sentiment"] {
  if (v === "positive" || v === "neutral" || v === "negative" || v === "angry") return v;
  return "neutral";
}

function buildSkillContext(row: SkillInvocationRow) {
  const args = parseObject(row.args);
  const result = parseObject(row.result);
  const summary = summarizeSkillResult(result);
  const latestFacts = extractLatestFacts(result, args);
  return [
    `skillName: ${row.skill_name}`,
    `invokedAt: ${row.invoked_at}`,
    Object.keys(args).length > 0 ? `args: ${JSON.stringify(args)}` : null,
    summary ? `summary: ${summary}` : null,
    latestFacts ? `latestFacts: ${JSON.stringify(latestFacts)}` : null,
    result.customerReply ? `customerReply: ${String(result.customerReply)}` : null,
    result.message ? `message: ${String(result.message)}` : null
  ].filter(Boolean).join("\n");
}

function summarizeSkillResult(result: Record<string, unknown>) {
  const data = parseObject(result.data);
  const response = parseObject(result.response);
  const source = Object.keys(response).length > 0 ? response : data;
  if (Object.keys(source).length === 0) return "";
  return Object.entries(source)
    .filter(([key, value]) => value !== null && value !== undefined && value !== "" && !["code", "msg", "data"].includes(key))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${formatSummaryValue(value)}`)
    .join("; ");
}

function formatSummaryValue(value: unknown): string {
  if (Array.isArray(value)) {
    const latestObject = pickMostRecentObjectRecord(value);
    if (latestObject) return summarizeObjectRecord(latestObject);
    return `${value.length} items`;
  }
  if (value && typeof value === "object") return summarizeObjectRecord(value as Record<string, unknown>);
  return String(value);
}

function summarizeObjectRecord(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 5)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join("; ");
}

function extractLatestBusinessObject(result: Record<string, unknown>) {
  const data = parseObject(result.data);
  const response = parseObject(result.response);
  const source = Object.keys(response).length > 0 ? response : data;
  for (const key of ["details", "records", "events", "tracks", "history", "items"]) {
    const value = source[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const latest = pickMostRecentObjectRecord(value);
    if (latest) return latest as Record<string, unknown>;
  }
  return null;
}

function findRecordValue(record: Record<string, unknown>, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue;
    if (patterns.some((pattern) => pattern.test(key))) return String(value);
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractLatestFacts(result: Record<string, unknown>, args: Record<string, unknown>) {
  const latestObject = extractLatestBusinessObject(result);
  if (!latestObject) return null;
  return {
    trackingNumber: firstNonEmptyString(
      args.billCodes,
      args.trackingNumber,
      args.tracking_number,
      args.waybillNumber,
      args.waybill_number
    ),
    status: findRecordValue(latestObject, [/^status$/i, /状态/, /scan\s*type/i]),
    time: findRecordValue(latestObject, [/^time$/i, /时间/, /date/i]),
    location: findRecordValue(latestObject, [/outlet/i, /网点/, /branch/i, /location/i]),
    description: findRecordValue(latestObject, [/description/i, /说明/, /remark/i, /detail/i])
  };
}

function extractLatestFactsFromSkillContext(skillContext: string | null) {
  if (!skillContext) return null;
  const match = skillContext.match(/latestFacts:\s*(\{.+\})/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    return {
      trackingNumber: firstNonEmptyString(parsed.trackingNumber),
      status: firstNonEmptyString(parsed.status),
      time: firstNonEmptyString(parsed.time),
      location: firstNonEmptyString(parsed.location),
      description: firstNonEmptyString(parsed.description)
    };
  } catch {
    return null;
  }
}

function buildFactGroundedFallback(facts: {
  trackingNumber: string | null;
  status: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
}) {
  const leading = facts.trackingNumber ? `这个单号 ${facts.trackingNumber}` : "这个单子";
  const details = [
    facts.location ? `目前到达【 ${facts.location} 】` : null,
    facts.status ? `当前状态是 ${facts.status}` : null,
    facts.time ? `最新时间是 ${facts.time}` : null,
    facts.description ? facts.description : null
  ].filter(Boolean);
  return `${leading}${details.length > 0 ? `，${details.join("，")}` : "，已查询到最新物流信息"}。`;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function pickMostRecentObjectRecord(value: unknown[]) {
  const records = value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
  if (records.length === 0) return null;

  let best: Record<string, unknown> | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const record of records) {
    const score = extractTemporalScore(record);
    if (score > bestScore) {
      best = record;
      bestScore = score;
    }
  }

  return best ?? records[0] ?? null;
}

function extractTemporalScore(record: Record<string, unknown>) {
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(record)) {
    if (!/(time|date|updated|created|timestamp|ts|scan)/i.test(key)) continue;
    const score = parseDateScore(value);
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

function parseDateScore(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const normalized = value.trim().replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}
