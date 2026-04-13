/**
 * Harness Engineering — Sandbox Evaluator
 *
 * The sandbox is the guardrail layer that evaluates AI output quality
 * and applies corrections when needed.
 *
 * Two evaluation points (matching Anthropic's constitutional AI approach):
 *
 *   Point A (mid-loop): After each tool execution, before next LLM call.
 *     - Should the AI continue calling tools?
 *     - Is the evidence sufficient?
 *
 *   Point B (post-answer): After the final answer is generated.
 *     - Does the answer contradict verified facts?
 *     - Should we handoff to a human?
 *     - Does the answer need correction?
 *
 * The sandbox tracks its own token budget to avoid runaway correction costs.
 *
 * Cost-aware design:
 *   - Point A: rule-based only (no LLM calls)
 *   - Point B handoff: rule-based only (no LLM calls)
 *   - Point B rewrite: LLM call only for critical-severity findings
 *   - Point B clarify path removed in Phase 2 to keep only high-value post-answer corrections
 */

import type { AIMessage } from "../../../../../../packages/ai-sdk/src/index.js";
import type { LLMParams } from "../call-context.js";
import type { HarnessSandbox } from "./types.js";
import type { VerifiedFact, FactSnapshot } from "../fact-layer.service.js";
import type { ReviserOutcome } from "../reviser/types.js";
import { evaluatePointA, evaluatePointB } from "../verifier/index.js";
import { revisePointA, revisePointB } from "../reviser/index.js";

// ─── Sandbox State ──────────────────────────────────────────────────────────

export class SandboxState {
  private _verifierSteps: HarnessSandbox["verifierSteps"] = [];
  private _reviserSteps: HarnessSandbox["reviserSteps"] = [];
  private _overrideAction: HarnessSandbox["overrideAction"] = "none";
  private _extraInputTokens = 0;
  private _extraOutputTokens = 0;

  get snapshot(): HarnessSandbox {
    return {
      verifierSteps: this._verifierSteps,
      reviserSteps: this._reviserSteps,
      runVerifiedFacts: [],  // Filled by caller
      overrideAction: this._overrideAction,
      sandboxTokens: {
        input: this._extraInputTokens,
        output: this._extraOutputTokens
      }
    };
  }

  /**
   * Run Point A evaluation (mid-loop).
   * Returns the reviser outcome; caller should inject hint into loopMessages if modified.
   */
  runPointA(input: {
    runVerifiedFacts: VerifiedFact[];
    factSnapshot: FactSnapshot;
    loopIndex: number;
    maxLoops: number;
    skillsInvoked: string[];
    skillsBlocked: Array<{ name: string; reason: string }>;
    loopMessages: AIMessage[];
    chatHistory: AIMessage[];
  }): ReviserOutcome {
    const verdict = evaluatePointA({
      runVerifiedFacts: input.runVerifiedFacts,
      factSnapshot: input.factSnapshot,
      loopIndex: input.loopIndex,
      maxLoops: input.maxLoops,
      skillsInvoked: input.skillsInvoked,
      skillsBlocked: input.skillsBlocked,
      loopMessages: input.loopMessages,
      chatHistory: input.chatHistory
    });

    this._verifierSteps.push({
      point: "A",
      loop: input.loopIndex,
      action: verdict.action,
      findings: verdict.findings
    });

    const revision = revisePointA({
      verdict,
      runVerifiedFacts: input.runVerifiedFacts,
      factSnapshot: input.factSnapshot,
      loopIndex: input.loopIndex,
      maxLoops: input.maxLoops,
      skillsInvoked: input.skillsInvoked,
      skillsBlocked: input.skillsBlocked,
      loopMessages: input.loopMessages,
      chatHistory: input.chatHistory
    });

    this._reviserSteps.push({
      point: "A",
      loop: input.loopIndex,
      action: revision.action,
      modified: revision.modified,
      summary: revision.summary
    });

    return revision;
  }

  /**
   * Run Point B evaluation (post-answer).
   * May invoke an LLM call for rewrite if critical findings exist.
   */
  async runPointB(input: {
    finalContent: string;
    proposedAction: string;
    proposedIntent: string | null;
    proposedSentiment: "positive" | "neutral" | "negative" | "angry" | null;
    runVerifiedFacts: VerifiedFact[];
    factSnapshot: FactSnapshot;
    skillsInvoked: string[];
    loopMessages: AIMessage[];
    chatHistory: AIMessage[];
    llm: LLMParams;
  }): Promise<ReviserOutcome> {
    const verdict = evaluatePointB({
      finalContent: input.finalContent,
      proposedAction: input.proposedAction,
      proposedIntent: input.proposedIntent,
      proposedSentiment: input.proposedSentiment,
      runVerifiedFacts: input.runVerifiedFacts,
      factSnapshot: input.factSnapshot,
      skillsInvoked: input.skillsInvoked,
      loopMessages: input.loopMessages,
      chatHistory: input.chatHistory
    });

    this._verifierSteps.push({
      point: "B",
      action: verdict.action,
      findings: verdict.findings
    });

    const revision = await revisePointB({
      verdict,
      finalContent: input.finalContent,
      proposedAction: input.proposedAction,
      runVerifiedFacts: input.runVerifiedFacts,
      factSnapshot: input.factSnapshot,
      skillsInvoked: input.skillsInvoked,
      loopMessages: input.loopMessages,
      chatHistory: input.chatHistory,
      llm: input.llm
    });

    this._extraInputTokens += revision.extraInputTokens;
    this._extraOutputTokens += revision.extraOutputTokens;

    this._reviserSteps.push({
      point: "B",
      action: revision.action,
      modified: revision.modified,
      summary: revision.summary
    });

    if (revision.modified) {
      if (revision.action === "handoff") this._overrideAction = "handoff";
      else if (revision.action === "rewrite_answer") this._overrideAction = "rewrite";
    }

    return revision;
  }
}
