import type { Knex } from "knex";
import type { AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";
import { resolveTenantAISettings } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage, recordAIUsage } from "../ai/usage-meter.service.js";

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
  "intent": "<one of: order_inquiry | delivery_inquiry | refund_request | cancellation | complaint | payment_inquiry | general_inquiry>",
  "sentiment": "<one of: positive | neutral | negative | angry>",
  "suggestions": ["<3 short ready-to-send reply options in the customer's language>", "...", "..."]
}`;

export class CopilotService {
  async generate(
    db: Knex | Knex.Transaction,
    input: { tenantId: string; conversationId: string }
  ): Promise<CopilotResult> {
    const rows = await db<MsgRow>("messages")
      .select("message_id", "direction", "content", "created_at")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .orderBy("created_at", "desc")
      .limit(15);

    const messages = [...rows].reverse();
    const textFeed = messages.filter((m) => m.content?.text).map((m) => m.content.text!);
    const entities = extractEntities(textFeed.join(" "));

    // ── LLM-powered analysis (when API key is available) ─────────────────────
    const aiSettings = await resolveTenantAISettings(db, input.tenantId);
    let llmResult: Omit<CopilotResult, "entities"> | null = null;

    if (aiSettings && textFeed.length > 0) {
      const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
      if (budgetGate.allowed) {
        const completion = await runLLMCopilot(
          aiSettings.provider,
          aiSettings.model,
          aiSettings.temperature,
          Math.min(1000, aiSettings.maxTokens),
          messages
        ).catch(() => null);

        if (completion) {
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
      : buildFallback(textFeed, entities);

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
  rows: MsgRow[]
): Promise<{ result: Omit<CopilotResult, "entities">; inputTokens: number; outputTokens: number }> {
  const chatHistory = rows
    .filter((m) => m.content?.text)
    .map((m) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.content.text!
    }));

  const completion = await provider.complete({
    model,
    messages: [{ role: "system", content: COPILOT_SYSTEM }, ...chatHistory],
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
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : defaultSuggestions()
    },
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens
  };
}

// ─── Keyword fallback (when provider is unavailable) ─────────────────────────

function buildFallback(textFeed: string[], entities: CopilotResult["entities"]): CopilotResult {
  const lastText = textFeed.at(-1) ?? "";
  const sentiment = kwSentiment(lastText);
  return {
    summary: textFeed.length > 0
      ? `会话聚焦于：${textFeed.slice(-2).join(" / ")}`.slice(0, 160)
      : "暂无会话内容。",
    intent: "general_inquiry",
    sentiment,
    entities,
    suggestions: sentiment === "angry"
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
