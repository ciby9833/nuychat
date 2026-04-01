/**
 * Reviser Service — Harness Engineering Corrector Layer
 *
 * 接收 Verifier 的 VerifierVerdict，执行对应的修正动作：
 * - continue_tools: 注入提示让 LLM 继续调 tool
 * - rewrite_answer: 重走 LLM 最终轮，修正回复
 * - clarify: 生成澄清问题
 * - handoff: 强制转人工
 *
 * 只用于 AI 座席主链。Copilot 不需要 Reviser。
 */

import type { ReviserOutcome, ReviserPointAContext, ReviserPointBContext } from "./types.js";
import { executePointAContinueTools } from "./actions/continue-tools.js";
import { executePointBRewrite } from "./actions/rewrite-answer.js";
import { executePointBClarify } from "./actions/clarify.js";
import { executePointBHandoff } from "./actions/handoff.js";

// ─── Point A revision ────────────────────────────────────────────────────────

/**
 * Run Point A reviser after verifier.
 * Only action: continue_tools (inject hint message for next LLM loop).
 */
export function revisePointA(ctx: ReviserPointAContext): ReviserOutcome {
  return executePointAContinueTools(ctx);
}

// ─── Point B revision ────────────────────────────────────────────────────────

/**
 * Run Point B reviser after verifier.
 * Priority: handoff > rewrite_answer > clarify > pass.
 */
export async function revisePointB(ctx: ReviserPointBContext): Promise<ReviserOutcome> {
  const action = ctx.verdict.action;

  if (action === "handoff") {
    return executePointBHandoff(ctx);
  }
  if (action === "rewrite_answer") {
    return executePointBRewrite(ctx);
  }
  if (action === "clarify") {
    return executePointBClarify(ctx);
  }

  return {
    action: "pass",
    modified: false,
    summary: "No revision needed.",
    extraInputTokens: 0,
    extraOutputTokens: 0
  };
}
