/**
 * Harness Engineering — Context Pipeline
 *
 * Unified context assembly: collects all contextual signals into
 * a structured HarnessContext object.
 *
 * Pipeline stages:
 *   1. Customer Intelligence — long-term memory + profile
 *   2. Fact Snapshot — verified facts, task facts, state facts
 *   3. Conversation State — capability state (multi-turn)
 *
 * Each stage runs independently and contributes to the prompt.
 * The pipeline is designed to be extensible: add new context sources
 * (e.g., knowledge base search, RAG) by adding new stages.
 */

import type { Knex } from "knex";
import type { HarnessContext } from "./types.js";
import {
  buildFactSnapshot,
  formatFactSnapshotForPrompt,
  type FactSnapshot
} from "../fact-layer.service.js";
import {
  buildCustomerIntelligenceContext
} from "../../memory/customer-intelligence.service.js";
import {
  getConversationCapabilityState
} from "../../agent-skills/capability-state.service.js";

export interface ContextPipelineInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  /** If a skill is active, exclude certain memory types to reduce noise */
  activeSkillSlug: string | null;
}

/**
 * Run the full context pipeline in parallel.
 *
 * All three stages run concurrently (Promise.all) since they're independent DB reads.
 * Total latency ≈ max(single stage latency) instead of sum.
 */
export async function runContextPipeline(
  db: Knex | Knex.Transaction,
  input: ContextPipelineInput
): Promise<HarnessContext> {
  const [customerIntelligence, factSnapshot, capabilityState] = await Promise.all([
    buildCustomerIntelligenceContext(
      db,
      input.tenantId,
      input.conversationId,
      input.customerId,
      {
        excludeMemoryTypes: input.activeSkillSlug ? ["unresolved_issue"] : []
      }
    ),
    buildFactSnapshot(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId
    }),
    loadConversationState(db, input)
  ]);

  return {
    customerIntelligence,
    factSnapshot,
    factContext: formatFactSnapshotForPrompt(factSnapshot),
    conversationState: capabilityState
  };
}

/**
 * Get the Fact Snapshot only (for use when customer intelligence is not needed).
 */
export async function runFactPipeline(
  db: Knex | Knex.Transaction,
  input: { tenantId: string; conversationId: string; customerId: string }
): Promise<FactSnapshot> {
  return buildFactSnapshot(db, input);
}

// ─── Internal ───────────────────────────────────────────────────────────────

async function loadConversationState(
  db: Knex | Knex.Transaction,
  input: ContextPipelineInput
): Promise<HarnessContext["conversationState"]> {
  const state = await getConversationCapabilityState(db, {
    tenantId: input.tenantId,
    conversationId: input.conversationId
  });

  if (!state) return null;

  return {
    capabilityId: state.capabilityId,
    status: state.status,
    missingInputs: Array.isArray(state.missingInputs)
      ? state.missingInputs.map((item: unknown) => String(item))
      : []
  };
}
