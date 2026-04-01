/**
 * Action: continue_tools
 *
 * 补调下一个 tool — 复用现有 agent loop。
 * Reviser 在 Point A 判断 verifier 说 "continue_tools" 时，
 * 向 loopMessages 注入一条系统提示，引导 LLM 在下一轮调用合适的 tool。
 *
 * 这不是硬编码调用，而是"软引导" — LLM 仍然自主选择 tool。
 */

import type { ReviserPointAContext, ReviserOutcome } from "../types.js";

/**
 * Inject a hint message so the LLM knows it should call a tool in the next iteration.
 * Returns the outcome; the caller is responsible for pushing the hint into loopMessages.
 */
export function executePointAContinueTools(ctx: ReviserPointAContext): ReviserOutcome {
  if (ctx.verdict.action !== "continue_tools") {
    return {
      action: "pass",
      modified: false,
      summary: "Point A: no continue_tools needed.",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }

  // Build a concise hint based on which rules triggered
  const triggeredReasons = ctx.verdict.findings
    .filter((f) => f.triggered)
    .map((f) => f.reason);

  const hint = [
    "The evaluator detected that the current evidence is insufficient to answer the customer.",
    ...triggeredReasons.map((r) => `- ${r}`),
    "Please use an available tool to retrieve the required information before responding."
  ].join("\n");

  return {
    action: "continue_tools",
    modified: true,
    revisedContent: hint,
    summary: `Point A reviser: injecting tool-call hint (${triggeredReasons.length} reasons).`,
    extraInputTokens: 0,
    extraOutputTokens: 0
  };
}
