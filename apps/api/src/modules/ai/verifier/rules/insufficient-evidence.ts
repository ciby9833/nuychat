/**
 * Rule: insufficient_tool_evidence
 *
 * 证据不足 — 客户问了具体问题（订单/物流/退款等），
 * 但当前 verified facts 为空且尚未调用任何 tool。
 *
 * 插入点 A: 评估当前 loop 是否需要继续调 tool 获取证据。
 * 插入点 B: 评估最终回复是否缺乏事实支撑。
 */

import type { VerifierRule, PointAContext, PointBContext, RuleFinding } from "../types.js";

/** Keywords indicating the customer asked a specific/factual question */
const SPECIFIC_QUESTION_KEYWORDS = [
  "订单", "物流", "快递", "退款", "退货", "换货", "发货",
  "tracking", "order", "refund", "delivery", "shipment",
  "pengiriman", "pesanan", "resi",
  "单号", "运单", "status", "状态"
];

function customerAskedSpecificQuestion(messages: Array<{ role: string; content: unknown }>): boolean {
  const customerTexts = messages
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : "").toLowerCase());
  const lastTwo = customerTexts.slice(-2).join(" ");
  return SPECIFIC_QUESTION_KEYWORDS.some((kw) => lastTwo.includes(kw.toLowerCase()));
}

export const insufficientEvidenceRule: VerifierRule = {
  id: "insufficient_tool_evidence",
  points: ["A", "B"],

  evaluateA(ctx: PointAContext): RuleFinding {
    const hasEvidence = ctx.runVerifiedFacts.length > 0;
    const hasInvokedSkills = ctx.skillsInvoked.length > 0;
    const askedSpecific = customerAskedSpecificQuestion(ctx.chatHistory);

    // If customer asked a specific question but we have no evidence and haven't
    // called any tool yet, flag it
    const triggered = askedSpecific && !hasEvidence && !hasInvokedSkills;

    return {
      ruleId: "insufficient_tool_evidence",
      triggered,
      severity: triggered ? "warning" : "info",
      reason: triggered
        ? "Customer asked a specific question but no tool has been invoked and no verified facts exist."
        : "Evidence is available or no specific question detected."
    };
  },

  evaluateB(ctx: PointBContext): RuleFinding {
    const hasEvidence = ctx.runVerifiedFacts.length > 0;
    const askedSpecific = customerAskedSpecificQuestion(ctx.chatHistory);

    // At Point B: if customer asked specific question but final answer has no
    // backing facts at all
    const triggered = askedSpecific && !hasEvidence && ctx.skillsInvoked.length === 0;

    return {
      ruleId: "insufficient_tool_evidence",
      triggered,
      severity: triggered ? "critical" : "info",
      reason: triggered
        ? "Final answer has no verified fact support for a specific customer question."
        : "Evidence is present or no specific question detected."
    };
  }
};
