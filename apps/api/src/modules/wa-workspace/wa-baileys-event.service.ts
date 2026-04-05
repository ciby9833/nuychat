/**
 * 作用:
 * - 消费 Baileys 事件并落到 WA 业务域表。
 *
 * 交互:
 * - 被 runtime manager 在 `messages.upsert` / `messages.update` 时调用。
 * - 调用 conversation repository、reconcile service 完成标准消息入库与缺口处理。
 */
import type { WAMessage, WAMessageUpdate } from "@whiskeysockets/baileys";
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import {
  mapBaileysDeliveryStatus,
  mapBaileysMessageToInbound,
  mapBaileysMessageUpdate
} from "./runtime/baileys-message.mapper.js";
import {
  findWaMessageByProviderId,
  insertRawEvent,
  insertWaMessage,
  insertWaMessageAttachment,
  insertWaMessageReaction,
  updateWaMessageByProviderId,
  upsertWaConversation,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";
import { createMissingReferenceGap, resolveGapsForArrivedMessage } from "./wa-reconcile.service.js";
import { emitWaMessageUpdated } from "./wa-realtime.service.js";

async function ingestSingleMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    message: WAMessage;
    eventType: string;
  }
) {
  const mapped = mapBaileysMessageToInbound(input.message);
  if (!mapped) return;

  const remoteJid = mapped.chatJid;
  const providerMessageId = mapped.providerMessageId;
  const providerTs = mapped.providerTs;
  const eventKey = `${input.eventType}:${providerMessageId}`;
  const rawEvent = await insertRawEvent(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    providerEventType: input.eventType,
    providerEventKey: eventKey,
    providerTs,
    payload: input.message as unknown as Record<string, unknown>
  });
  if (!rawEvent) return;

  const conversation = await upsertWaConversation(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    chatJid: remoteJid,
    conversationType: mapped.conversationType,
    subject: mapped.subject ?? null,
    contactJid: mapped.contactJid ?? null
  });

  const savedMessage = await insertWaMessage(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    waConversationId: conversation.waConversationId,
    providerMessageId,
    direction: mapped.direction,
    senderJid: mapped.senderJid,
    participantJid: mapped.participantJid ?? null,
    senderRole: mapped.senderRole,
    bodyText: mapped.bodyText ?? undefined,
    providerTs,
    messageType: mapped.messageType,
    quotedMessageId: mapped.quotedMessageId ?? null,
    providerPayload: input.message as unknown as Record<string, unknown>,
    deliveryStatus: mapBaileysDeliveryStatus(input.message.status) ?? "received"
  });

  await resolveGapsForArrivedMessage(trx, {
    tenantId: input.tenantId,
    waConversationId: conversation.waConversationId,
    providerMessageId
  });

  if (mapped.conversationType === "group" && mapped.participantJid) {
    await upsertWaConversationMember(trx, {
      tenantId: input.tenantId,
      waConversationId: conversation.waConversationId,
      participantJid: mapped.participantJid
    });
  }

  const attachment = mapped.attachment;
  if (attachment) {
    await insertWaMessageAttachment(trx, {
      tenantId: input.tenantId,
      waMessageId: String(savedMessage.wa_message_id),
      attachmentType: attachment.attachmentType,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
      storageUrl: attachment.storageUrl,
      previewUrl: attachment.previewUrl,
      providerPayload: input.message as unknown as Record<string, unknown>
    });
  }

  if (mapped.messageType === "reaction" && mapped.reactionEmoji) {
    let targetMessageId: string | null = null;
    if (mapped.reactionTargetId) {
      const target = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId: mapped.reactionTargetId
      });
      targetMessageId = target?.waMessageId ?? null;
    }
    if (targetMessageId) {
      await insertWaMessageReaction(trx, {
        tenantId: input.tenantId,
        waMessageId: targetMessageId,
        actorJid: mapped.senderJid,
        emoji: mapped.reactionEmoji,
        providerTs
      });
    } else if (mapped.reactionTargetId) {
      await createMissingReferenceGap(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: conversation.waConversationId,
        gapReason: "missing_reaction_target",
        targetProviderMessageId: mapped.reactionTargetId,
        sourceProviderMessageId: providerMessageId
      });
    }
  }

  if (mapped.quotedMessageId) {
    const quotedTarget = await findWaMessageByProviderId(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      providerMessageId: mapped.quotedMessageId
    });
    if (!quotedTarget) {
      await createMissingReferenceGap(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: conversation.waConversationId,
        gapReason: "missing_quoted_message",
        targetProviderMessageId: mapped.quotedMessageId,
        sourceProviderMessageId: providerMessageId
      });
    }
  }
}

export async function ingestBaileysMessagesUpsert(input: {
  tenantId: string;
  waAccountId: string;
  messages: WAMessage[];
  type: string;
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const message of input.messages) {
      await ingestSingleMessage(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        message,
        eventType: `MESSAGES_UPSERT:${input.type}`
      });
    }
    return { ok: true, count: input.messages.length };
  });
}

export async function ingestBaileysMessagesUpdate(input: {
  tenantId: string;
  waAccountId: string;
  updates: WAMessageUpdate[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const item of input.updates) {
      const mapped = mapBaileysMessageUpdate(item);
      if (!mapped) continue;

      await updateWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId: mapped.providerMessageId,
        deliveryStatus: mapped.deliveryStatus,
        bodyText: mapped.bodyText ?? undefined,
        providerPayload: item as unknown as Record<string, unknown>
      });

      const target = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId: mapped.providerMessageId
      });
      if (target && mapped.deliveryStatus) {
        emitWaMessageUpdated({
          tenantId: input.tenantId,
          waConversationId: target.waConversationId,
          waMessageId: target.waMessageId,
          providerMessageId: mapped.providerMessageId,
          deliveryStatus: mapped.deliveryStatus
        });
      }
    }
    return { ok: true, count: input.updates.length };
  });
}
