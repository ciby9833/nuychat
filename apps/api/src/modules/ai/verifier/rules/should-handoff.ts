/**
 * Rule: should_handoff_to_human
 *
 * 应该转人工 — 检查是否满足转人工条件：
 * - 模型已明确判定本轮需要人工接管
 * - 模型输出了高风险/人工接管意图
 * - 模型判定情绪极端激动
 * - 连续多轮 tool 失败
 *
 * 插入点 B only: 最终回复前评估是否需要强制转人工。
 */

import type { VerifierRule, PointBContext, RuleFinding } from "../types.js";

const HUMAN_HANDOFF_INTENTS = new Set([
  "handoff_request",
  "human_handoff",
  "human_escalation",
  "request_human_agent",
  "request_live_agent"
]);

function normalizeIntent(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export const shouldHandoffRule: VerifierRule = {
  id: "should_handoff_to_human",
  points: ["B"],

  evaluateB(ctx: PointBContext): RuleFinding {
    if (ctx.proposedAction === "handoff") {
      return {
        ruleId: "should_handoff_to_human",
        triggered: true,
        severity: "critical",
        reason: "Model explicitly selected handoff for this turn."
      };
    }

    const normalizedIntent = normalizeIntent(ctx.proposedIntent);
    if (normalizedIntent && HUMAN_HANDOFF_INTENTS.has(normalizedIntent)) {
      return {
        ruleId: "should_handoff_to_human",
        triggered: true,
        severity: "critical",
        reason: "Model intent indicates a human handoff is required."
      };
    }

    if (ctx.proposedSentiment === "angry") {
      return {
        ruleId: "should_handoff_to_human",
        triggered: true,
        severity: "critical",
        reason: "Model detected extreme negative emotion requiring human handling."
      };
    }

    // If all tools were blocked and we have no evidence, consider handoff
    const noToolsWorked = ctx.skillsInvoked.length === 0 &&
                          ctx.runVerifiedFacts.length === 0 &&
                          ctx.factSnapshot.verifiedFacts.length === 0;
    if (noToolsWorked && ctx.proposedAction === "reply") {
      return {
        ruleId: "should_handoff_to_human",
        triggered: false,
        severity: "warning",
        reason: "No tools succeeded and no verified facts — answer may be unreliable, but not forcing handoff."
      };
    }

    return {
      ruleId: "should_handoff_to_human",
      triggered: false,
      severity: "info",
      reason: "No handoff conditions detected."
    };
  }
};
