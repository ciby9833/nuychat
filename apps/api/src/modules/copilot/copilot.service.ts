/**
 * 作用：生成座席侧 Copilot 摘要与建议，复用数字员工的统一事实层，避免 agent 视角与自动回复口径漂移。
 * 上游：conversation.routes.ts
 * 下游：Copilot 面板、agent assist UI
 * 协作对象：fact-layer.service.ts、customer-intelligence.service.ts、knowledge-retrieval.service.ts
 * 不负责：不执行业务 tool，不维护会话状态机，不替代 orchestrator 主回复链。
 * 变更注意：新增证据来源时优先并入 FactSnapshot，而不是在 Copilot 内部拼第二套上下文。
 */

import type { Knex } from "knex";
import type { AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage, recordAIUsage } from "../ai/usage-meter.service.js";
import { buildCustomerIntelligenceContext } from "../memory/customer-intelligence.service.js";
import {
  buildFactSnapshot,
  buildVerifiedFactFromKnowledgeEntry,
  formatFactSnapshotForPrompt,
  mergeKnowledgeFacts
} from "../ai/fact-layer.service.js";
import { searchKnowledgeEntries } from "../knowledge/knowledge-retrieval.service.js";

type MsgRow = {
  message_id: string;
  direction: string;
  content: { text?: string };
  created_at: string;
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
  "intent": "<short intent label describing the customer's primary need>",
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
- When a verified skill result includes concrete facts, mention at least one concrete fact in each suggestion.
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

    // ── Fact Layer: shared fact source with orchestrator & skills/assist ──
    const latestUserText = [...messages].reverse().find((message) => message.direction !== "outbound")?.content?.text?.trim() ?? "";
    const [factSnapshot, memoryContext, knowledgeEntries] = await Promise.all([
      buildFactSnapshot(db, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: conversationRow?.customer_id
      }),
      buildCustomerIntelligenceContext(
        db,
        input.tenantId,
        input.conversationId,
        conversationRow?.customer_id ?? undefined
      ).catch(() => ""),
      latestUserText
        ? searchKnowledgeEntries(db, {
            tenantId: input.tenantId,
            queryText: latestUserText,
            limit: 3
          }).catch(() => [])
        : Promise.resolve([])
    ]);

    const factSnapshotWithKnowledge = mergeKnowledgeFacts(
      factSnapshot,
      knowledgeEntries.map((entry) => buildVerifiedFactFromKnowledgeEntry(entry, latestUserText))
    );

    const factLayerContext = formatFactSnapshotForPrompt(factSnapshotWithKnowledge);
    const latestOperationalFact = factSnapshot.verifiedFacts[0] ?? null;
    const latestUnifiedFact = factSnapshotWithKnowledge.verifiedFacts[0] ?? null;
    const latestToolResult = latestOperationalFact ? {
      type: "tool_result",
      tool_name: latestOperationalFact.skillName,
      invoked_at: latestOperationalFact.invokedAt,
      args: latestOperationalFact.args,
      result: latestOperationalFact.result
    } : null;
    const latestSkillFacts = latestOperationalFact?.keyFacts ?? latestUnifiedFact?.keyFacts ?? null;

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
          memoryContext,
          latestToolResult,
          latestSkillFacts,
          factLayerContext
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
      : buildFallback(textFeed, entities, latestSkillFacts);

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
  memoryContext: string,
  latestToolResult: Record<string, unknown> | null,
  latestSkillFacts: { trackingNumber: string | null; status: string | null; time: string | null; location: string | null; description: string | null } | null,
  factLayerContext: string | null
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
      // Fact Layer context — includes verified facts + task facts + state facts
      ...(factLayerContext
        ? [{ role: "system" as const, content: factLayerContext }]
        : []),
      // Memory context is supplemental only when there is no fresh verified tool result.
      ...(!latestToolResult && !latestSkillFacts && !factLayerContext && memoryContext
        ? [{ role: "system" as const, content: `Customer intelligence context:\n${memoryContext}` }]
        : []),
      ...(latestToolResult
        ? [{
            role: "system" as const,
            content: `Authoritative tool result (single source of truth for current state):\n${JSON.stringify(latestToolResult, null, 2)}`
          }]
        : []),
      ...(latestSkillFacts
        ? [{
            role: "system" as const,
            content: `Authoritative latest skill facts:\n${JSON.stringify(latestSkillFacts, null, 2)}`
          }]
        : []),
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

function buildFallback(
  textFeed: string[],
  entities: CopilotResult["entities"],
  latestFacts: { trackingNumber: string | null; status: string | null; time: string | null; location: string | null; description: string | null } | null
): CopilotResult {
  const lastText = textFeed.at(-1) ?? "";
  const sentiment = kwSentiment(lastText);
  return {
    summary: textFeed.length > 0
      ? `Conversation focus: ${textFeed.slice(-2).join(" / ")}`.slice(0, 160)
      : "No conversation content yet.",
    intent: "general_inquiry",
    sentiment,
    entities,
    suggestions: latestFacts
      ? [buildFactGroundedFallback(latestFacts)]
      : sentiment === "angry"
      ? buildAngrySuggestions()
      : defaultSuggestions()
  };
}

function buildAngrySuggestions() {
  return [
    "I've noted your concern and will look into the current status for you right away.",
    "I apologize for the inconvenience. Let me check on this immediately.",
    "Thank you for your patience. I'm reviewing the details now."
  ];
}

function defaultSuggestions() {
  return [
    "Let me look into the details for you.",
    "I'll check the current status and get back to you shortly.",
    "Noted — let me verify the information and follow up."
  ];
}

function sanitizeCopilotSuggestions(suggestions: string[]) {
  return suggestions
    .map((item) => item.replace(/\[(.+?)\]|<(.+?)>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((item) => item.length >= 8)
    .filter((item) => !/[?？]$/.test(item))
    .filter((item) => !/(translate|please wait|稍候|稍等|正在查询|正在核对)/i.test(item));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractEntities(text: string) {
  // Extract reference numbers (order IDs, tracking numbers, ticket IDs, etc.)
  const rawReferenceIds = [
    ...(text.match(/\b[A-Z]{1,6}-?\d{4,}\b/g) ?? []),
    ...(text.match(/\b\d{8,20}\b/g) ?? [])
  ];
  const referenceIds = [...new Set(rawReferenceIds)];
  const refIdSet = new Set(referenceIds);
  const phones = (text.match(/\+?\d{8,15}/g) ?? []).filter((value) => !refIdSet.has(value));
  return {
    orderIds: referenceIds,
    phones: [...new Set(phones)],
    addresses: [] as string[]
  };
}

function kwSentiment(text: string): CopilotResult["sentiment"] {
  const angry = [
    "angry", "furious", "terrible", "worst", "scam", "fraud", "complaint",
    "生气", "愤怒", "投诉", "差评", "骗子",
    "marah", "kecewa", "penipuan"
  ];
  return angry.some((kw) => text.toLowerCase().includes(kw)) ? "angry" : "neutral";
}

function toSentiment(v: unknown): CopilotResult["sentiment"] {
  if (v === "positive" || v === "neutral" || v === "negative" || v === "angry") return v;
  return "neutral";
}

function buildFactGroundedFallback(facts: {
  trackingNumber: string | null;
  status: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
}) {
  const ref = facts.trackingNumber ? `Reference ${facts.trackingNumber}` : "Your request";
  const details = [
    facts.status ? `current status: ${facts.status}` : null,
    facts.location ? `location: ${facts.location}` : null,
    facts.time ? `last updated: ${facts.time}` : null,
    facts.description ? facts.description : null
  ].filter(Boolean);
  return `${ref} — ${details.length > 0 ? details.join(", ") : "latest information retrieved"}.`;
}

// parseObject is now imported from ../ai/fact-layer.service.ts

// pickMostRecentObjectRecord, extractTemporalScore, parseDateScore
// moved to ../ai/fact-layer.service.ts
