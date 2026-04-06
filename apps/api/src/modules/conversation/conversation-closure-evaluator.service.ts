import type { Knex } from "knex";
import type { AIMessage } from "../../../../../packages/ai-sdk/src/index.ts";

import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage } from "../ai/usage-meter.service.js";
import { buildCallContext, trackedComplete } from "../ai/call-context.js";

type MsgRow = {
  direction: string;
  sender_type: string;
  created_at: string | Date | null;
  content: { text?: string | null } | null;
};

type ConversationScopeRow = {
  current_case_id: string | null;
  current_segment_id: string | null;
};

type CaseRow = {
  summary: string | null;
};

export type ConversationClosureVerdict = {
  verdict: "close" | "continue" | "unknown";
  confidence: number;
  reason: string;
};

const CLOSURE_SYSTEM_PROMPT = `You evaluate whether a customer-service conversation has naturally concluded.

Return JSON only:
{"verdict":"close|continue|unknown","confidence":0-1,"reason":"short_reason"}

Rules:
- close: the user's need appears resolved or the customer clearly ended the exchange.
- continue: there is an unresolved request, pending action, complaint, or follow-up expected.
- unknown: insufficient evidence.
- Be conservative. If uncertain, return unknown.`;

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CASE_SUMMARY_CHARS = 600;

export class ConversationClosureEvaluatorService {
  async evaluate(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
    }
  ): Promise<ConversationClosureVerdict> {
    const aiSettings = await resolveTenantAISettingsForScene(db, input.tenantId, "ai_seat");
    if (!aiSettings) {
      return { verdict: "unknown", confidence: 0, reason: "no_ai_provider" };
    }

    const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
    if (!budgetGate.allowed) {
      return { verdict: "unknown", confidence: 0, reason: "ai_budget_blocked" };
    }

    const scope = await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("current_case_id", "current_segment_id")
      .first<ConversationScopeRow | undefined>();

    if (!scope?.current_case_id) {
      return { verdict: "unknown", confidence: 0, reason: "no_current_case" };
    }

    const caseRow = await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: scope.current_case_id })
      .select("summary")
      .first<CaseRow | undefined>();

    const baseQuery = db("messages")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        case_id: scope.current_case_id
      })
      .whereNotNull("content");

    const totalRow = await baseQuery
      .clone()
      .count<{ cnt: string }>("message_id as cnt")
      .first();

    const rows = await baseQuery
      .clone()
      .select("direction", "sender_type", "created_at", "content")
      .orderBy("created_at", "desc")
      .limit(MAX_CONTEXT_MESSAGES) as MsgRow[];

    const totalMessages = Number(totalRow?.cnt ?? 0);

    const messages = rows
      .reverse()
      .filter((row) => row.content?.text)
      .map((row) => ({
        role: row.direction === "outbound" ? "assistant" : "user",
        content: `${row.sender_type} @ ${formatTimestamp(row.created_at)}: ${row.content?.text ?? ""}`
      })) as AIMessage[];

    if (messages.length === 0) {
      return { verdict: "unknown", confidence: 0, reason: "no_text_messages" };
    }

    const scopedPrelude = buildScopedPrelude({
      caseId: scope.current_case_id,
      segmentId: scope.current_segment_id,
      caseSummary: caseRow?.summary ?? null,
      totalMessages
    });

    const ctx = buildCallContext(db, aiSettings, input, "closure_evaluator");

    try {
      const completion = await trackedComplete(ctx, {
        messages: [
          { role: "system", content: CLOSURE_SYSTEM_PROMPT },
          { role: "system", content: scopedPrelude },
          ...messages
        ],
        responseFormat: "json_object",
        maxTokens: Math.min(200, aiSettings.maxTokens),
        temperature: 0
      }, { conversationId: input.conversationId });

      const parsed = safeParseJson(completion.content);
      const verdict = parsed.verdict === "close" || parsed.verdict === "continue" || parsed.verdict === "unknown"
        ? parsed.verdict
        : "unknown";
      const confidence = typeof parsed.confidence === "number" && !Number.isNaN(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
      const reason = typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "llm_no_reason";

      return { verdict, confidence, reason };
    } catch (error) {
      return {
        verdict: "unknown",
        confidence: 0,
        reason: error instanceof Error ? error.message.slice(0, 120) : "closure_eval_failed"
      };
    }
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatTimestamp(value: string | Date | null | undefined) {
  if (!value) return "unknown_time";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown_time" : date.toISOString();
}

function buildScopedPrelude(input: {
  caseId: string;
  segmentId: string | null;
  caseSummary: string | null;
  totalMessages: number;
}) {
  const lines = [
    `Scope: current service round only.`,
    `Current case id: ${input.caseId}.`,
    input.segmentId ? `Current segment id: ${input.segmentId}.` : null,
    `Do not assume older rounds in this conversation are relevant.`,
    input.totalMessages > MAX_CONTEXT_MESSAGES
      ? `This round has ${input.totalMessages} messages. Only the most recent ${MAX_CONTEXT_MESSAGES} text messages are included below.`
      : `This round has ${input.totalMessages} text messages in scope.`
  ].filter(Boolean);

  const trimmedSummary = typeof input.caseSummary === "string" ? input.caseSummary.trim() : "";
  if (trimmedSummary) {
    lines.push(`Round summary: ${trimmedSummary.slice(0, MAX_CASE_SUMMARY_CHARS)}`);
  }

  return lines.join("\n");
}
