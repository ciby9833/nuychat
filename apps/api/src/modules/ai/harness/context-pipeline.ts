/**
 * 作用：统一组装数字员工主链上下文，当前负责客户记忆、业务知识、事实快照三层上下文。
 * 上游：orchestrator.service.ts
 * 下游：prompt-assembler.ts
 * 协作对象：customer-intelligence.service.ts、fact-layer.service.ts、knowledge-retrieval.service.ts
 * 不负责：不决定轨道，不执行 tool，不生成最终回复。
 * 变更注意：新增上下文来源优先以独立 stage 接入，不要继续把查询逻辑塞回 orchestrator。
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
export interface ContextPipelineInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  /** If a skill is active, exclude certain memory types to reduce noise */
  activeSkillSlug: string | null;
}

/**
 * Run the context pipeline: customer intelligence + fact snapshot in parallel.
 *
 * Knowledge search is intentionally NOT done here — it is now a built-in
 * LLM tool (searchKnowledge) so the model can decide when to look things up
 * regardless of the request type. This removes the old knowledge_track gate.
 *
 * Note: conversation capability state is NOT loaded here — the orchestrator
 * already loads it earlier to determine the continuation skill.
 */
export async function runContextPipeline(
  db: Knex | Knex.Transaction,
  input: ContextPipelineInput
): Promise<HarnessContext> {
  const [customerIntelligence, factSnapshot] = await Promise.all([
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
    })
  ]);

  return {
    customerIntelligence,
    knowledgeContext: null,  // Knowledge is now a tool result, not pre-injected context
    factSnapshot,
    factContext: formatFactSnapshotForPrompt(factSnapshot),
    conversationState: null
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
