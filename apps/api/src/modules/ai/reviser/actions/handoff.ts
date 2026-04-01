/**
 * Action: handoff
 *
 * 直接转人工 — 当 verifier 判定高风险（客户要求转人工、情绪极端等）时，
 * 强制 handoff，不再尝试 AI 回复。
 *
 * 汇总 verifier findings 作为 handoff reason，供座席参考。
 */

import type { ReviserPointBContext, ReviserOutcome } from "../types.js";

/**
 * Build a handoff outcome with a clear reason summary.
 */
export function executePointBHandoff(ctx: ReviserPointBContext): ReviserOutcome {
  if (ctx.verdict.action !== "handoff") {
    return {
      action: "pass",
      modified: false,
      summary: "Point B: no handoff needed.",
      extraInputTokens: 0,
      extraOutputTokens: 0
    };
  }

  const triggeredFindings = ctx.verdict.findings.filter((f) => f.triggered);
  const handoffReason = triggeredFindings
    .map((f) => f.reason)
    .join("; ");

  return {
    action: "handoff",
    modified: true,
    handoffReason: handoffReason || "Verifier triggered forced handoff.",
    summary: `Point B reviser: forced handoff (${triggeredFindings.length} findings).`,
    extraInputTokens: 0,
    extraOutputTokens: 0
  };
}
