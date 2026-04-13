/**
 * 作用：定义 harness 相关类型，作为数字员工主链的统一编排契约。
 * 上游：orchestrator.service.ts、harness/index.ts
 * 下游：context-pipeline.ts、prompt-assembler.ts、sandbox-evaluator.ts
 * 协作对象：fact-layer.service.ts、agent-skills/contracts.ts、后续 semantic-router.service.ts
 * 不负责：不实现上下文检索、prompt 组装或工具执行本身。
 * 变更注意：新增轨道或知识上下文字段时，优先扩展类型而非复用无关字段。
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
  /** Business knowledge retrieved for the current request */
  knowledgeContext: string | null;
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
  overrideAction: "none" | "handoff" | "rewrite";
  /** Extra tokens consumed by sandbox LLM calls (currently rewrite only) */
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
