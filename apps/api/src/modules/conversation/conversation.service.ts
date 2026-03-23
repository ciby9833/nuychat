import type { Knex } from "knex";

type ConversationRecord = {
  conversation_id: string;
};

export class ConversationService {
  async getOrCreateActiveConversation(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      customerId: string;
      channelId: string;
      channelType: string;
      operatingMode?: string;
      lastMessagePreview?: string;
      lastMessageAt: Date;
    }
  ) {
    const activeStatuses = ["open", "queued", "bot_active", "human_active", "workflow_active"];

    const existing = await db<ConversationRecord>("conversations")
      .select("conversation_id")
      .where({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        channel_id: input.channelId
      })
      .whereIn("status", activeStatuses)
      .orderBy("updated_at", "desc")
      .first();

    if (existing) {
      await db("conversations")
        .where({ conversation_id: existing.conversation_id })
        .update({
          last_message_at: input.lastMessageAt,
          last_message_preview: input.lastMessagePreview ?? null
        });

      return { conversationId: existing.conversation_id, created: false };
    }

    // Reopen the most recent resolved/closed conversation instead of creating a new one.
    // This gives each customer a single persistent thread (Telegram-like behaviour).
    const closed = await db<ConversationRecord>("conversations")
      .select("conversation_id")
      .where({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        channel_id: input.channelId
      })
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
          unread_count: 0,
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
