import type { Knex } from "knex";

import { toIsoString } from "../tenant/tenant-admin.shared.js";
import { extractMessagePreview, parseJsonValue } from "../admin-core/admin-route.shared.js";

export async function loadConversationPreview(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const latestCaseQuery = trx("conversation_cases as cc_latest")
    .select(
      trx.raw("distinct on (cc_latest.conversation_id) cc_latest.tenant_id"),
      "cc_latest.conversation_id",
      "cc_latest.case_id",
      "cc_latest.title",
      "cc_latest.summary",
      "cc_latest.status",
      "cc_latest.opened_at",
      "cc_latest.last_activity_at"
    )
    .where("cc_latest.tenant_id", tenantId)
    .orderBy("cc_latest.conversation_id", "asc")
    .orderBy("cc_latest.last_activity_at", "desc")
    .as("cc_latest");

  const conversation = await trx("conversations as c")
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("conversation_cases as cc", function joinCurrentCase() {
      this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(latestCaseQuery, function joinLatestCase() {
      this.on("cc_latest.conversation_id", "=", "c.conversation_id").andOn("cc_latest.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("customers as cu", function joinCustomer() {
      this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("agent_profiles as current_ap", function joinCurrentAgent() {
      this.on("current_ap.agent_id", "=", "cc.current_owner_id").andOn("current_ap.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_memberships as current_tm", "current_tm.membership_id", "current_ap.membership_id")
    .leftJoin("tenant_ai_agents as current_ai", function joinCurrentAi() {
      this.on("current_ai.ai_agent_id", "=", "cc.current_owner_id").andOn("current_ai.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("agent_profiles as reserved_ap", function joinReservedAgent() {
      this.on("reserved_ap.agent_id", "=", "qa.assigned_agent_id").andOn("reserved_ap.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("tenant_memberships as reserved_tm", "reserved_tm.membership_id", "reserved_ap.membership_id")
    .leftJoin("tenant_ai_agents as reserved_ai", function joinReservedAi() {
      this.on("reserved_ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("reserved_ai.tenant_id", "=", "qa.tenant_id");
    })
    .where({ "c.tenant_id": tenantId, "c.conversation_id": conversationId })
    .whereExists(function ensureConversationHasMessages() {
      this.select(trx.raw("1"))
        .from("messages as m")
        .whereRaw("m.tenant_id = c.tenant_id")
        .andWhereRaw("m.conversation_id = c.conversation_id");
    })
    .select(
      "c.conversation_id",
      "c.status",
      "c.channel_type",
      "c.current_handler_type",
      "c.last_message_preview",
      "c.last_message_at",
      "cu.display_name as customer_name",
      "cu.external_ref as customer_ref",
      "cu.tier as customer_tier",
      "cu.language as customer_language",
      trx.raw("coalesce(cc.case_id, cc_latest.case_id) as case_id"),
      trx.raw("coalesce(cc.title, cc_latest.title) as case_title"),
      trx.raw("coalesce(cc.summary, cc_latest.summary) as case_summary"),
      trx.raw("coalesce(cc.status, cc_latest.status) as case_status"),
      trx.raw("coalesce(cc.opened_at, cc_latest.opened_at) as case_opened_at"),
      trx.raw("coalesce(cc.last_activity_at, cc_latest.last_activity_at) as case_last_activity_at"),
      "qa.status as queue_status",
      "qa.service_request_mode",
      "qa.queue_mode",
      "qa.queue_position",
      "qa.estimated_wait_sec",
      "qa.ai_fallback_allowed",
      "qa.locked_human_side",
      "qa.assigned_agent_id",
      "reserved_tm.display_name as assigned_agent_name",
      "qa.assigned_ai_agent_id",
      "reserved_ai.name as assigned_ai_agent_name",
      "cc.current_owner_type",
      "cc.current_owner_id",
      "current_tm.display_name as current_owner_name",
      "current_ai.name as current_owner_ai_name"
    )
    .first<Record<string, unknown>>();

  if (!conversation) return null;

  const messages = await trx("messages as m")
    .leftJoin("agent_profiles as ap", function joinAgent() {
      this.on("ap.agent_id", "=", "m.sender_id").andOn("ap.tenant_id", "=", "m.tenant_id");
    })
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
    .leftJoin("tenant_ai_agents as ai", function joinAiAgent() {
      this.on("ai.ai_agent_id", "=", "m.sender_id").andOn("ai.tenant_id", "=", "m.tenant_id");
    })
    .leftJoin("messages as rm", function joinReplyTarget() {
      this.on("rm.message_id", "=", "m.reply_to_message_id").andOn("rm.tenant_id", "=", "m.tenant_id");
    })
    .where({ "m.tenant_id": tenantId, "m.conversation_id": conversationId })
    .select(
      "m.message_id",
      "m.direction",
      "m.sender_type",
      "m.message_type",
      "m.content",
      "m.reply_to_message_id",
      "m.reaction_target_message_id",
      "m.reaction_emoji",
      "m.created_at",
      "rm.content as reply_to_content",
      "tm.display_name as sender_name",
      "ai.name as ai_agent_name"
    )
    .orderBy("m.created_at", "asc")
    .limit(200);

  const currentOwnerType = (conversation.current_owner_type as string | null) ?? null;
  const currentOwnerName = currentOwnerType === "ai"
    ? (conversation.current_owner_ai_name as string | null) ?? null
    : (conversation.current_owner_name as string | null) ?? null;

  return {
    conversation: {
      conversationId: conversation.conversation_id,
      caseId: (conversation.case_id as string | null) ?? null,
      caseTitle: (conversation.case_title as string | null) ?? null,
      caseSummary: (conversation.case_summary as string | null) ?? null,
      caseStatus: (conversation.case_status as string | null) ?? null,
      caseOpenedAt: conversation.case_opened_at ? toIsoString(conversation.case_opened_at as string) : null,
      caseLastActivityAt: conversation.case_last_activity_at ? toIsoString(conversation.case_last_activity_at as string) : null,
      status: conversation.status,
      queueStatus: (conversation.queue_status as string | null) ?? null,
      serviceRequestMode: (conversation.service_request_mode as string | null) ?? "normal",
      queueMode: (conversation.queue_mode as string | null) ?? "none",
      queuePosition: conversation.queue_position === null || conversation.queue_position === undefined ? null : Number(conversation.queue_position),
      estimatedWaitSec: conversation.estimated_wait_sec === null || conversation.estimated_wait_sec === undefined ? null : Number(conversation.estimated_wait_sec),
      aiFallbackAllowed: Boolean(conversation.ai_fallback_allowed),
      lockedHumanSide: Boolean(conversation.locked_human_side),
      channelType: conversation.channel_type,
      currentHandlerType: (conversation.current_handler_type as string | null) ?? null,
      customerName: (conversation.customer_name as string | null) ?? null,
      customerRef: (conversation.customer_ref as string | null) ?? null,
      customerTier: (conversation.customer_tier as string | null) ?? null,
      customerLanguage: (conversation.customer_language as string | null) ?? null,
      currentOwnerType,
      currentOwnerId: (conversation.current_owner_id as string | null) ?? null,
      currentOwnerName,
      assignedAgentId: (conversation.assigned_agent_id as string | null) ?? null,
      assignedAgentName: (conversation.assigned_agent_name as string | null) ?? null,
      assignedAiAgentId: (conversation.assigned_ai_agent_id as string | null) ?? null,
      assignedAiAgentName: (conversation.assigned_ai_agent_name as string | null) ?? null,
      lastMessagePreview: (conversation.last_message_preview as string | null) ?? null,
      lastMessageAt: conversation.last_message_at ? toIsoString(conversation.last_message_at as string) : null
    },
    messages: messages.map((row) => ({
      messageId: row.message_id,
      direction: row.direction,
      senderType: row.sender_type,
      senderName: (row.sender_name as string | null) ?? (row.ai_agent_name as string | null) ?? null,
      messageType: row.message_type,
      content: parseJsonValue(row.content),
      preview: extractMessagePreview(parseJsonValue(row.content)),
      replyToMessageId: (row.reply_to_message_id as string | null) ?? null,
      replyToPreview: row.reply_to_content ? extractMessagePreview(parseJsonValue(row.reply_to_content)) : null,
      reactionTargetMessageId: (row.reaction_target_message_id as string | null) ?? null,
      reactionEmoji: (row.reaction_emoji as string | null) ?? null,
      createdAt: toIsoString(row.created_at as string)
    }))
  };
}
