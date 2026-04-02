import type { Knex } from "knex";

import { db } from "../../infra/db/client.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE } from "./message.constants.js";

/**
 * Returns messages for a conversation, enriched with sender agent info
 * (display_name + employee_no) for outbound agent messages.
 */
export async function getRecentMessages(
  tenantId: string,
  conversationId: string,
  executor?: Knex | Knex.Transaction
) {
  return resolveExecutor(executor)("messages as m")
    .leftJoin("agent_profiles as ap", "ap.agent_id", "m.sender_id")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
    .leftJoin("messages as rm", "rm.message_id", "m.reply_to_message_id")
    .select(
      "m.message_id",
      "m.direction",
      "m.sender_type",
      "m.sender_id",
      "m.channel_message_type",
      "m.message_status",
      "m.message_type",
      "m.chat_type",
      "m.chat_external_ref",
      "m.chat_name",
      "m.participant_external_ref",
      "m.participant_display_name",
      "m.content",
      "m.reply_to_message_id",
      "m.reply_to_external_id",
      "m.reaction_target_message_id",
      "m.reaction_target_external_id",
      "m.reaction_emoji",
      "m.is_forwarded",
      "m.is_frequently_forwarded",
      "m.is_voice_message",
      "m.status_sent_at",
      "m.status_delivered_at",
      "m.status_read_at",
      "m.status_failed_at",
      "m.status_deleted_at",
      "m.status_error_code",
      "m.status_error_title",
      "m.created_at",
      "rm.content as reply_to_content",
      "tm.display_name as sender_name",
      "tm.employee_no as sender_employee_no"
    )
    .where({
      "m.tenant_id": tenantId,
      "m.conversation_id": conversationId
    })
    .orderBy("m.created_at", "asc")
    .limit(100);
}

export async function resolveMessageIdByExternalId(
  tenantId: string,
  externalId: string,
  executor?: Knex | Knex.Transaction
) {
  const row = await resolveExecutor(executor)("messages")
    .select("message_id")
    .where({ tenant_id: tenantId, external_id: externalId })
    .first<{ message_id: string } | undefined>();

  return row?.message_id ?? null;
}

export async function updateMessageStatusByExternalId(
  tenantId: string,
  externalId: string,
  input: {
    status: "sent" | "delivered" | "read" | "failed" | "deleted";
    occurredAt: Date;
    errorCode?: string | null;
    errorTitle?: string | null;
  },
  executor?: Knex | Knex.Transaction
) {
  const patch: Record<string, unknown> = {
    message_status: input.status
  };

  if (input.status === "sent") patch.status_sent_at = input.occurredAt;
  if (input.status === "delivered") patch.status_delivered_at = input.occurredAt;
  if (input.status === "read") patch.status_read_at = input.occurredAt;
  if (input.status === "failed") patch.status_failed_at = input.occurredAt;
  if (input.status === "deleted") patch.status_deleted_at = input.occurredAt;
  if (input.errorCode) patch.status_error_code = input.errorCode;
  if (input.errorTitle) patch.status_error_title = input.errorTitle;

  const [row] = await resolveExecutor(executor)("messages")
    .where({ tenant_id: tenantId, external_id: externalId })
    .update(patch)
    .returning(["message_id", "conversation_id", "message_status"]);

  return row
    ? {
        messageId: row.message_id as string,
        conversationId: row.conversation_id as string,
        messageStatus: row.message_status as string
      }
    : null;
}

export async function getConversationSummary(
  tenantId: string,
  conversationId: string,
  executor?: Knex | Knex.Transaction
) {
  return resolveExecutor(executor)("conversations")
    .select("conversation_id", "channel_id", "channel_type", "chat_type", "chat_external_ref", "chat_name", "status", "assigned_agent_id")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId
    })
    .first();
}

function resolveExecutor(executor?: Knex | Knex.Transaction) {
  return executor ?? db;
}

export async function countUnreadCustomerMessages(
  tenantId: string,
  conversationId: string,
  executor?: Knex | Knex.Transaction
) {
  const row = await resolveExecutor(executor)("messages")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: "inbound",
      sender_type: CUSTOMER_MESSAGE_SENDER_TYPE
    })
    .whereNull("read_at")
    .count<{ cnt: string }>("message_id as cnt")
    .first();

  return Number(row?.cnt ?? 0);
}

export async function syncConversationUnreadCount(
  tenantId: string,
  conversationId: string,
  executor?: Knex | Knex.Transaction
) {
  const unreadCount = await countUnreadCustomerMessages(tenantId, conversationId, executor);

  await resolveExecutor(executor)("conversations")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId
    })
    .update({
      unread_count: unreadCount,
      updated_at: new Date()
    });

  return unreadCount;
}

export async function markCustomerMessagesRead(
  tenantId: string,
  conversationId: string,
  executor?: Knex | Knex.Transaction
) {
  const now = new Date();
  await resolveExecutor(executor)("messages")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: "inbound",
      sender_type: CUSTOMER_MESSAGE_SENDER_TYPE
    })
    .whereNull("read_at")
    .update({
      read_at: now
    });

  await resolveExecutor(executor)("conversations")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId
    })
    .update({
      unread_count: 0,
      updated_at: now
    });
}
