/**
 * Rule: answer_conflicts_with_verified_facts
 *
 * 回复与最新事实冲突 — 检查 LLM 最终回复是否与 verified facts 中的
 * 关键字段（status / location / time）存在明显矛盾。
 *
 * 插入点 B only: 只在最终回复生成后评估。
 *
 * 注意：这是一个基于规则的轻量检查，不调用 LLM。
 * 只检查最明显的冲突（verified fact 的关键字段出现在回复中但值不匹配）。
 */

import type { VerifierRule, PointBContext, RuleFinding } from "../types.js";

/**
 * Check if the final answer contradicts known verified facts.
 * Uses simple keyword presence heuristic — not LLM-based.
 */
function detectConflict(
  finalContent: string,
  facts: Array<{ keyFacts: { status: string | null; location: string | null; time: string | null } | null }>
): string | null {
  const content = finalContent.toLowerCase();
  for (const fact of facts) {
    if (!fact.keyFacts) continue;
    const { status, location } = fact.keyFacts;

    // If verified status exists and answer contains a contradictory status keyword
    if (status) {
      const normalizedStatus = status.toLowerCase();
      // Check for explicit contradictions: e.g., verified="已签收" but answer says "未签收"/"未送达"
      const contradictions: Array<[string, string[]]> = [
        ["已签收", ["未签收", "未送达", "未到达", "未收到", "belum diterima", "not delivered"]],
        ["已发货", ["未发货", "belum dikirim", "not shipped"]],
        ["已退款", ["未退款", "belum dikembalikan", "not refunded"]],
        ["delivered", ["not delivered", "undelivered", "未签收"]],
        ["shipped", ["not shipped", "未发货"]],
        ["refunded", ["not refunded", "未退款"]]
      ];
      for (const [truthKeyword, conflictKeywords] of contradictions) {
        if (normalizedStatus.includes(truthKeyword)) {
          for (const ck of conflictKeywords) {
            if (content.includes(ck)) {
              return `Answer says "${ck}" but verified status is "${status}"`;
            }
          }
        }
      }
    }

    // If verified location exists, check the answer doesn't claim a completely different location
    // (lightweight: only flag if answer explicitly says "not in <location>" or "未到达<location>")
    if (location) {
      const loc = location.toLowerCase();
      if (
        (content.includes("未到达") && content.includes(loc)) ||
        (content.includes("not in") && content.includes(loc))
      ) {
        return `Answer contradicts verified location "${location}"`;
      }
    }
  }
  return null;
}

export const factConflictRule: VerifierRule = {
  id: "answer_conflicts_with_verified_facts",
  points: ["B"],

  evaluateB(ctx: PointBContext): RuleFinding {
    if (ctx.runVerifiedFacts.length === 0) {
      return {
        ruleId: "answer_conflicts_with_verified_facts",
        triggered: false,
        severity: "info",
        reason: "No verified facts to compare against."
      };
    }

    const conflict = detectConflict(ctx.finalContent, ctx.runVerifiedFacts);
    return {
      ruleId: "answer_conflicts_with_verified_facts",
      triggered: !!conflict,
      severity: conflict ? "critical" : "info",
      reason: conflict ?? "No conflict detected between answer and verified facts."
    };
  }
};
