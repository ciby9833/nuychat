import type { Knex } from "knex";

import { ConversationCaseService } from "./conversation-case.service.js";
import { ConversationSegmentService } from "./conversation-segment.service.js";
import type { OwnershipTransition } from "./ownership.types.js";

const conversationCaseService = new ConversationCaseService();
const conversationSegmentService = new ConversationSegmentService();

export class OwnershipService {
  async applyTransition(db: Knex | Knex.Transaction, transition: OwnershipTransition) {
    switch (transition.type) {
      case "preserve_existing_owner":
        await this.preserveHumanOwner(db, transition);
        break;
      case "assign_human_queue":
        await this.assignHumanQueue(db, transition);
        break;
      case "assign_ai_pending":
        await this.assignAiPending(db, transition);
        break;
      case "activate_human_owner":
        await this.activateHumanOwner(db, transition);
        break;
      case "activate_ai_owner":
        await this.activateAiOwner(db, transition);
        break;
      case "release_to_queue":
        await this.releaseToQueue(db, transition);
        break;
      case "resolve_conversation":
        await this.resolveConversation(db, transition);
        break;
      default:
        throw new Error(`Unsupported ownership transition: ${(transition as { type?: string }).type ?? "unknown"}`);
    }
  }

  private async preserveHumanOwner(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "preserve_existing_owner" }>
  ) {
    const conversation = await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("assigned_agent_id", "current_handler_type", "current_handler_id")
      .first<{
        assigned_agent_id: string | null;
        current_handler_type: string | null;
        current_handler_id: string | null;
      } | undefined>();

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.conversationId}`);
    }
    if (conversation.assigned_agent_id !== input.agentId) {
      throw new Error(`Preserve plan must keep existing assigned agent: ${input.conversationId}`);
    }
    if (conversation.current_handler_type !== "human" || conversation.current_handler_id !== input.agentId) {
      throw new Error(`Preserve plan must keep current human handler: ${input.conversationId}`);
    }

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: "human_active",
        assigned_agent_id: input.agentId,
        current_handler_type: "human",
        current_handler_id: input.agentId,
        updated_at: db.fn.now()
      });

    if (input.caseId) {
      await conversationCaseService.setCurrentOwner(db, {
        tenantId: input.tenantId,
        caseId: input.caseId,
        segmentId: input.segmentId,
        ownerType: "agent",
        ownerId: input.agentId,
        status: "in_progress"
      });
    }
  }

  private async assignHumanQueue(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "assign_human_queue" }>
  ) {
    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.conversationStatus,
        assigned_agent_id: input.assignedAgentId,
        current_handler_type: "system",
        current_handler_id: null,
        updated_at: db.fn.now()
      });

    if (input.caseId) {
      await conversationCaseService.clearCurrentOwnership(db, {
        tenantId: input.tenantId,
        caseId: input.caseId
      });
    }
  }

  private async assignAiPending(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "assign_ai_pending" }>
  ) {
    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.conversationStatus,
        assigned_agent_id: null,
        current_handler_type: "system",
        current_handler_id: null,
        updated_at: db.fn.now()
      });

    if (input.caseId) {
      await conversationCaseService.clearCurrentOwnership(db, {
        tenantId: input.tenantId,
        caseId: input.caseId
      });
    }
  }

  private async activateHumanOwner(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "activate_human_owner" }>
  ) {
    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.conversationStatus ?? "human_active",
        assigned_agent_id: input.agentId,
        current_handler_type: "human",
        current_handler_id: input.agentId,
        updated_at: db.fn.now()
      });

    await conversationSegmentService.switchToHumanSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      agentId: input.agentId,
      reason: input.reason
    });

    const segmentId = await resolveCurrentSegmentId(db, input.tenantId, input.conversationId);
    await conversationCaseService.setCurrentOwner(db, {
      tenantId: input.tenantId,
      caseId: input.caseId,
      segmentId,
      ownerType: "agent",
      ownerId: input.agentId,
      status: input.caseStatus
    });
  }

  private async activateAiOwner(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "activate_ai_owner" }>
  ) {
    await conversationSegmentService.switchToAISegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      aiAgentId: input.aiAgentId,
      reason: input.reason
    });

    const segmentId = await resolveCurrentSegmentId(db, input.tenantId, input.conversationId);
    await conversationCaseService.setCurrentOwner(db, {
      tenantId: input.tenantId,
      caseId: input.caseId,
      segmentId,
      ownerType: "ai",
      ownerId: input.aiAgentId,
      status: input.caseStatus
    });

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.conversationStatus ?? "bot_active",
        assigned_agent_id: null,
        current_handler_type: "ai",
        current_handler_id: input.aiAgentId,
        updated_at: db.fn.now()
      });
  }

  private async releaseToQueue(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "release_to_queue" }>
  ) {
    await conversationSegmentService.switchToSystemSegment(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      reason: input.reason
    });

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.conversationStatus,
        assigned_agent_id: input.assignedAgentId ?? null,
        current_handler_type: "system",
        current_handler_id: null,
        updated_at: db.fn.now()
      });

    if (input.caseId) {
      await conversationCaseService.clearCurrentOwnership(db, {
        tenantId: input.tenantId,
        caseId: input.caseId
      });
    }
  }

  private async resolveConversation(
    db: Knex | Knex.Transaction,
    input: Extract<OwnershipTransition, { type: "resolve_conversation" }>
  ) {
    const conversation = await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("current_case_id")
      .first<{ current_case_id: string | null } | undefined>();

    if (conversation?.current_case_id) {
      await conversationCaseService.closeCase(db, {
        tenantId: input.tenantId,
        caseId: conversation.current_case_id,
        status: input.status,
        finalOwnerType: input.finalOwnerType,
        finalOwnerId: input.finalOwnerId,
        resolvedByAgentId: input.resolvedByAgentId
      });
    }

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        status: input.status,
        assigned_agent_id: null,
        current_handler_type: "system",
        current_handler_id: null,
        current_segment_id: null,
        current_case_id: null,
        updated_at: db.fn.now()
      });
  }
}

async function resolveCurrentSegmentId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const row = await db("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_segment_id")
    .first<{ current_segment_id: string | null } | undefined>();
  return row?.current_segment_id ?? null;
}
