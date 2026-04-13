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
  buildVerifiedFactFromKnowledgeEntry,
  formatFactSnapshotForPrompt,
  mergeKnowledgeFacts,
  type FactSnapshot
} from "../fact-layer.service.js";
import {
  buildCustomerIntelligenceContext
} from "../../memory/customer-intelligence.service.js";
import { formatKnowledgeEntriesAsContext, searchKnowledgeEntries } from "../../knowledge/knowledge-retrieval.service.js";
import type { SemanticTrack } from "../semantic-router.types.js";

export interface ContextPipelineInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  track: SemanticTrack;
  knowledgeQuery: string;
  /** If a skill is active, exclude certain memory types to reduce noise */
  activeSkillSlug: string | null;
}

/**
 * Run the context pipeline: customer intelligence + fact snapshot in parallel.
 *
 * Note: conversation capability state is NOT loaded here — the orchestrator
 * already loads it earlier (line ~160) to determine the continuation skill,
 * which must happen before context pipeline runs. Loading it again here
 * would be a redundant DB call.
 */
export async function runContextPipeline(
  db: Knex | Knex.Transaction,
  input: ContextPipelineInput
): Promise<HarnessContext> {
  const [customerIntelligence, knowledgeEntries, factSnapshot] = await Promise.all([
    buildCustomerIntelligenceContext(
      db,
      input.tenantId,
      input.conversationId,
      input.customerId,
      {
        excludeMemoryTypes: input.activeSkillSlug ? ["unresolved_issue"] : []
      }
    ),
    input.track === "knowledge_track"
      ? searchKnowledgeEntries(db, {
          tenantId: input.tenantId,
          queryText: input.knowledgeQuery,
          limit: 4
        })
      : Promise.resolve([]),
    buildFactSnapshot(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId
    })
  ]);

  const knowledgeContext = formatKnowledgeEntriesAsContext(knowledgeEntries);
  const knowledgeFacts = knowledgeEntries.map((entry) =>
    buildVerifiedFactFromKnowledgeEntry(entry, input.knowledgeQuery)
  );
  const mergedFactSnapshot = mergeKnowledgeFacts(factSnapshot, knowledgeFacts);

  return {
    customerIntelligence,
    knowledgeContext,
    factSnapshot: mergedFactSnapshot,
    factContext: formatFactSnapshotForPrompt(mergedFactSnapshot),
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
