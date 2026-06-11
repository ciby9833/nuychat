import type { Knex } from "knex";

type ConversationRecord = {
  conversation_id: string;
};

/**
 * A queued conversation is considered stale if no message has been exchanged for this many
 * milliseconds. Stale queued conversations are auto-resolved so the next inbound message
 * starts a fresh routing cycle instead of rejoining a dead queue.
 * Default: 4 hours.  Can be overridden via env STALE_QUEUE_THRESHOLD_MS.
 */
const STALE_QUEUE_THRESHOLD_MS = parseInt(process.env.STALE_QUEUE_THRESHOLD_MS ?? "", 10) || 4 * 60 * 60 * 1000;

export class ConversationService {
  async getOrCreateActiveConversation(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      customerId: string;
      channelId: string;
      channelType: string;
      chatType: "direct" | "group";
      chatExternalRef: string;
      chatName?: string;
      operatingMode?: string;
      lastMessagePreview?: string;
      lastMessageAt: Date;
    }
  ) {
    const staleQueueCutoff = new Date(Date.now() - STALE_QUEUE_THRESHOLD_MS);

    // Active non-queued conversations are always reused.
    // Queued conversations are only reused when they are fresh (updated within the stale threshold) —
    // a stale queued conversation means no agent accepted in a long time; start fresh instead.
    const existing = await db<ConversationRecord & { status: string }>("conversations")
      .select("conversation_id", "status")
      .where({
        tenant_id: input.tenantId,
        channel_id: input.channelId,
        chat_type: input.chatType,
        chat_external_ref: input.chatExternalRef
      } as any)
      .where(function () {
        this.whereIn("status", ["open", "bot_active", "human_active", "workflow_active"]).orWhere(
          function () {
            this.where("status", "queued").andWhere("updated_at", ">=", staleQueueCutoff);
          }
        );
      })
      .orderBy("updated_at", "desc")
      .first();

    if (existing) {
      await db("conversations")
        .where({ conversation_id: existing.conversation_id })
        .update({
          last_message_at: input.lastMessageAt,
          last_message_preview: input.lastMessagePreview ?? null,
          chat_name: input.chatName ?? null
        });

      return { conversationId: existing.conversation_id, created: false };
    }

    // Auto-resolve any stale queued conversations for this chat so they don't accumulate.
    // These are conversations that sat in the queue for longer than STALE_QUEUE_THRESHOLD_MS
    // with no agent accepting, effectively orphaned.
    const staleQueued = await db<ConversationRecord>("conversations")
      .select("conversation_id")
      .where({
        tenant_id: input.tenantId,
        channel_id: input.channelId,
        chat_type: input.chatType,
        chat_external_ref: input.chatExternalRef,
        status: "queued"
      } as any)
      .andWhere("updated_at", "<", staleQueueCutoff);

    if (staleQueued.length > 0) {
      const staleIds = staleQueued.map((r) => r.conversation_id);
      await db("conversations").whereIn("conversation_id", staleIds).update({ status: "resolved", updated_at: new Date() });
      // Clear stale routing context so old intent ("human_handoff") and queue assignment
      // don't contaminate the next fresh routing cycle when the conversation is reopened.
      await db("conversation_memory_snapshots").whereIn("conversation_id", staleIds).delete();
      await db("queue_assignments")
        .whereIn("conversation_id", staleIds)
        .update({
          service_request_mode: null,
          locked_human_side: false,
          handoff_required: false,
          ai_fallback_allowed: false,
          status: "resolved",
          updated_at: new Date()
        });
    }

    // Reopen the most recent resolved/closed conversation instead of creating a new one.
    // This gives each customer a single persistent thread (Telegram-like behaviour).
    const closed = await db<ConversationRecord>("conversations")
      .select("conversation_id")
      .where({
        tenant_id: input.tenantId,
        channel_id: input.channelId,
        chat_type: input.chatType,
        chat_external_ref: input.chatExternalRef
      } as any)
      .whereIn("status", ["resolved", "closed"])
      .orderBy("updated_at", "desc")
      .first();

    if (closed) {
      await db("conversations")
        .where({ conversation_id: closed.conversation_id })
        .update({
          status: "open",
          assigned_agent_id: null,
          current_handler_type: "system",
          current_handler_id: null,
          current_segment_id: null,
          last_message_at: input.lastMessageAt,
          last_message_preview: input.lastMessagePreview ?? null,
          chat_name: input.chatName ?? null,
          unread_count: 0,
          updated_at: new Date()
        });

      // Clear previous session memory and routing state so the new session gets
      // a clean routing cycle (no stale intent="human_handoff", no locked_human_side, etc.)
      await db("conversation_memory_snapshots").where({ conversation_id: closed.conversation_id }).delete();
      await db("queue_assignments")
        .where({ conversation_id: closed.conversation_id })
        .update({
          service_request_mode: null,
          locked_human_side: false,
          handoff_required: false,
          ai_fallback_allowed: false,
          status: "resolved",
          updated_at: new Date()
        });

      return { conversationId: closed.conversation_id, created: true };
    }

    const [conversation] = await db("conversations")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        channel_type: input.channelType,
        channel_id: input.channelId,
        chat_type: input.chatType,
        chat_external_ref: input.chatExternalRef,
        chat_name: input.chatName ?? null,
        status: "open",
        operating_mode: input.operatingMode ?? "ai_first",
        last_message_at: input.lastMessageAt,
        last_message_preview: input.lastMessagePreview ?? null,
        unread_count: 0
      })
      .returning(["conversation_id"]);

    return { conversationId: conversation.conversation_id as string, created: true };
  }
}
