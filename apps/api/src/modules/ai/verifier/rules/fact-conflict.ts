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
 *
 * Strategy: if a verified fact has a status value and the answer contains
 * a negation of that status (e.g., verified="completed" but answer says
 * "not completed"), flag it as a conflict.
 *
 * This is a generic negation-detection heuristic — not tied to any industry.
 */
function detectConflict(
  finalContent: string,
  facts: Array<{ keyFacts: { status: string | null; location: string | null; time: string | null } | null }>
): string | null {
  const content = finalContent.toLowerCase();
  for (const fact of facts) {
    if (!fact.keyFacts) continue;
    const { status } = fact.keyFacts;

    if (status) {
      const normalizedStatus = status.toLowerCase();
      // Generic negation patterns: if the verified status contains X,
      // check if the answer says "not X", "未X", "belum X", etc.
      const negationPrefixes = ["not ", "no ", "未", "没有", "belum ", "tidak "];
      for (const prefix of negationPrefixes) {
        // Check if answer contains "not <status>" or "<neg-prefix><status>"
        if (content.includes(`${prefix}${normalizedStatus}`)) {
          return `Answer says "${prefix}${normalizedStatus}" but verified status is "${status}"`;
        }
      }
      // Also check the reverse: if verified status starts with a negation
      // but the answer asserts the positive
      for (const prefix of negationPrefixes) {
        if (normalizedStatus.startsWith(prefix)) {
          const positive = normalizedStatus.slice(prefix.length);
          // Only flag if the positive form appears as a standalone assertion
          if (positive.length >= 3 && content.includes(positive) && !content.includes(normalizedStatus)) {
            return `Answer asserts "${positive}" but verified status is "${status}"`;
          }
        }
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
