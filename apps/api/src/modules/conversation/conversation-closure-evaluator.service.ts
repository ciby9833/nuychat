import type { Knex } from "knex";
import type { AIMessage } from "../../../../../packages/ai-sdk/src/index.ts";

import { resolveTenantAISettings } from "../ai/provider-config.service.js";

type MsgRow = {
  direction: string;
  sender_type: string;
  content: { text?: string | null } | null;
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

export class ConversationClosureEvaluatorService {
  async evaluate(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
    }
  ): Promise<ConversationClosureVerdict> {
    const aiSettings = await resolveTenantAISettings(db, input.tenantId);
    if (!aiSettings) {
      return { verdict: "unknown", confidence: 0, reason: "no_ai_provider" };
    }

    const rows = await db("messages")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("direction", "sender_type", "content")
      .orderBy("created_at", "desc")
      .limit(8) as MsgRow[];

    const messages = rows
      .reverse()
      .filter((row) => row.content?.text)
      .map((row) => ({
        role: row.direction === "outbound" ? "assistant" : "user",
        content: `${row.sender_type}: ${row.content?.text ?? ""}`
      })) as AIMessage[];

    if (messages.length === 0) {
      return { verdict: "unknown", confidence: 0, reason: "no_text_messages" };
    }

    try {
      const completion = await aiSettings.provider.complete({
        model: aiSettings.model,
        messages: [
          { role: "system", content: CLOSURE_SYSTEM_PROMPT },
          ...messages
        ],
        responseFormat: "json_object",
        maxTokens: Math.min(200, aiSettings.maxTokens),
        temperature: 0
      });

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
