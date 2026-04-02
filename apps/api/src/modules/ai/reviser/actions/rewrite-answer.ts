/**
 * Action: rewrite_answer
 *
 * 携带 FactSnapshot 重走最终 LLM 轮 — 当 verifier 判定回答与事实冲突
 * 或忽略了多模态输入时，强制重新生成回复。
 *
 * 使用 correction prompt 引导 LLM 修正，不改变原有 loopMessages 结构。
 * 限制：最多重写 1 次，避免无限循环。
 */

import type { ReviserPointBContext, ReviserOutcome } from "../types.js";
import { formatFactSnapshotForPrompt } from "../../fact-layer.service.js";

const REWRITE_PROMPT = `You are correcting your previous answer based on evaluator feedback.

CRITICAL RULES:
- Your previous answer contained factual errors or omissions flagged by the evaluator.
- You MUST base your corrected answer strictly on the verified facts provided below.
- Do NOT contradict verified facts.
- If the customer sent an image/file, acknowledge it explicitly.
- Respond with valid JSON in the same contract format as before.
- Keep the response concise and customer-facing.`;

/**
 * Re-run the final LLM turn with a correction prompt.
 *
 * Cost-aware: only rewrites when at least one finding has "critical" severity.
 * Lower-severity findings are logged but don't justify the extra LLM call —
 * the original answer is "good enough" and the human agent can refine if needed.
 */
export async function executePointBRewrite(ctx: ReviserPointBContext): Promise<ReviserOutcome> {
  if (ctx.verdict.action !== "rewrite_answer") {
    return {
      action: "pass",
      modified: false,
      summary: "Point B: no rewrite needed.",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }

  const triggeredFindings = ctx.verdict.findings.filter((f) => f.triggered);

  // Cost guard: only spend an extra LLM call if at least one finding is critical.
  // Warning-level findings (e.g. weak keyword matches) don't justify the token cost.
  const hasCritical = triggeredFindings.some((f) => f.severity === "critical");
  if (!hasCritical) {
    return {
      action: "pass",
      modified: false,
      summary: `Point B: rewrite skipped — no critical findings (${triggeredFindings.length} non-critical findings logged).`,
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }

  const evaluatorFeedback = triggeredFindings
    .map((f) => `- [${f.ruleId}] ${f.reason}`)
    .join("\n");

  const factContext = formatFactSnapshotForPrompt(ctx.factSnapshot);

  // Build correction messages: keep original history, append correction instructions
  const correctionMessages = [
    ...ctx.loopMessages,
    {
      role: "system" as const,
      content: [
        REWRITE_PROMPT,
        "",
        "Evaluator findings:",
        evaluatorFeedback,
        "",
        factContext ?? "No additional verified facts available."
      ].join("\n")
    }
  ];

  try {
    const result = await ctx.llm.provider.complete({
      model: ctx.llm.model,
      messages: correctionMessages,
      maxTokens: ctx.llm.maxTokens,
      temperature: Math.min(0.3, ctx.llm.temperature),
      responseFormat: "json_object"
    });

    return {
      action: "rewrite_answer",
      modified: true,
      revisedContent: result.content,
      summary: `Point B reviser: answer rewritten (${triggeredFindings.length} findings corrected).`,
      extraInputTokens: result.inputTokens,
      extraOutputTokens: result.outputTokens
    };
  } catch {
    // If rewrite fails, fall through — better to send the original than nothing
    return {
      action: "rewrite_answer",
      modified: false,
      summary: "Point B reviser: rewrite LLM call failed, keeping original answer.",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }
}
