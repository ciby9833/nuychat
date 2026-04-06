/**
 * Harness Engineering — Public API
 *
 * harness = prompt + context + experience + skills + sandbox
 *
 * The Harness module provides a unified framework for assembling
 * all dimensions of an AI interaction. It replaces ad-hoc prompt building,
 * scattered context loading, and inline guardrail checks with a structured,
 * composable pipeline.
 *
 * Usage from orchestrator:
 *
 *   const layers = buildPromptLayers({ aiAgent });
 *   const ctx = await runContextPipeline(db, { tenantId, conversationId, customerId, activeSkillSlug });
 *   const systemPrompt = assembleSystemPrompt({ layers, ... });
 *   const sandbox = new SandboxState();
 *   // ... during agent loop: sandbox.runPointA(...)
 *   // ... after final answer: sandbox.runPointB(...)
 *   // ... trace: sandbox.snapshot
 */

// Types
export type {
  HarnessPromptLayer,
  HarnessContext,
  HarnessExperience,
  HarnessSkills,
  HarnessSandbox,
  AssembledHarness,
  HarnessTrace,
  PlannerStrategy
} from "./types.js";

// Prompt assembly
export {
  assembleSystemPrompt,
  buildPromptLayers,
  type PromptAssemblerInput
} from "./prompt-assembler.js";

// Context pipeline
export {
  runContextPipeline,
  runFactPipeline,
  type ContextPipelineInput
} from "./context-pipeline.js";

// Sandbox (guardrails)
export { SandboxState } from "./sandbox-evaluator.js";

// AI Call Context (re-export from parent module for convenience)
export {
  type AICallContext,
  type LLMParams,
  buildCallContext,
  toLLMParams,
  trackedComplete
} from "../call-context.js";
