/**
 * Rule: should_handoff_to_human
 *
 * 应该转人工 — 检查是否满足转人工条件：
 * - 客户明确要求转人工
 * - 情绪极端激动（多次投诉关键词）
 * - 连续多轮 tool 失败
 *
 * 插入点 B only: 最终回复前评估是否需要强制转人工。
 */

import type { VerifierRule, PointBContext, RuleFinding } from "../types.js";

/** Customer explicitly requests human agent */
const HANDOFF_REQUEST_KEYWORDS = [
  "转人工", "人工客服", "真人", "找人", "不要机器人",
  "transfer", "human agent", "real person", "speak to someone",
  "bicara dengan orang", "agen manusia", "bukan robot"
];

/** Strong negative emotion keywords (need 2+ to trigger) */
const ANGRY_KEYWORDS = [
  "投诉", "差评", "骗子", "骗人", "曝光", "举报", "工商", "315",
  "fraud", "scam", "report", "complaint", "lawyer", "legal",
  "penipuan", "lapor", "tipu"
];

function customerRequestsHandoff(messages: Array<{ role: string; content: unknown }>): boolean {
  const recentCustomer = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => (typeof m.content === "string" ? m.content : "").toLowerCase());
  const combined = recentCustomer.join(" ");
  return HANDOFF_REQUEST_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));
}

function customerIsExtremelySensitive(messages: Array<{ role: string; content: unknown }>): boolean {
  const recentCustomer = messages
    .filter((m) => m.role === "user")
    .slice(-5)
    .map((m) => (typeof m.content === "string" ? m.content : "").toLowerCase());
  const combined = recentCustomer.join(" ");
  let count = 0;
  for (const kw of ANGRY_KEYWORDS) {
    if (combined.includes(kw.toLowerCase())) count++;
  }
  return count >= 2;
}

export const shouldHandoffRule: VerifierRule = {
  id: "should_handoff_to_human",
  points: ["B"],

  evaluateB(ctx: PointBContext): RuleFinding {
    const explicitRequest = customerRequestsHandoff(ctx.chatHistory);
    if (explicitRequest) {
      return {
        ruleId: "should_handoff_to_human",
        triggered: true,
        severity: "critical",
        reason: "Customer explicitly requested a human agent."
      };
    }

    const extremeEmotion = customerIsExtremelySensitive(ctx.chatHistory);
    if (extremeEmotion) {
      return {
        ruleId: "should_handoff_to_human",
        triggered: true,
        severity: "critical",
        reason: "Customer shows extreme negative emotion (multiple anger keywords detected)."
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
