import type { Knex } from "knex";

import type { UnifiedMessage } from "../../shared/types/unified-message.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE } from "./message.constants.js";

export class MessageService {
  async saveInboundMessage(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      unifiedMessage: UnifiedMessage;
    }
  ) {
    const threadContext = await resolveThreadContext(db, input.tenantId, input.conversationId);

    const [message] = await db("messages")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        segment_id: threadContext.segmentId,
        case_id: threadContext.caseId,
        external_id: input.unifiedMessage.externalId,
        direction: input.unifiedMessage.direction,
        sender_type: CUSTOMER_MESSAGE_SENDER_TYPE,
        message_type: input.unifiedMessage.messageType,
        content: input.unifiedMessage,
        created_at: input.unifiedMessage.receivedAt
      })
      .onConflict(["tenant_id", "external_id"])
      .ignore()
      .returning(["message_id"]);

    return {
      messageId: (message?.message_id as string | undefined) ?? null
    };
  }

  async saveOutboundMessage(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      externalId: string | null;
      text: string;
      senderId?: string | null;
      /** If provided (and senderId is absent), marks the message as AI-generated (sender_type="bot") */
      aiAgentName?: string | null;
      /** Optional media attachment sent by agent */
      media?: { url: string; mimeType: string; fileName?: string };
      createdAt?: Date;
      segmentId?: string | null;
    }
  ) {
    const isAI = !input.senderId && Boolean(input.aiAgentName);
    const content: Record<string, unknown> = { text: input.text, direction: "outbound" };
    if (isAI && input.aiAgentName) {
      content.aiAgentName = input.aiAgentName;
    }
    if (input.media) {
      content.media = input.media;
    }

    const threadContext =
      input.segmentId === undefined
        ? await resolveThreadContext(db, input.tenantId, input.conversationId)
        : {
            segmentId: input.segmentId,
            caseId: await resolveCurrentCaseId(db, input.tenantId, input.conversationId)
          };

    const [message] = await db("messages")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        segment_id: threadContext.segmentId,
        case_id: threadContext.caseId,
        external_id: input.externalId,
        direction: "outbound",
        sender_type: isAI ? "bot" : "agent",
        sender_id: input.senderId ?? null,
        message_type: input.media ? "media" : "text",
        content,
        created_at: input.createdAt ?? new Date()
      })
      .returning(["message_id"]);

    return {
      messageId: (message?.message_id as string | undefined) ?? null
    };
  }
}

async function resolveThreadContext(db: Knex | Knex.Transaction, tenantId: string, conversationId: string) {
  const conversation = await db("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_segment_id", "current_case_id")
    .first<{ current_segment_id: string | null; current_case_id: string | null } | undefined>();

  if (!conversation?.current_case_id) {
    throw new Error(`Conversation has no current case: ${conversationId}`);
  }

  return {
    segmentId: conversation.current_segment_id ?? null,
    caseId: conversation.current_case_id
  };
}

async function resolveCurrentCaseId(db: Knex | Knex.Transaction, tenantId: string, conversationId: string) {
  const conversation = await db("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();

  if (!conversation?.current_case_id) {
    throw new Error(`Conversation has no current case: ${conversationId}`);
  }

  return conversation.current_case_id;
}
