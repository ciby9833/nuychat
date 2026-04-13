import type { Knex } from "knex";

import { realtimeEventBus, type ConversationUpdatedEvent } from "../realtime/realtime.events.js";

type ConversationRealtimeSnapshot = Omit<ConversationUpdatedEvent, "tenantId" | "conversationId" | "occurredAt">;

export async function buildConversationUpdatedSnapshot(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
): Promise<ConversationRealtimeSnapshot> {
  const unreadCounts = db("messages as mu")
    .select("mu.conversation_id")
    .count<{ unread_count: string }>("mu.message_id as unread_count")
    .where({
      "mu.tenant_id": tenantId,
      "mu.direction": "inbound",
      "mu.sender_type": "customer"
    })
    .whereNull("mu.read_at")
    .groupBy("mu.conversation_id")
    .as("uc");

  const row = await db("conversations as c")
    .leftJoin(unreadCounts, "uc.conversation_id", "c.conversation_id")
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .select(
      "c.status",
      "c.assigned_agent_id",
      "c.last_message_preview",
      db.raw("coalesce(uc.unread_count, 0)::int as unread_count"),
      "qa.status as queue_status",
      "qa.service_request_mode",
      "qa.human_progress",
      "qa.queue_mode",
      "qa.queue_position",
      "qa.estimated_wait_sec",
      "qa.locked_human_side"
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
      service_request_mode: string | null;
      human_progress: string | null;
      queue_mode: string | null;
      queue_position: number | string | null;
      estimated_wait_sec: number | string | null;
      locked_human_side: boolean | null;
    }>();

  return {
    status: row?.status ?? undefined,
    queueStatus: row?.queue_status ?? undefined,
    assignedAgentId: row?.assigned_agent_id ?? null,
    lastMessagePreview: row?.last_message_preview ?? null,
    unreadCount: Number(row?.unread_count ?? 0),
    serviceRequestMode:
      row?.service_request_mode === "human_requested"
        ? "human_requested"
        : row?.service_request_mode === "ai_opt_in"
          ? "ai_opt_in"
          : "normal",
    humanProgress:
      row?.human_progress === "assigned_waiting" ||
      row?.human_progress === "queued_waiting" ||
      row?.human_progress === "human_active" ||
      row?.human_progress === "unavailable_fallback_ai"
        ? row.human_progress
        : "none",
    queueMode: row?.queue_mode === "assigned_waiting" || row?.queue_mode === "pending_unavailable" ? row.queue_mode : "none",
    queuePosition: row?.queue_position === null || row?.queue_position === undefined ? null : Number(row.queue_position),
    estimatedWaitSec: row?.estimated_wait_sec === null || row?.estimated_wait_sec === undefined ? null : Number(row.estimated_wait_sec),
    lockedHumanSide: Boolean(row?.locked_human_side)
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
