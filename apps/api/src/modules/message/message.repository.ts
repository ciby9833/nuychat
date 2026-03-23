import type { Knex } from "knex";

import { db } from "../../infra/db/client.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE } from "./message.constants.js";

/**
 * Returns messages for a conversation, enriched with sender agent info
 * (display_name + employee_no) for outbound agent messages.
 */
export async function getRecentMessages(tenantId: string, conversationId: string) {
  return db("messages as m")
    .leftJoin("agent_profiles as ap", "ap.agent_id", "m.sender_id")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
    .select(
      "m.message_id",
      "m.direction",
      "m.sender_type",
      "m.sender_id",
      "m.message_type",
      "m.content",
      "m.created_at",
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

export async function getConversationSummary(tenantId: string, conversationId: string) {
  return db("conversations")
    .select("conversation_id", "channel_id", "channel_type", "status", "assigned_agent_id")
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
