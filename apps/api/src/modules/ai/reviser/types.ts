/**
 * Reviser / Corrector Layer — Types
 *
 * Harness Engineering: 评估失败 → 自动收敛成下一步动作。
 * Reviser 接收 Verifier 的 verdict，执行修正动作，返回 ReviserOutcome。
 *
 * 只用于 AI 座席主链。Copilot 链路不需要 Reviser — 人工座席本身就是 Reviser。
 */

import type { VerifierVerdict, VerifierAction } from "../verifier/types.js";
import type { VerifiedFact, FactSnapshot } from "../fact-layer.service.js";
import type { AIMessage } from "../../../../../../packages/ai-sdk/src/index.js";
import type { LLMParams } from "../call-context.js";

// ─── Reviser action identifiers ──────────────────────────────────────────────

export type ReviserActionId =
  | "continue_tools"     // 补调下一个 tool（复用 agent loop）
  | "rewrite_answer"     // 携带 FactSnapshot 重走最终 LLM 轮
  | "handoff";           // 直接转人工

// ─── Reviser outcome ─────────────────────────────────────────────────────────

export interface ReviserOutcome {
  /** The action taken by the reviser */
  action: ReviserActionId | "pass";
  /** Whether the reviser modified the output */
  modified: boolean;
  /** New final content (only for rewrite_answer) */
  revisedContent?: string;
  /** Handoff reason (only for handoff) */
  handoffReason?: string;
  /** Human-readable summary for traces */
  summary: string;
  /** Extra tokens consumed by reviser LLM calls */
  extraInputTokens: number;
  extraOutputTokens: number;
}

// ─── Shared context for reviser actions ──────────────────────────────────────

/** Context available at Point A (mid-loop) for continue_tools action */
export interface ReviserPointAContext {
  verdict: VerifierVerdict;
  runVerifiedFacts: VerifiedFact[];
  factSnapshot: FactSnapshot;
  loopIndex: number;
  maxLoops: number;
  skillsInvoked: string[];
  skillsBlocked: Array<{ name: string; reason: string }>;
  loopMessages: AIMessage[];
  chatHistory: AIMessage[];
}

/** Context available at Point B (post-answer) for rewrite/handoff */
export interface ReviserPointBContext {
  verdict: VerifierVerdict;
  finalContent: string;
  proposedAction: string;
  runVerifiedFacts: VerifiedFact[];
  factSnapshot: FactSnapshot;
  skillsInvoked: string[];
  loopMessages: AIMessage[];
  chatHistory: AIMessage[];
  /** LLM infrastructure for rewrite_answer */
  llm: LLMParams;
}
