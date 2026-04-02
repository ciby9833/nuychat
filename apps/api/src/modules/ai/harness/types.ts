/**
 * Harness Engineering — Type Definitions
 *
 * harness = prompt + context + experience + skills + sandbox
 *
 * The Harness is the unified orchestration contract that assembles all five
 * dimensions into a coherent LLM interaction. Each dimension is independently
 * configurable per tenant / scene / conversation.
 *
 * Design references:
 * - Claude's "system prompt → tools → context window" architecture
 * - OpenAI's "instructions → tools → file_search → code_interpreter" pattern
 * - Anthropic's "constitutional AI" approach for sandbox/guardrails
 */

import type { AIMessage } from "../../../../../../packages/ai-sdk/src/index.js";
import type { FactSnapshot, VerifiedFact } from "../fact-layer.service.js";
import type { TenantSkillDefinition } from "../../agent-skills/contracts.js";

// ─── Prompt Dimension ───────────────────────────────────────────────────────
// Layered prompt assembly: base → seat → scene → tenant overrides

export interface HarnessPromptLayer {
  /** Core behavioral rules (always present) */
  base: string;
  /** AI seat personality and role (from tenant_ai_agents) */
  seatPersona: string | null;
  /** Seat-specific instructions (from tenant_ai_agents.system_prompt) */
  seatInstructions: string | null;
  /** Scene-level constraints (e.g., "pre-sales" vs "post-sales" vs "tech-support") */
  sceneConstraints: string | null;
  /** Tenant-level custom instructions (from ai_configs or runtime policy) */
  tenantOverrides: string | null;
}

// ─── Context Dimension ──────────────────────────────────────────────────────
// Structured context injection: who the customer is + what we know now

export interface HarnessContext {
  /** Long-term customer intelligence (profile, preferences, history) */
  customerIntelligence: string | null;
  /** Fact Layer snapshot (verified facts, task facts, state facts) */
  factSnapshot: FactSnapshot;
  /** Formatted fact context for prompt injection */
  factContext: string | null;
  /** Active conversation state (e.g., "waiting for order number") */
  conversationState: {
    capabilityId: string | null;
    status: string | null;
    missingInputs: string[];
  } | null;
}

// ─── Experience Dimension ───────────────────────────────────────────────────
// What happened before: conversation history + cross-session patterns

export interface HarnessExperience {
  /** Current conversation messages (plain text for guards/policies) */
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  /** Full-fidelity messages (with image content parts) for LLM calls */
  llmMessages: AIMessage[];
  /** Recent conversation insight (intent, sentiment, key entities) */
  latestInsight: {
    summary: string | null;
    lastIntent: string | null;
    lastSentiment: string | null;
  } | null;
  /** Whether a skill recently ran and its result is in context */
  hasRecentSkillContext: boolean;
}

// ─── Skills Dimension ───────────────────────────────────────────────────────
// Available capabilities + planner strategy

export type PlannerStrategy = "direct" | "rule_filter" | "llm_planner";

export interface HarnessSkills {
  /** All available tenant skills for this conversation context */
  availableSkills: TenantSkillDefinition[];
  /** Skills selected as candidates by smart planner */
  candidateSkills: TenantSkillDefinition[];
  /** The planner strategy that was used */
  plannerStrategy: PlannerStrategy;
  /** Continuation skill (if in multi-turn skill flow) */
  continuationSkill: TenantSkillDefinition | null;
  /** Skills invoked during this orchestration run */
  invoked: string[];
  /** Skills blocked by guards */
  blocked: Array<{ name: string; reason: string }>;
}

// ─── Sandbox Dimension ──────────────────────────────────────────────────────
// Guardrails, verification, and correction

export interface HarnessSandbox {
  /** Verifier findings from Point A and Point B evaluations */
  verifierSteps: Array<{
    point: "A" | "B";
    loop?: number;
    action: string;
    findings: Array<{ ruleId: string; triggered: boolean; severity: string; reason: string }>;
  }>;
  /** Reviser outcomes from Point A and Point B corrections */
  reviserSteps: Array<{
    point: "A" | "B";
    loop?: number;
    action: string;
    modified: boolean;
    summary: string;
  }>;
  /** Accumulated verified facts during this run */
  runVerifiedFacts: VerifiedFact[];
  /** Whether the sandbox forced a handoff or rewrite */
  overrideAction: "none" | "handoff" | "rewrite" | "clarify";
  /** Extra tokens consumed by sandbox LLM calls (rewrites, clarifications) */
  sandboxTokens: { input: number; output: number };
}

// ─── Assembled Harness ──────────────────────────────────────────────────────

export interface AssembledHarness {
  prompt: HarnessPromptLayer;
  context: HarnessContext;
  experience: HarnessExperience;
  skills: HarnessSkills;
  sandbox: HarnessSandbox;
}

// ─── Harness Trace ──────────────────────────────────────────────────────────
// The full trace of a harness execution, for debugging and analytics.

export interface HarnessTrace {
  /** Which planner strategy was used */
  plannerStrategy: PlannerStrategy;
  /** Available skill count at planning time */
  availableSkillCount: number;
  /** Candidate skills selected */
  candidateSkillSlugs: string[];
  /** Skills actually invoked */
  skillsInvoked: string[];
  /** Skills blocked */
  skillsBlocked: Array<{ name: string; reason: string }>;
  /** Sandbox override action */
  sandboxOverride: string;
  /** Extra sandbox tokens */
  sandboxTokens: { input: number; output: number };
  /** Total LLM calls in this harness run */
  llmCallCount: number;
  /** Total tokens consumed */
  totalTokens: { input: number; output: number };
}
