/**
 * 作用:
 * - 处理 provider webhook 入站，转为 WA 域标准数据。
 *
 * 交互:
 * - 调用 provider adapter 解析第三方 payload。
 * - 调用会话/消息 repository 落原始事件、会话、消息。
 */
import type { Knex } from "knex";

import { getWaProviderAdapter } from "./provider/provider-registry.js";
import { getWaAccountById } from "./wa-account.repository.js";
import {
  findWaMessageByProviderId,
  insertRawEvent,
  insertWaMessage,
  insertWaMessageAttachment,
  insertWaMessageReaction,
  upsertWaConversation,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";
import {
  createMissingReferenceGap,
  resolveGapsForArrivedMessage
} from "./wa-reconcile.service.js";

export async function ingestEvolutionWebhook(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; body: Record<string, unknown> }
) {
  const account = await getWaAccountById(trx, input.tenantId, input.waAccountId);
  if (!account) throw new Error("WA account not found");

  const provider = getWaProviderAdapter(account.providerKey);
  const parsed = provider.parseWebhook({ body: input.body });

  if (parsed.sessionState || parsed.sessionQrCode) {
    const sessionMetaUpdates: Record<string, unknown> = {};
    if (parsed.sessionQrCode) {
      sessionMetaUpdates.qrCode = parsed.sessionQrCode;
    }
    await trx("wa_account_sessions")
      .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
      .update({
        ...(parsed.sessionState ? { connection_state: parsed.sessionState } : {}),
        heartbeat_at: trx.fn.now(),
        ...(parsed.sessionQrCode
          ? {
              session_meta: trx.raw(
                "coalesce(session_meta, '{}'::jsonb) || ?::jsonb",
                [JSON.stringify(sessionMetaUpdates)]
              )
            }
          : {}),
        updated_at: trx.fn.now()
      });
    if (parsed.sessionState) {
      await trx("wa_accounts")
        .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
        .update({
          account_status: parsed.sessionState === "open" ? "online" : "offline",
          last_connected_at: parsed.sessionState === "open" ? trx.fn.now() : trx.raw("last_connected_at"),
          last_disconnected_at: parsed.sessionState === "open" ? trx.raw("last_disconnected_at") : trx.fn.now(),
          updated_at: trx.fn.now()
        });
    }
  }

  let inserted = 0;
  for (const message of parsed.messages) {
    const eventKey = `${parsed.eventType}:${message.providerMessageId}`;
    const rawEvent = await insertRawEvent(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      providerEventType: parsed.eventType,
      providerEventKey: eventKey,
      providerTs: message.providerTs,
      payload: input.body
    });
    if (!rawEvent) continue;

    const conversation = await upsertWaConversation(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatJid: message.chatJid,
      conversationType: message.conversationType,
      subject: message.subject ?? null,
      contactJid: message.contactJid ?? null
    });

    const savedMessage = await insertWaMessage(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      waConversationId: conversation.waConversationId,
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      senderJid: message.senderJid,
      participantJid: message.participantJid ?? null,
      senderRole: message.conversationType === "group" ? "group_member" : "customer",
      bodyText: message.bodyText ?? undefined,
      providerTs: message.providerTs,
      messageType: message.messageType,
      quotedMessageId: message.quotedMessageId ?? null,
      providerPayload: input.body
    });

    await resolveGapsForArrivedMessage(trx, {
      tenantId: input.tenantId,
      waConversationId: conversation.waConversationId,
      providerMessageId: message.providerMessageId
    });

    if (message.conversationType === "group" && message.participantJid) {
      await upsertWaConversationMember(trx, {
        tenantId: input.tenantId,
        waConversationId: conversation.waConversationId,
        participantJid: message.participantJid
      });
    }

    if (message.attachment) {
      await insertWaMessageAttachment(trx, {
        tenantId: input.tenantId,
        waMessageId: String(savedMessage.wa_message_id),
        attachmentType: message.attachment.attachmentType,
        mimeType: message.attachment.mimeType ?? null,
        fileName: message.attachment.fileName ?? null,
        fileSize: message.attachment.fileSize ?? null,
        width: message.attachment.width ?? null,
        height: message.attachment.height ?? null,
        durationMs: message.attachment.durationMs ?? null,
        storageUrl: message.attachment.storageUrl ?? null,
        previewUrl: message.attachment.previewUrl ?? null,
        providerPayload: input.body
      });
    }

    if (message.messageType === "reaction" && message.reactionEmoji) {
      let targetMessageId: string | null = null;
      if (message.reactionTargetId) {
        const target = await findWaMessageByProviderId(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          providerMessageId: message.reactionTargetId
        });
        targetMessageId = target?.waMessageId ?? null;
      }
      if (targetMessageId) {
        await insertWaMessageReaction(trx, {
          tenantId: input.tenantId,
          waMessageId: targetMessageId,
          actorJid: message.senderJid,
          emoji: message.reactionEmoji,
          providerTs: message.providerTs
        });
      } else if (message.reactionTargetId) {
        await createMissingReferenceGap(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          waConversationId: conversation.waConversationId,
          gapReason: "missing_reaction_target",
          targetProviderMessageId: message.reactionTargetId,
          sourceProviderMessageId: message.providerMessageId
        });
      }
    }

    if (message.quotedMessageId) {
      const quotedTarget = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId: message.quotedMessageId
      });
      if (!quotedTarget) {
        await createMissingReferenceGap(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          waConversationId: conversation.waConversationId,
          gapReason: "missing_quoted_message",
          targetProviderMessageId: message.quotedMessageId,
          sourceProviderMessageId: message.providerMessageId
        });
      }
    }
    inserted += 1;
  }

  for (const participantEvent of parsed.groupParticipants) {
    const conversation = await upsertWaConversation(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatJid: participantEvent.chatJid,
      conversationType: "group"
    });
    await upsertWaConversationMember(trx, {
      tenantId: input.tenantId,
      waConversationId: conversation.waConversationId,
      participantJid: participantEvent.participantJid,
      left: participantEvent.action === "remove",
      isAdmin: participantEvent.action === "promote" ? true : participantEvent.action === "demote" ? false : undefined
    });
  }

  return {
    ok: true,
    eventType: parsed.eventType,
    insertedMessages: inserted,
    sessionState: parsed.sessionState ?? null
  };
}
