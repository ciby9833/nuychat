import type { Knex } from "knex";

import { resolveTenantAISettings } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage, recordAIUsage } from "../ai/usage-meter.service.js";

type CustomerSentiment = "positive" | "neutral" | "negative" | "angry";

export interface CustomerAnalysisResult {
  summary: string;
  intent: string;
  sentiment: CustomerSentiment;
  suggestions: string[];
}

export interface CustomerAnalysisInput {
  tenantId: string;
  customerId: string;
  conversationId?: string | null;
  customerName?: string | null;
  customerLanguage?: string | null;
  profileSummary?: string | null;
  latestInsight?: {
    summary: string;
    lastIntent: string;
    lastSentiment: string;
    keyEntities: {
      orderIds: string[];
      phones: string[];
      addresses: string[];
    };
  } | null;
  memoryItems: Array<{
    memoryType: string;
    title: string | null;
    summary: string;
    salience: number;
  }>;
  stateSnapshots: Array<{
    stateType: string;
    payload: Record<string, unknown>;
  }>;
  history: Array<{
    summary: string | null;
    intent: string | null;
    sentiment: string | null;
  }>;
  orderClues: string[];
}

const CUSTOMER_ANALYSIS_SYSTEM = `You generate customer-level analysis for a human support agent.
Use the durable customer context, not just the latest turn.
Return valid JSON only.

Return exactly this shape:
{
  "summary": "<2-4 sentences describing this customer, durable preferences/issues, current context, and what the agent should keep in mind>",
  "intent": "<best current intent label>",
  "sentiment": "<one of: positive | neutral | negative | angry>",
  "suggestions": [
    "<short agent guidance item>",
    "<short agent guidance item>",
    "<short agent guidance item>"
  ]
}

Rules:
- Prioritize stable profile, unresolved issues, commitments, preferences, and current active states.
- Do not invent facts.
- Suggestions are internal agent guidance, not customer-facing replies.
- Keep suggestions concise and actionable.`;

export class CustomerAnalysisService {
  async generate(
    db: Knex | Knex.Transaction,
    input: CustomerAnalysisInput
  ): Promise<CustomerAnalysisResult> {
    const fallback = buildFallbackAnalysis(input);
    if (!hasMeaningfulAnalysisContext(input)) {
      return fallback;
    }

    const aiSettings = await resolveTenantAISettings(db, input.tenantId);
    if (!aiSettings) {
      return fallback;
    }

    const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
    if (!budgetGate.allowed) {
      return fallback;
    }

    const completion = await aiSettings.provider.complete({
      model: aiSettings.model,
      messages: [
        { role: "system", content: CUSTOMER_ANALYSIS_SYSTEM },
        { role: "user", content: buildCustomerAnalysisPrompt(input) }
      ],
      temperature: Math.min(0.35, Math.max(0, aiSettings.temperature)),
      maxTokens: Math.min(1200, Math.max(500, aiSettings.maxTokens)),
      responseFormat: "json_object"
    }).catch(() => null);

    if (!completion) {
      return fallback;
    }

    const parsed = parseAnalysisResult(completion.content ?? "", fallback);

    await recordAIUsage(db, {
      tenantId: input.tenantId,
      provider: aiSettings.providerName,
      model: aiSettings.model,
      feature: "customer_analysis",
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      metadata: {
        customerId: input.customerId,
        conversationId: input.conversationId ?? null
      }
    });

    return parsed;
  }
}

function hasMeaningfulAnalysisContext(input: CustomerAnalysisInput) {
  return Boolean(
    (input.profileSummary && input.profileSummary.trim()) ||
    (input.latestInsight?.summary && input.latestInsight.summary.trim()) ||
    input.memoryItems.length > 0 ||
    input.stateSnapshots.length > 0 ||
    input.history.some((item) => item.summary?.trim())
  );
}

function buildCustomerAnalysisPrompt(input: CustomerAnalysisInput) {
  const memoryLines = input.memoryItems
    .slice(0, 8)
    .map((item) => `- [${item.memoryType}] salience=${item.salience}${item.title ? ` title=${item.title}` : ""} summary=${item.summary}`);
  const stateLines = input.stateSnapshots
    .slice(0, 6)
    .map((item) => `- ${item.stateType}: ${JSON.stringify(item.payload).slice(0, 220)}`);
  const historyLines = input.history
    .slice(0, 6)
    .map((item, index) => `- Case ${index + 1}: summary=${item.summary ?? "n/a"} | intent=${item.intent ?? "n/a"} | sentiment=${item.sentiment ?? "n/a"}`);

  return [
    `Customer name: ${input.customerName?.trim() || "Unknown"}`,
    `Customer language: ${input.customerLanguage?.trim() || "unknown"}`,
    `Profile summary: ${input.profileSummary?.trim() || "n/a"}`,
    `Latest conversation insight: ${input.latestInsight?.summary?.trim() || "n/a"}`,
    `Latest intent: ${input.latestInsight?.lastIntent || "n/a"}`,
    `Latest sentiment: ${input.latestInsight?.lastSentiment || "n/a"}`,
    `Order clues: ${input.orderClues.join(", ") || "n/a"}`,
    "",
    "Top long-term memories:",
    memoryLines.length > 0 ? memoryLines.join("\n") : "- none",
    "",
    "Active states:",
    stateLines.length > 0 ? stateLines.join("\n") : "- none",
    "",
    "Recent history:",
    historyLines.length > 0 ? historyLines.join("\n") : "- none"
  ].join("\n");
}

function buildFallbackAnalysis(input: CustomerAnalysisInput): CustomerAnalysisResult {
  const salientMemories = input.memoryItems
    .filter((item) => item.salience >= 70)
    .slice(0, 3)
    .map((item) => item.title ?? item.summary);
  const activeStates = input.stateSnapshots
    .slice(0, 3)
    .map((item) => item.stateType);
  const recentHistory = input.history
    .map((item) => item.summary?.trim() || "")
    .filter(Boolean)
    .slice(0, 2);

  const summaryParts = [
    input.profileSummary?.trim() ? `画像：${input.profileSummary.trim().slice(0, 180)}` : null,
    input.latestInsight?.summary?.trim() ? `当前会话：${input.latestInsight.summary.trim().slice(0, 160)}` : null,
    salientMemories.length > 0 ? `长期记忆：${salientMemories.join("；")}` : null,
    activeStates.length > 0 ? `活跃状态：${activeStates.join("、")}` : null,
    recentHistory.length > 0 ? `近期历史：${recentHistory.join("；")}` : null
  ].filter(Boolean);

  const suggestions = [
    input.orderClues.length > 0 ? `优先核对订单线索：${input.orderClues.slice(0, 2).join("、")}` : null,
    salientMemories.length > 0 ? "回复前先参考客户长期记忆与偏好" : null,
    activeStates.length > 0 ? "留意当前状态对回复语气和承诺范围的影响" : null
  ].filter((item): item is string => Boolean(item));

  return {
    summary: summaryParts.join("\n") || "暂无客户级 AI 分析",
    intent: input.latestInsight?.lastIntent ?? input.history.find((item) => item.intent)?.intent ?? "general_inquiry",
    sentiment: normalizeSentiment(input.latestInsight?.lastSentiment ?? input.history.find((item) => item.sentiment)?.sentiment),
    suggestions: suggestions.length > 0 ? suggestions : ["先结合画像、长期记忆和当前会话再做判断"]
  };
}

function parseAnalysisResult(raw: string, fallback: CustomerAnalysisResult): CustomerAnalysisResult {
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerAnalysisResult>;
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 600)
        : fallback.summary,
      intent: typeof parsed.intent === "string" && parsed.intent.trim()
        ? parsed.intent.trim().slice(0, 80)
        : fallback.intent,
      sentiment: normalizeSentiment(parsed.sentiment),
      suggestions: normalizeSuggestions(parsed.suggestions, fallback.suggestions)
    };
  } catch {
    return fallback;
  }
}

function normalizeSuggestions(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeSentiment(value: unknown): CustomerSentiment {
  if (value === "positive" || value === "neutral" || value === "negative" || value === "angry") {
    return value;
  }
  return "neutral";
}
