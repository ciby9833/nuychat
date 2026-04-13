/**
 * Verifier / Evaluator Layer — Types
 *
 * Harness Engineering: 生成-评估分离。
 * Verifier 在两个关键点评估 orchestrator 的中间态和最终输出，
 * 返回结构化的 VerifierVerdict 供 orchestrator / 未来的 Reviser 消费。
 */

import type { VerifiedFact, FactSnapshot } from "../fact-layer.service.js";
import type { AIMessage } from "../../../../../../packages/ai-sdk/src/index.js";

// ─── Rule identifiers ────────────────────────────────────────────────────────

export type VerifierRuleId =
  | "insufficient_tool_evidence"
  | "answer_conflicts_with_verified_facts"
  | "should_continue_tool_loop"
  | "should_handoff_to_human";

// ─── Rule evaluation result ──────────────────────────────────────────────────

export interface RuleFinding {
  ruleId: VerifierRuleId;
  triggered: boolean;
  severity: "info" | "warning" | "critical";
  reason: string;
}

// ─── Aggregated verdict ──────────────────────────────────────────────────────

export type VerifierAction =
  | "pass"               // all rules pass — proceed normally
  | "continue_tools"     // should keep calling tools in agent loop
  | "rewrite_answer"     // final answer needs revision (Phase C will auto-rewrite)
  | "handoff";           // escalate to human agent

export interface VerifierVerdict {
  action: VerifierAction;
  findings: RuleFinding[];
  /** Human-readable summary for ai_traces */
  summary: string;
}

// ─── Context passed to each rule ─────────────────────────────────────────────

/** Shared context available to all verifier rules at Point A (mid-loop) */
export interface PointAContext {
  /** All verified facts accumulated so far (DB + in-flight) */
  runVerifiedFacts: VerifiedFact[];
  /** Full fact snapshot from DB */
  factSnapshot: FactSnapshot;
  /** Current loop iteration index (0-based) */
  loopIndex: number;
  /** Max allowed loop iterations */
  maxLoops: number;
  /** Skills invoked so far in this run */
  skillsInvoked: string[];
  /** Skills blocked so far in this run */
  skillsBlocked: Array<{ name: string; reason: string }>;
  /** The messages accumulated in the agent loop */
  loopMessages: AIMessage[];
  /** Original chat history (customer messages) */
  chatHistory: AIMessage[];
}

/** Shared context available to all verifier rules at Point B (post-answer) */
export interface PointBContext {
  /** The final answer text produced by the LLM */
  finalContent: string;
  /** Parsed action from normalizeAIInteractionContract */
  proposedAction: string;
  /** Parsed intent from normalizeAIInteractionContract */
  proposedIntent: string | null;
  /** Parsed sentiment from normalizeAIInteractionContract */
  proposedSentiment: "positive" | "neutral" | "negative" | "angry" | null;
  /** All verified facts accumulated during this run */
  runVerifiedFacts: VerifiedFact[];
  /** Full fact snapshot from DB */
  factSnapshot: FactSnapshot;
  /** Skills invoked in this run */
  skillsInvoked: string[];
  /** The messages accumulated in the agent loop */
  loopMessages: AIMessage[];
  /** Original chat history (customer messages) */
  chatHistory: AIMessage[];
}

// ─── Rule interface ──────────────────────────────────────────────────────────

export interface VerifierRule {
  id: VerifierRuleId;
  /** Which insertion point(s) this rule applies to */
  points: Array<"A" | "B">;
  /** Evaluate at Point A */
  evaluateA?(ctx: PointAContext): RuleFinding;
  /** Evaluate at Point B */
  evaluateB?(ctx: PointBContext): RuleFinding;
}
