import type { Knex } from "knex";

type OwnerType = "system" | "human" | "ai";

export class ConversationSegmentService {
  async ensureSystemSegment(
    db: Knex | Knex.Transaction,
    input: { tenantId: string; conversationId: string; customerId: string; reason?: string | null }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    if (conversation.current_segment_id) {
      return conversation.current_segment_id;
    }

    return this.startSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: conversation.current_case_id,
      ownerType: "system",
      reason: input.reason ?? null
    });
  }

  async switchToHumanSegment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      agentId: string;
      reason?: string | null;
    }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    return this.replaceSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: conversation.current_case_id,
      ownerType: "human",
      ownerAgentId: input.agentId,
      reason: input.reason ?? null
    });
  }

  async switchToAISegment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      aiAgentId: string;
      reason?: string | null;
    }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    return this.replaceSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: conversation.current_case_id,
      ownerType: "ai",
      ownerAiAgentId: input.aiAgentId,
      reason: input.reason ?? null
    });
  }

  async switchToSystemSegment(
    db: Knex | Knex.Transaction,
    input: { tenantId: string; conversationId: string; customerId: string; reason?: string | null }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    return this.replaceSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: conversation.current_case_id,
      ownerType: "system",
      reason: input.reason ?? null
    });
  }

  async closeCurrentSegment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      status: "resolved" | "closed" | "transferred" | "handoff";
      reason?: string | null;
      clearCurrent?: boolean;
    }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    if (!conversation.current_segment_id) return null;

    await db("conversation_segments")
      .where({ tenant_id: input.tenantId, segment_id: conversation.current_segment_id })
      .update({
        status: input.status,
        closed_reason: input.reason ?? null,
        ended_at: db.fn.now(),
        updated_at: db.fn.now()
      });

    if (input.clearCurrent !== false) {
      await db("conversations")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .update({
          current_segment_id: null,
          updated_at: db.fn.now()
        });
    }

    return conversation.current_segment_id;
  }

  private async replaceSegment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      caseId: string;
      ownerType: OwnerType;
      ownerAgentId?: string;
      ownerAiAgentId?: string;
      reason?: string | null;
    }
  ) {
    const conversation = await this.getConversation(db, input.tenantId, input.conversationId);
    const currentSegmentId = conversation.current_segment_id;

    if (currentSegmentId) {
      const currentSegment = await db("conversation_segments")
        .where({ tenant_id: input.tenantId, segment_id: currentSegmentId })
        .select("owner_type", "owner_agent_id", "owner_ai_agent_id")
        .first<{ owner_type: string; owner_agent_id: string | null; owner_ai_agent_id: string | null } | undefined>();

      if (
        currentSegment &&
        currentSegment.owner_type === input.ownerType &&
        (currentSegment.owner_agent_id ?? null) === (input.ownerAgentId ?? null) &&
        (currentSegment.owner_ai_agent_id ?? null) === (input.ownerAiAgentId ?? null)
      ) {
        return currentSegmentId;
      }

      await db("conversation_segments")
        .where({ tenant_id: input.tenantId, segment_id: currentSegmentId })
        .update({
          status: input.ownerType === "human" ? "transferred" : "closed",
          closed_reason: input.reason ?? null,
          ended_at: db.fn.now(),
          updated_at: db.fn.now()
        });
    }

    return this.startSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: input.caseId,
      ownerType: input.ownerType,
      ownerAgentId: input.ownerAgentId,
      ownerAiAgentId: input.ownerAiAgentId,
      transferredFromSegmentId: currentSegmentId ?? null,
      reason: input.reason ?? null
    });
  }

  private async startSegment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      caseId: string;
      ownerType: OwnerType;
      ownerAgentId?: string;
      ownerAiAgentId?: string;
      transferredFromSegmentId?: string | null;
      reason?: string | null;
    }
  ) {
    const [segment] = await db("conversation_segments")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        customer_id: input.customerId,
        case_id: input.caseId,
        owner_type: input.ownerType,
        owner_agent_id: input.ownerAgentId ?? null,
        owner_ai_agent_id: input.ownerAiAgentId ?? null,
        status: "active",
        opened_reason: input.reason ?? null,
        transferred_from_segment_id: input.transferredFromSegmentId ?? null
      })
      .returning(["segment_id"]);

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        current_segment_id: segment.segment_id as string,
        updated_at: db.fn.now()
      });

    return segment.segment_id as string;
  }

  private async getConversation(db: Knex | Knex.Transaction, tenantId: string, conversationId: string) {
    const conversation = await db("conversations")
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .select("current_segment_id", "current_case_id")
      .first<{ current_segment_id: string | null; current_case_id: string | null } | undefined>();

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (!conversation.current_case_id) {
      throw new Error(`Conversation has no current case: ${conversationId}`);
    }

    return conversation;
  }
}
