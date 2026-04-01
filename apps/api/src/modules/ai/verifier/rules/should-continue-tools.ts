/**
 * Rule: should_continue_tool_loop
 *
 * 应该继续调 tool — 在 agent loop 中间评估：
 * 如果客户问了具体问题、已有候选 tool 可用、但尚未获得完整证据，
 * 建议继续 loop（不提前 break）。
 *
 * 插入点 A only: 只在 agent loop 内部评估。
 */

import type { VerifierRule, PointAContext, RuleFinding } from "../types.js";

export const shouldContinueToolsRule: VerifierRule = {
  id: "should_continue_tool_loop",
  points: ["A"],

  evaluateA(ctx: PointAContext): RuleFinding {
    // If we're already at the last iteration, can't continue anyway
    if (ctx.loopIndex >= ctx.maxLoops - 1) {
      return {
        ruleId: "should_continue_tool_loop",
        triggered: false,
        severity: "info",
        reason: "Already at max loop iteration."
      };
    }

    // If tools were invoked but all results are errors/blocks, suggest continuing
    // to try alternative approaches
    const allBlocked = ctx.skillsInvoked.length === 0 && ctx.skillsBlocked.length > 0;
    if (allBlocked) {
      return {
        ruleId: "should_continue_tool_loop",
        triggered: false,
        severity: "info",
        reason: "All tool attempts were blocked — continuing won't help."
      };
    }

    // Check if we invoked tools but got no meaningful verified facts
    const invokedButNoFacts = ctx.skillsInvoked.length > 0 && ctx.runVerifiedFacts.length === 0;

    // Check if tool results contain error indicators
    const lastToolMessages = ctx.loopMessages.filter((m) => m.role === "tool");
    const hasErrorResults = lastToolMessages.some((m) => {
      const text = typeof m.content === "string" ? m.content : "";
      try {
        const parsed = JSON.parse(text);
        return parsed.error || parsed.status === "runtime_error";
      } catch {
        return false;
      }
    });

    // If tools were called but returned errors and we haven't exhausted loops,
    // suggest continuing
    const triggered = invokedButNoFacts || hasErrorResults;

    return {
      ruleId: "should_continue_tool_loop",
      triggered,
      severity: triggered ? "warning" : "info",
      reason: triggered
        ? invokedButNoFacts
          ? "Tools were invoked but no verified facts extracted — may need retry or alternative tool."
          : "Tool results contain errors — may need retry with different parameters."
        : "Tool execution produced verified facts successfully."
    };
  }
};
