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
  patchWaConversationContactProfile,
  patchWaConversationMemberProfile,
  updateWaMessageByProviderId,
  upsertWaConversation,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";
import { emitWaConversationProjection } from "./wa-conversation-projection.service.js";
import { processWaMonitorMessage } from "./wa-monitor.service.js";
import { createMissingReferenceGap, resolveGapsForArrivedMessage } from "./wa-reconcile.service.js";
import { emitWaMessageReceived, emitWaMessageUpdated } from "./wa-realtime.service.js";

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePhoneE164(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : null;
}

function derivePhoneE164FromJid(jid: string | null) {
  if (!jid) return null;
  // Only individual WA JIDs (@s.whatsapp.net) carry a phone number.
  // Group JIDs (@g.us) and privacy-preserving LID JIDs (@lid) must not produce phone numbers.
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  const local = jid.split("@")[0] ?? "";
  return /^[0-9]+$/.test(local) ? normalizePhoneE164(local) : null;
}

export async function ingestSingleBaileysMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    message: WAMessage;
    eventType: string;
  }
) {
  const mapped = mapBaileysMessageToInbound(input.message);
  if (!mapped) return null;
  const pushName = typeof input.message.pushName === "string" && input.message.pushName.trim()
    ? input.message.pushName.trim()
    : null;
  const participantAlt = typeof input.message.key?.participantAlt === "string" && input.message.key.participantAlt.trim()
    ? input.message.key.participantAlt.trim()
    : null;
  const fallbackPhone = derivePhoneE164FromJid(participantAlt);

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
  if (!rawEvent) return null;

  const conversation = await upsertWaConversation(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    chatJid: remoteJid,
    conversationType: mapped.conversationType,
    subject: mapped.subject ?? null,
    contactJid: mapped.contactJid ?? null,
    contactName: mapped.contactName ?? null,
    contactPhoneE164: mapped.contactPhoneE164 ?? null
  });

  if (mapped.conversationType === "direct" && mapped.direction === "inbound") {
    await patchWaConversationContactProfile(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatKeys: [mapped.chatJid],
      contactName: pushName,
      contactPhoneE164: fallbackPhone
    });
  }

  const existingMessage = await findWaMessageByProviderId(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    providerMessageId
  });
  if (existingMessage) {
    return {
      waConversationId: conversation.waConversationId,
      waMessageId: existingMessage.waMessageId,
      direction: mapped.direction,
      messageType: mapped.messageType,
      bodyText: mapped.bodyText ?? null,
      senderDisplayName: pushName,
      participantJid: mapped.participantJid ?? null,
      providerMessageId
    };
  }

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
      participantJid: mapped.participantJid,
      displayName: pushName
    });
    if (participantAlt) {
      await patchWaConversationMemberProfile(trx, {
        tenantId: input.tenantId,
        participantKeys: [participantAlt],
        displayName: pushName
      });
    }
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

  await processWaMonitorMessage(trx, {
    tenantId: input.tenantId,
    waMessageId: String(savedMessage.wa_message_id)
  }).catch((error) => {
    console.warn("[wa-monitor] failed to process monitor facts:", error);
  });

  return {
    waConversationId: conversation.waConversationId,
    waMessageId: String(savedMessage.wa_message_id),
    direction: mapped.direction,
    messageType: mapped.messageType,
    bodyText: mapped.bodyText ?? null,
    senderDisplayName: pushName,
    participantJid: mapped.participantJid ?? null,
    providerMessageId
  };
}

export async function ingestBaileysMessagesUpsert(input: {
  tenantId: string;
  waAccountId: string;
  messages: WAMessage[];
  type: string;
}) {
  // Process each message in its own transaction so a single bad JID
  // (e.g. @newsletter) cannot roll back the entire batch.
  const touchedResults: Array<{
    waConversationId: string;
    waMessageId: string;
    direction: string;
    messageType: string;
    bodyText: string | null;
    senderDisplayName: string | null;
    participantJid: string | null;
    providerMessageId: string;
  }> = [];
  for (const message of input.messages) {
    try {
      const result = await withTenantTransaction(input.tenantId, async (trx) => {
        return ingestSingleBaileysMessage(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          message,
          eventType: `MESSAGES_UPSERT:${input.type}`
        });
      });
      if (result) {
        touchedResults.push(result);
      }
    } catch (err) {
      // Log and skip individual message failures so the rest of the batch succeeds.
      const jid = (message.key?.remoteJid ?? "unknown");
      console.warn(`[ingestBaileysMessagesUpsert] skipping message from jid=${jid}:`, err);
    }
  }
  const conversationIds = Array.from(new Set(touchedResults.map((item) => item.waConversationId)));
  const conversations = new Map<string, Awaited<ReturnType<typeof emitWaConversationProjection>>>();
  for (const waConversationId of conversationIds) {
    const conversation = await emitWaConversationProjection({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      waConversationId
    });
    conversations.set(waConversationId, conversation);
  }
  // Only send real-time "new message" notifications for live messages (type="notify").
  // Historical messages delivered during a sync session (type="append", "historical", etc.)
  // must never trigger browser/push notifications — they could spam the user with
  // hundreds of alerts for old conversations during the initial WhatsApp connection.
  const isLiveNotify = input.type === "notify";
  for (const result of touchedResults) {
    const conversation = conversations.get(result.waConversationId) ?? null;
    if (isLiveNotify && result.direction === "inbound" && conversation) {
      emitWaMessageReceived({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: result.waConversationId,
        waMessageId: result.waMessageId,
        providerMessageId: result.providerMessageId,
        direction: result.direction,
        messageType: result.messageType,
        bodyText: result.bodyText,
        senderDisplayName: result.senderDisplayName,
        participantJid: result.participantJid,
        conversationDisplayName: conversation.displayName,
        conversationSecondaryLabel: conversation.secondaryLabel ?? null,
        unreadCount: conversation.unreadCount
      });
    }
  }
  return { ok: true, count: input.messages.length };
}

export async function ingestBaileysMessagesUpdate(input: {
  tenantId: string;
  waAccountId: string;
  updates: WAMessageUpdate[];
}) {
  // Process each update in its own transaction so one bad item cannot roll back the batch.
  const affectedConversationIds = new Set<string>();

  for (const item of input.updates) {
    try {
      await withTenantTransaction(input.tenantId, async (trx) => {
        const mapped = mapBaileysMessageUpdate(item);
        if (!mapped) return;

        // For revoked messages, explicitly clear body_text so the DB matches the WA state.
        const bodyText = mapped.deliveryStatus === "revoked" ? null : (mapped.bodyText || undefined);
        const revokedAt = mapped.deliveryStatus === "revoked" ? new Date().toISOString() : undefined;

        await updateWaMessageByProviderId(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          providerMessageId: mapped.providerMessageId,
          deliveryStatus: mapped.deliveryStatus,
          bodyText,
          providerPayload: item as unknown as Record<string, unknown>
        });

        const target = await findWaMessageByProviderId(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          providerMessageId: mapped.providerMessageId
        });
        if (!target) return;

        affectedConversationIds.add(target.waConversationId);

        // Emit for: delivery status changes, edits (bodyText), and revokes.
        const hasDeliveryChange = Boolean(mapped.deliveryStatus);
        const hasBodyChange = bodyText !== undefined;
        if (hasDeliveryChange || hasBodyChange) {
          emitWaMessageUpdated({
            tenantId: input.tenantId,
            waConversationId: target.waConversationId,
            waMessageId: target.waMessageId,
            providerMessageId: mapped.providerMessageId,
            deliveryStatus: mapped.deliveryStatus ?? "",
            bodyText: hasBodyChange ? (bodyText ?? null) : undefined,
            revokedAt
          });
        }
      });
    } catch (err) {
      const jid = (item.key?.remoteJid ?? "unknown");
      console.warn(`[ingestBaileysMessagesUpdate] skipping update for jid=${jid}:`, err);
    }
  }

  // Refresh conversation projections so last-message preview stays accurate after edits/revokes.
  for (const waConversationId of affectedConversationIds) {
    await emitWaConversationProjection({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      waConversationId
    });
  }

  return { ok: true, count: input.updates.length };
}
