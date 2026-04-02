/**
 * Action: clarify
 *
 * 生成澄清问题 — 当 verifier 判定证据严重不足（critical severity）
 * 且无法通过 tool 获取时，主动向客户提问以获取必要信息。
 *
 * 生成的澄清内容会覆盖原始回复，作为 response 返回。
 */

import type { ReviserPointBContext, ReviserOutcome } from "../types.js";

const CLARIFY_PROMPT = `You are a customer service AI that needs more information to help the customer.

Based on the evaluator feedback below, generate a polite clarification question.

RULES:
- Ask for exactly the information that is missing (e.g., reference number, account details, specific issue description).
- Be concise — one or two sentences maximum.
- Use the same language as the customer's last message.
- Do NOT pretend you have information you don't have.
- Respond with valid JSON: {"action":"reply","response":"<your clarification question>","intent":"clarification_request","sentiment":"neutral","confidence":0.8}`;

/**
 * Generate a clarification question via LLM.
 * Falls back to a static clarification if the LLM call fails.
 */
export async function executePointBClarify(ctx: ReviserPointBContext): Promise<ReviserOutcome> {
  if (ctx.verdict.action !== "clarify") {
    return {
      action: "pass",
      modified: false,
      summary: "Point B: no clarification needed.",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }

  const triggeredFindings = ctx.verdict.findings.filter((f) => f.triggered);
  const evaluatorFeedback = triggeredFindings
    .map((f) => `- [${f.ruleId}] ${f.reason}`)
    .join("\n");

  const clarifyMessages = [
    ...ctx.loopMessages,
    {
      role: "system" as const,
      content: `${CLARIFY_PROMPT}\n\nEvaluator findings:\n${evaluatorFeedback}`
    }
  ];

  try {
    const result = await ctx.llm.provider.complete({
      model: ctx.llm.model,
      messages: clarifyMessages,
      maxTokens: Math.min(300, ctx.llm.maxTokens),
      temperature: 0.3,
      responseFormat: "json_object"
    });

    return {
      action: "clarify",
      modified: true,
      revisedContent: result.content,
      summary: `Point B reviser: clarification generated (${triggeredFindings.length} findings).`,
      extraInputTokens: result.inputTokens,
      extraOutputTokens: result.outputTokens
    };
  } catch {
    // Fallback: static clarification in English (LLM will match customer language in normal flow)
    const fallback = JSON.stringify({
      action: "reply",
      response: "Could you please provide more details or a reference number so I can assist you better?",
      intent: "clarification_request",
      sentiment: "neutral",
      confidence: 0.6
    });

    return {
      action: "clarify",
      modified: true,
      revisedContent: fallback,
      summary: "Point B reviser: clarification fallback (LLM call failed).",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }
}
