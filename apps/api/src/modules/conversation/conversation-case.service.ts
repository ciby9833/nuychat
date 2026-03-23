import type { Knex } from "knex";

type ConversationCaseRow = {
  case_id: string;
  status: string;
};

type ConversationRow = {
  current_case_id: string | null;
  current_segment_id: string | null;
  status: string;
  assigned_agent_id: string | null;
  current_handler_type: string | null;
  current_handler_id: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export class ConversationCaseService {
  async getOrCreateActiveCase(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
    }
  ) {
    const conversation = await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select(
        "current_case_id",
        "current_segment_id",
        "status",
        "assigned_agent_id",
        "current_handler_type",
        "current_handler_id",
        "last_message_preview",
        "last_message_at",
        "created_at",
        "updated_at"
      )
      .first<ConversationRow | undefined>();

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.conversationId}`);
    }

    if (conversation.current_case_id) {
      const currentCase = await db("conversation_cases")
        .where({
          tenant_id: input.tenantId,
          case_id: conversation.current_case_id
        })
        .select("case_id", "status")
        .first<ConversationCaseRow | undefined>();

      if (currentCase && isActiveCaseStatus(currentCase.status)) {
        return { caseId: currentCase.case_id, created: false };
      }
    }

    const activeCase = await db("conversation_cases")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .whereIn("status", ACTIVE_CASE_STATUSES)
      .orderBy("opened_at", "desc")
      .select("case_id", "status")
      .first<ConversationCaseRow | undefined>();

    if (activeCase) {
      await db("conversations")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .update({
          current_case_id: activeCase.case_id,
          updated_at: db.fn.now()
        });

      return { caseId: activeCase.case_id, created: false };
    }

    const [createdCase] = await db("conversation_cases")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        customer_id: input.customerId,
        current_segment_id: conversation.current_segment_id ?? null,
        case_type: "general_inquiry",
        case_source: "system",
        title: buildCaseTitle(conversation.last_message_preview),
        summary: conversation.last_message_preview ?? null,
        status: "open",
        priority: "normal",
        current_owner_type: deriveOwnerType(conversation),
        current_owner_id: deriveOwnerId(conversation),
        opened_at: conversation.last_message_at ?? conversation.created_at,
        last_activity_at: conversation.last_message_at ?? conversation.updated_at,
        metadata: JSON.stringify({
          source: "thread-intake",
          threadStatus: conversation.status
        })
      })
      .returning(["case_id"]);

    const caseId = String(createdCase.case_id);

    await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        current_case_id: caseId,
        updated_at: db.fn.now()
      });

    return { caseId, created: true };
  }

  async setCurrentOwner(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      caseId: string;
      segmentId: string | null;
      ownerType: "system" | "ai" | "agent";
      ownerId: string | null;
      status: "open" | "in_progress" | "waiting_customer" | "waiting_internal";
    }
  ) {
    await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: input.caseId })
      .update({
        current_segment_id: input.segmentId,
        current_owner_type: input.ownerType,
        current_owner_id: input.ownerId,
        status: input.status,
        last_activity_at: db.fn.now(),
        updated_at: db.fn.now()
      });
  }

  async closeCase(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      caseId: string;
      status: "resolved" | "closed";
      finalOwnerType?: "system" | "ai" | "agent" | null;
      finalOwnerId?: string | null;
      resolvedByAgentId?: string | null;
    }
  ) {
    const existing = await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: input.caseId })
      .select("current_owner_type", "current_owner_id", "resolved_by_agent_id")
      .first<{
        current_owner_type: string | null;
        current_owner_id: string | null;
        resolved_by_agent_id: string | null;
      } | undefined>();

    const finalOwnerType =
      input.finalOwnerType === undefined ? existing?.current_owner_type ?? null : input.finalOwnerType;
    const finalOwnerId =
      input.finalOwnerId === undefined ? existing?.current_owner_id ?? null : input.finalOwnerId;
    const resolvedByAgentId =
      input.resolvedByAgentId === undefined
        ? (finalOwnerType === "agent" ? finalOwnerId : existing?.resolved_by_agent_id ?? null)
        : input.resolvedByAgentId;

    const payload =
      input.status === "resolved"
        ? {
            current_segment_id: null,
            current_owner_type: "system",
            current_owner_id: null,
            final_owner_type: finalOwnerType,
            final_owner_id: finalOwnerId,
            resolved_by_agent_id: resolvedByAgentId,
            status: "resolved",
            resolved_at: db.fn.now(),
            closed_at: null,
            last_activity_at: db.fn.now(),
            updated_at: db.fn.now()
          }
        : {
            current_segment_id: null,
            current_owner_type: "system",
            current_owner_id: null,
            final_owner_type: finalOwnerType,
            final_owner_id: finalOwnerId,
            resolved_by_agent_id: resolvedByAgentId,
            status: "closed",
            closed_at: db.fn.now(),
            last_activity_at: db.fn.now(),
            updated_at: db.fn.now()
          };

    await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: input.caseId })
      .update(payload);
  }

  async clearCurrentOwnership(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      caseId: string;
    }
  ) {
    await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: input.caseId })
      .update({
        current_segment_id: null,
        current_owner_type: "system",
        current_owner_id: null,
        status: "open",
        last_activity_at: db.fn.now(),
        updated_at: db.fn.now()
      });
  }
}

const ACTIVE_CASE_STATUSES = ["open", "in_progress", "waiting_customer", "waiting_internal"] as const;

function isActiveCaseStatus(status: string) {
  return ACTIVE_CASE_STATUSES.includes(status as (typeof ACTIVE_CASE_STATUSES)[number]);
}

function deriveOwnerType(conversation: ConversationRow) {
  if (conversation.assigned_agent_id) return "agent";
  if (conversation.current_handler_type === "ai" && conversation.current_handler_id) return "ai";
  if (conversation.current_handler_type === "workflow") return "workflow";
  return "system";
}

function deriveOwnerId(conversation: ConversationRow) {
  if (conversation.assigned_agent_id) return conversation.assigned_agent_id;
  return conversation.current_handler_id ?? null;
}

function buildCaseTitle(lastMessagePreview: string | null) {
  const value = typeof lastMessagePreview === "string" ? lastMessagePreview.trim() : "";
  if (!value) return "General inquiry";
  return value.slice(0, 255);
}
