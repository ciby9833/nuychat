/**
 * Verifier Service — Harness Engineering Evaluator Layer
 *
 * 运行所有注册的 verifier rules，返回聚合的 VerifierVerdict。
 *
 * 两个插入点：
 * - Point A: agent loop 内部，每轮 tool result 回填后，下一轮 LLM 调用前
 * - Point B: 最终回复生成后，enforcePreReplyPolicy() 之前
 */

import type {
  VerifierRule,
  VerifierVerdict,
  VerifierAction,
  RuleFinding,
  PointAContext,
  PointBContext
} from "./types.js";
import { insufficientEvidenceRule } from "./rules/insufficient-evidence.js";
import { factConflictRule } from "./rules/fact-conflict.js";
import { missingMultimodalRule } from "./rules/missing-multimodal.js";
import { shouldContinueToolsRule } from "./rules/should-continue-tools.js";
import { shouldHandoffRule } from "./rules/should-handoff.js";

// ─── Rule registry ───────────────────────────────────────────────────────────

const ALL_RULES: VerifierRule[] = [
  insufficientEvidenceRule,
  factConflictRule,
  missingMultimodalRule,
  shouldContinueToolsRule,
  shouldHandoffRule
];

// ─── Point A evaluation ──────────────────────────────────────────────────────

/**
 * Run all Point A rules (mid-loop evaluation).
 * Returns a verdict: "pass" or "continue_tools".
 */
export function evaluatePointA(ctx: PointAContext): VerifierVerdict {
  const findings: RuleFinding[] = [];

  for (const rule of ALL_RULES) {
    if (!rule.points.includes("A") || !rule.evaluateA) continue;
    findings.push(rule.evaluateA(ctx));
  }

  const action = resolvePointAAction(findings);
  return {
    action,
    findings,
    summary: buildSummary("A", action, findings)
  };
}

// ─── Point B evaluation ──────────────────────────────────────────────────────

/**
 * Run all Point B rules (post-answer evaluation).
 * Returns a verdict: "pass", "rewrite_answer", "clarify", or "handoff".
 */
export function evaluatePointB(ctx: PointBContext): VerifierVerdict {
  const findings: RuleFinding[] = [];

  for (const rule of ALL_RULES) {
    if (!rule.points.includes("B") || !rule.evaluateB) continue;
    findings.push(rule.evaluateB(ctx));
  }

  const action = resolvePointBAction(findings);
  return {
    action,
    findings,
    summary: buildSummary("B", action, findings)
  };
}

// ─── Action resolution ───────────────────────────────────────────────────────

function resolvePointAAction(findings: RuleFinding[]): VerifierAction {
  const triggered = findings.filter((f) => f.triggered);
  if (triggered.length === 0) return "pass";

  // should_continue_tool_loop is the primary Point A action
  if (triggered.some((f) => f.ruleId === "should_continue_tool_loop")) {
    return "continue_tools";
  }
  // insufficient_tool_evidence at Point A also means "keep going"
  if (triggered.some((f) => f.ruleId === "insufficient_tool_evidence")) {
    return "continue_tools";
  }

  return "pass";
}

function resolvePointBAction(findings: RuleFinding[]): VerifierAction {
  const triggered = findings.filter((f) => f.triggered);
  if (triggered.length === 0) return "pass";

  // Priority: handoff > rewrite > clarify > pass
  if (triggered.some((f) => f.ruleId === "should_handoff_to_human")) {
    return "handoff";
  }
  if (triggered.some((f) => f.ruleId === "answer_conflicts_with_verified_facts")) {
    return "rewrite_answer";
  }
  if (triggered.some((f) => f.ruleId === "insufficient_tool_evidence" && f.severity === "critical")) {
    return "clarify";
  }
  if (triggered.some((f) => f.ruleId === "missing_multimodal_evidence")) {
    return "rewrite_answer";
  }

  return "pass";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSummary(point: "A" | "B", action: VerifierAction, findings: RuleFinding[]): string {
  const triggered = findings.filter((f) => f.triggered);
  if (triggered.length === 0) return `Point ${point}: all rules passed.`;
  const ruleNames = triggered.map((f) => f.ruleId).join(", ");
  return `Point ${point}: action=${action}; triggered=[${ruleNames}]`;
}
