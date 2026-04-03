import type { Knex } from "knex";

import { realtimeEventBus, type ConversationUpdatedEvent } from "../realtime/realtime.events.js";

type ConversationRealtimeSnapshot = Omit<ConversationUpdatedEvent, "tenantId" | "conversationId" | "occurredAt">;

export async function buildConversationUpdatedSnapshot(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
): Promise<ConversationRealtimeSnapshot> {
  const row = await db("conversations as c")
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .select(
      "c.status",
      "c.assigned_agent_id",
      "c.last_message_preview",
      "c.unread_count",
      "qa.status as queue_status"
    )
    .where({
      "c.tenant_id": tenantId,
      "c.conversation_id": conversationId
    })
    .first<{
      status: string;
      assigned_agent_id: string | null;
      last_message_preview: string | null;
      unread_count: number | string | null;
      queue_status: string | null;
    }>();

  return {
    status: row?.status ?? undefined,
    queueStatus: row?.queue_status ?? undefined,
    assignedAgentId: row?.assigned_agent_id ?? null,
    lastMessagePreview: row?.last_message_preview ?? null,
    unreadCount: Number(row?.unread_count ?? 0)
  };
}

export async function emitConversationUpdatedSnapshot(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
  overrides: Partial<ConversationUpdatedEvent> = {}
) {
  const snapshot = await buildConversationUpdatedSnapshot(db, tenantId, conversationId);
  realtimeEventBus.emitEvent("conversation.updated", {
    tenantId,
    conversationId,
    ...snapshot,
    ...overrides,
    occurredAt: overrides.occurredAt ?? new Date().toISOString()
  });
}
