import type { Knex } from "knex";

import type { RoutingAssignmentStrategy } from "./types.js";

type AIAgentCandidate = {
  aiAgentId: string;
  aiAgentName: string;
  createdAt: string;
  activeConversationCount: number;
  lastAssignedAt: string | null;
};

type AISelectionCandidate = {
  candidateType: "ai_agent";
  candidateId: string;
  candidateLabel: string;
  stage: string;
  accepted: boolean;
  rejectReason: string | null;
  details: Record<string, unknown>;
};

export type AIDispatchDecision = {
  aiAgentId: string | null;
  aiAgentName: string | null;
  selectionReason: string;
  strategy: RoutingAssignmentStrategy | null;
  candidates: AISelectionCandidate[];
};

export type AICapacitySnapshot = {
  totalAgents: number;
  availableAgents: number;
  activeConversationCount: number;
  softCapacity: number | null;
  loadPct: number | null;
  candidates: AIAgentCandidate[];
};

export class AIDispatchService {
  async inspectTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      aiTarget: {
        aiAgentId: string | null;
        assignmentStrategy: RoutingAssignmentStrategy | null;
      };
      aiSoftConcurrencyLimit: number | null;
    }
  ): Promise<AICapacitySnapshot> {
    const candidates = await loadActiveAIAgents(db, input.tenantId, input.aiTarget.aiAgentId);
    const activeConversationCount = candidates.reduce((sum, candidate) => sum + candidate.activeConversationCount, 0);
    const softCapacity = input.aiSoftConcurrencyLimit && candidates.length > 0
      ? input.aiSoftConcurrencyLimit * candidates.length
      : null;

    return {
      totalAgents: candidates.length,
      availableAgents: softCapacity === null
        ? candidates.length
        : candidates.filter((candidate) => candidate.activeConversationCount < input.aiSoftConcurrencyLimit!).length,
      activeConversationCount,
      softCapacity,
      loadPct: softCapacity && softCapacity > 0
        ? Math.min(100, Math.round((activeConversationCount / softCapacity) * 100))
        : null,
      candidates
    };
  }

  async selectForTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      customerId: string;
      conversationId?: string | null;
      aiTarget: {
        aiAgentId: string | null;
        assignmentStrategy: RoutingAssignmentStrategy | null;
      };
    }
  ): Promise<AIDispatchDecision> {
    const candidates = await loadActiveAIAgents(db, input.tenantId, input.aiTarget.aiAgentId);
    if (candidates.length === 0) {
      return {
        aiAgentId: null,
        aiAgentName: null,
        selectionReason: input.aiTarget.aiAgentId ? "configured_ai_agent_unavailable" : "no_active_ai_agent",
        strategy: input.aiTarget.assignmentStrategy ?? null,
        candidates: []
      };
    }

    if (input.aiTarget.aiAgentId) {
      const fixed = candidates[0] ?? null;
      return {
        aiAgentId: fixed?.aiAgentId ?? null,
        aiAgentName: fixed?.aiAgentName ?? null,
        selectionReason: fixed ? "configured_ai_agent_selected" : "configured_ai_agent_unavailable",
        strategy: null,
        candidates: candidates.map((candidate) => ({
          candidateType: "ai_agent",
          candidateId: candidate.aiAgentId,
          candidateLabel: candidate.aiAgentName,
          stage: "configured_target",
          accepted: candidate.aiAgentId === fixed?.aiAgentId,
          rejectReason: candidate.aiAgentId === fixed?.aiAgentId ? null : "not_configured_target",
          details: {
            activeConversationCount: candidate.activeConversationCount,
            lastAssignedAt: candidate.lastAssignedAt
          }
        }))
      };
    }

    // ── Conversation-sticky: reuse the AI agent already assigned to this
    // conversation if it is still active.  This keeps the same agent across
    // multiple message rounds, giving continuity without any extra state.
    if (input.conversationId) {
      const existing = await db("queue_assignments")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .whereNotNull("assigned_ai_agent_id")
        .select("assigned_ai_agent_id")
        .first<{ assigned_ai_agent_id: string } | undefined>();

      if (existing?.assigned_ai_agent_id) {
        const sticky = candidates.find((c) => c.aiAgentId === existing.assigned_ai_agent_id);
        if (sticky) {
          return {
            aiAgentId: sticky.aiAgentId,
            aiAgentName: sticky.aiAgentName,
            selectionReason: "conversation_sticky",
            strategy: "sticky",
            candidates: candidates.map((candidate) => ({
              candidateType: "ai_agent",
              candidateId: candidate.aiAgentId,
              candidateLabel: candidate.aiAgentName,
              stage: "conversation_sticky",
              accepted: candidate.aiAgentId === sticky.aiAgentId,
              rejectReason: candidate.aiAgentId === sticky.aiAgentId ? null : "conversation_sticky_other",
              details: {
                activeConversationCount: candidate.activeConversationCount,
                lastAssignedAt: candidate.lastAssignedAt
              }
            }))
          };
        }
      }
    }

    const strategy = input.aiTarget.assignmentStrategy ?? "least_busy";
    const selected = await chooseAIAgent(db, input.tenantId, input.customerId, strategy, candidates);

    return {
      aiAgentId: selected?.aiAgentId ?? null,
      aiAgentName: selected?.aiAgentName ?? null,
      selectionReason: selected ? `strategy_${strategy}` : "no_active_ai_agent",
      strategy,
      candidates: candidates.map((candidate) => ({
        candidateType: "ai_agent",
        candidateId: candidate.aiAgentId,
        candidateLabel: candidate.aiAgentName,
        stage: "strategy_selection",
        accepted: candidate.aiAgentId === selected?.aiAgentId,
        rejectReason: candidate.aiAgentId === selected?.aiAgentId ? null : "not_selected_by_strategy",
        details: {
          strategy,
          activeConversationCount: candidate.activeConversationCount,
          lastAssignedAt: candidate.lastAssignedAt
        }
      }))
    };
  }
}

async function loadActiveAIAgents(
  db: Knex | Knex.Transaction,
  tenantId: string,
  fixedAiAgentId: string | null
): Promise<AIAgentCandidate[]> {
  const query = db("tenant_ai_agents")
    .where({ tenant_id: tenantId, status: "active" })
    .select("ai_agent_id", "name", "created_at")
    .orderBy("created_at", "asc");

  if (fixedAiAgentId) {
    query.andWhere({ ai_agent_id: fixedAiAgentId });
  }

  const rows = await query as Array<{ ai_agent_id: string; name: string; created_at: string }>;
  if (rows.length === 0) return [];

  const aiAgentIds = rows.map((row) => row.ai_agent_id);
  const [loadRows, lastAssignedRows] = await Promise.all([
    db("queue_assignments as qa")
      .join("conversations as c", function joinConversation() {
        this.on("c.conversation_id", "=", "qa.conversation_id").andOn("c.tenant_id", "=", "qa.tenant_id");
      })
      .where("qa.tenant_id", tenantId)
      .whereIn("qa.assigned_ai_agent_id", aiAgentIds)
      .whereIn("c.status", ["open", "bot_active"])
      .groupBy("qa.assigned_ai_agent_id")
      .select("qa.assigned_ai_agent_id")
      .count<{ assigned_ai_agent_id: string; active_count: string }[]>("qa.assignment_id as active_count"),
    db("queue_assignments")
      .where({ tenant_id: tenantId })
      .whereIn("assigned_ai_agent_id", aiAgentIds)
      .whereNotNull("assigned_ai_agent_id")
      .groupBy("assigned_ai_agent_id")
      .select("assigned_ai_agent_id")
      .max<{ assigned_ai_agent_id: string; last_assigned_at: string | null }[]>("updated_at as last_assigned_at")
  ]);

  const loadByAgent = new Map(loadRows.map((row) => [row.assigned_ai_agent_id, Number(row.active_count ?? 0)]));
  const lastAssignedByAgent = new Map(lastAssignedRows.map((row) => [row.assigned_ai_agent_id, row.last_assigned_at ?? null]));

  return rows.map((row) => ({
    aiAgentId: row.ai_agent_id,
    aiAgentName: row.name,
    createdAt: row.created_at,
    activeConversationCount: loadByAgent.get(row.ai_agent_id) ?? 0,
    lastAssignedAt: lastAssignedByAgent.get(row.ai_agent_id) ?? null
  }));
}

async function chooseAIAgent(
  db: Knex | Knex.Transaction,
  tenantId: string,
  customerId: string,
  strategy: RoutingAssignmentStrategy,
  candidates: AIAgentCandidate[]
): Promise<AIAgentCandidate | null> {
  if (candidates.length === 0) return null;

  if (strategy === "sticky") {
    const sticky = await db("queue_assignments as qa")
      .join("conversations as c", function joinConversation() {
        this.on("c.conversation_id", "=", "qa.conversation_id").andOn("c.tenant_id", "=", "qa.tenant_id");
      })
      .where("qa.tenant_id", tenantId)
      .andWhere("c.customer_id", customerId)
      .whereIn("qa.assigned_ai_agent_id", candidates.map((candidate) => candidate.aiAgentId))
      .whereNotNull("qa.assigned_ai_agent_id")
      .orderBy("qa.updated_at", "desc")
      .select("qa.assigned_ai_agent_id")
      .first<{ assigned_ai_agent_id: string } | undefined>();

    if (sticky?.assigned_ai_agent_id) {
      const selected = candidates.find((candidate) => candidate.aiAgentId === sticky.assigned_ai_agent_id);
      if (selected) return selected;
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    if (strategy === "round_robin") {
      const aLast = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bLast = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      if (aLast !== bLast) return aLast - bLast;
    } else {
      if (a.activeConversationCount !== b.activeConversationCount) {
        return a.activeConversationCount - b.activeConversationCount;
      }
      const aLast = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bLast = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      if (aLast !== bLast) return aLast - bLast;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return sorted[0] ?? null;
}
