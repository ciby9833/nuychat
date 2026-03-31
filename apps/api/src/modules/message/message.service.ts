import type { Knex } from "knex";

import {
  inferStructuredMessageFromText,
  isInternalControlPayload,
  normalizeStructuredActions,
  normalizeStructuredMessage,
  structuredToPlainText
} from "../../shared/messaging/structured-message.js";
import type { StructuredMessage, StructuredMessageAction } from "../../shared/types/structured-message.js";
import type { UnifiedMessage } from "../../shared/types/unified-message.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE } from "./message.constants.js";

type MessageAttachment = { url: string; mimeType: string; fileName?: string };

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
        chat_type: input.unifiedMessage.chatType,
        chat_external_ref: input.unifiedMessage.chatExternalRef,
        chat_name: input.unifiedMessage.chatName ?? null,
        participant_external_ref: input.unifiedMessage.participantExternalRef ?? input.unifiedMessage.senderExternalRef,
        participant_display_name: input.unifiedMessage.participantDisplayName ?? null,
        direction: input.unifiedMessage.direction,
        sender_type: CUSTOMER_MESSAGE_SENDER_TYPE,
        channel_message_type: resolveChannelMessageType(input.unifiedMessage),
        message_type: input.unifiedMessage.messageType,
        content: input.unifiedMessage,
        message_status: "read",
        status_read_at: input.unifiedMessage.receivedAt,
        reply_to_external_id: input.unifiedMessage.context?.externalMessageId ?? null,
        reaction_emoji: input.unifiedMessage.reaction?.emoji ?? null,
        reaction_target_external_id:
          input.unifiedMessage.reaction?.targetExternalMessageId ?? input.unifiedMessage.context?.externalMessageId ?? null,
        is_forwarded: Boolean(input.unifiedMessage.context?.forwarded),
        is_frequently_forwarded: Boolean(input.unifiedMessage.context?.frequentlyForwarded),
        is_voice_message: isVoiceMessage(input.unifiedMessage),
        created_at: input.unifiedMessage.receivedAt
      })
      .onConflict(["tenant_id", "external_id"])
      .ignore()
      .returning(["message_id"]);

    const messageId = (message?.message_id as string | undefined) ?? null;
    if (messageId) {
      await hydrateMessageReferences(db, input.tenantId, messageId);
    }

    return {
      messageId
    };
  }

  async saveOutboundMessage(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      externalId: string | null;
      text: string;
      structured?: StructuredMessage | null;
      actions?: StructuredMessageAction[];
      senderId?: string | null;
      /** If provided (and senderId is absent), marks the message as AI-generated (sender_type="bot") */
      aiAgentName?: string | null;
      /** Optional attachment sent by agent */
      attachment?: MessageAttachment;
      replyToMessageId?: string | null;
      replyToExternalId?: string | null;
      reactionEmoji?: string | null;
      reactionTargetMessageId?: string | null;
      reactionTargetExternalId?: string | null;
      channelMessageType?: string | null;
      createdAt?: Date;
      segmentId?: string | null;
    }
  ) {
    const isAI = !input.senderId && Boolean(input.aiAgentName);
    const structured = normalizeStructuredMessage(input.structured) ?? inferStructuredMessageFromText(input.text);
    const actions = normalizeStructuredActions(input.actions);
    const resolvedText = isInternalControlPayload(input.text.trim())
      ? ""
      : structuredToPlainText(structured, input.text);
    const content: Record<string, unknown> = {
      text: input.reactionEmoji ?? resolvedText,
      direction: "outbound"
    };
    if (isAI && input.aiAgentName) {
      content.aiAgentName = input.aiAgentName;
    }
    if (structured) {
      content.structured = structured;
    }
    if (actions.length > 0) {
      content.actions = actions;
    }
    if (input.attachment) {
      content.attachments = [input.attachment];
    }

    const threadContext =
      input.segmentId === undefined
        ? await resolveThreadContext(db, input.tenantId, input.conversationId)
        : await resolveThreadContextWithSegment(db, input.tenantId, input.conversationId, input.segmentId);

    const [message] = await db("messages")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        segment_id: threadContext.segmentId,
        case_id: threadContext.caseId,
        external_id: input.externalId,
        chat_type: threadContext.chatType,
        chat_external_ref: threadContext.chatExternalRef,
        chat_name: threadContext.chatName,
        direction: "outbound",
        sender_type: isAI ? "bot" : "agent",
        sender_id: input.senderId ?? null,
        channel_message_type: input.channelMessageType ?? resolveOutboundChannelMessageType({ ...input, actions }),
        message_type: resolveOutboundMessageType(input, actions),
        content,
        message_status: "sent",
        status_sent_at: input.createdAt ?? new Date(),
        reply_to_message_id: input.replyToMessageId ?? null,
        reply_to_external_id: input.replyToExternalId ?? null,
        reaction_emoji: input.reactionEmoji ?? null,
        reaction_target_message_id: input.reactionTargetMessageId ?? null,
        reaction_target_external_id: input.reactionTargetExternalId ?? null,
        created_at: input.createdAt ?? new Date()
      })
      .returning(["message_id"]);

    const messageId = (message?.message_id as string | undefined) ?? null;
    if (messageId) {
      await hydrateMessageReferences(db, input.tenantId, messageId);
    }

    return {
      messageId
    };
  }
}

async function resolveThreadContext(db: Knex | Knex.Transaction, tenantId: string, conversationId: string) {
  const conversation = await db("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_segment_id", "current_case_id", "chat_type", "chat_external_ref", "chat_name")
    .first<{
      current_segment_id: string | null;
      current_case_id: string | null;
      chat_type: string | null;
      chat_external_ref: string | null;
      chat_name: string | null;
    } | undefined>();

  if (!conversation?.current_case_id) {
    throw new Error(`Conversation has no current case: ${conversationId}`);
  }

  return {
    segmentId: conversation.current_segment_id ?? null,
    caseId: conversation.current_case_id,
    chatType: (conversation.chat_type as "direct" | "group" | null) ?? "direct",
    chatExternalRef: conversation.chat_external_ref ?? "",
    chatName: conversation.chat_name ?? null
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

async function resolveThreadContextWithSegment(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
  segmentId: string | null
) {
  const base = await resolveThreadContext(db, tenantId, conversationId);
  return {
    ...base,
    segmentId
  };
}

function resolveChannelMessageType(message: UnifiedMessage): string | null {
  if (message.messageType === "reaction") return "reaction";
  if (message.messageType === "media") {
    const mimeType = message.attachments?.[0]?.mimeType ?? "";
    if (mimeType === "image/webp") return "sticker";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("image/")) return "image";
    return "document";
  }
  return message.messageType;
}

function isVoiceMessage(message: UnifiedMessage): boolean {
  return resolveChannelMessageType(message) === "audio" && !message.text;
}

function resolveOutboundChannelMessageType(input: {
  attachment?: MessageAttachment;
  reactionEmoji?: string | null;
  actions?: StructuredMessageAction[];
}): string {
  if (input.reactionEmoji) return "reaction";
  if (Array.isArray(input.actions) && input.actions.length > 0) return "interactive";
  if (!input.attachment) return "text";
  if (input.attachment.mimeType === "image/webp") return "sticker";
  if (input.attachment.mimeType.startsWith("audio/")) return "audio";
  if (input.attachment.mimeType.startsWith("video/")) return "video";
  if (input.attachment.mimeType.startsWith("image/")) return "image";
  return "document";
}

function resolveOutboundMessageType(
  input: {
    attachment?: MessageAttachment;
    reactionEmoji?: string | null;
  },
  actions: StructuredMessageAction[]
): string {
  if (input.reactionEmoji) return "reaction";
  if (input.attachment) return "media";
  if (actions.length > 0) return "interactive";
  return "text";
}

async function hydrateMessageReferences(db: Knex | Knex.Transaction, tenantId: string, messageId: string) {
  const row = await db("messages")
    .select("reply_to_external_id", "reaction_target_external_id")
    .where({ tenant_id: tenantId, message_id: messageId })
    .first<{ reply_to_external_id: string | null; reaction_target_external_id: string | null } | undefined>();

  if (!row) return;

  const [replyToMessageId, reactionTargetMessageId] = await Promise.all([
    row.reply_to_external_id
      ? resolveMessageIdByExternalId(db, tenantId, row.reply_to_external_id)
      : Promise.resolve<string | null>(null),
    row.reaction_target_external_id
      ? resolveMessageIdByExternalId(db, tenantId, row.reaction_target_external_id)
      : Promise.resolve<string | null>(null)
  ]);

  await db("messages")
    .where({ tenant_id: tenantId, message_id: messageId })
    .update({
      reply_to_message_id: replyToMessageId,
      reaction_target_message_id: reactionTargetMessageId
    });
}

async function resolveMessageIdByExternalId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  externalId: string
) {
  const row = await db("messages")
    .select("message_id")
    .where({ tenant_id: tenantId, external_id: externalId })
    .first<{ message_id: string } | undefined>();

  return row?.message_id ?? null;
}
