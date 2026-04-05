/**
 * 作用:
 * - 处理 Baileys 的群组、聊天元数据与历史同步事件。
 *
 * 交互:
 * - 被 runtime manager 在 `messaging-history.set` / `groups.update` /
 *   `group-participants.update` / `chats.update` 时调用。
 * - 为 reconcile 与工作台会话详情提供更完整的历史和群信息。
 */
import type { Chat, GroupMetadata, ParticipantAction, WAMessage } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../infra/db/client.js";
import { mapBaileysMessageToInbound } from "./runtime/baileys-message.mapper.js";
import {
  findWaMessageByProviderId,
  insertWaMessage,
  insertWaMessageAttachment,
  upsertWaConversation,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";

export async function ingestBaileysHistorySet(input: {
  tenantId: string;
  waAccountId: string;
  messages: WAMessage[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    let inserted = 0;
    for (const raw of input.messages) {
      const mapped = mapBaileysMessageToInbound(raw);
      if (!mapped) continue;

      const existing = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId: mapped.providerMessageId
      });
      if (existing) continue;

      const conversation = await upsertWaConversation(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        chatJid: mapped.chatJid,
        conversationType: mapped.conversationType,
        subject: mapped.subject ?? null,
        contactJid: mapped.contactJid ?? null
      });

      const saved = await insertWaMessage(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: conversation.waConversationId,
        providerMessageId: mapped.providerMessageId,
        direction: mapped.direction,
        senderJid: mapped.senderJid,
        participantJid: mapped.participantJid ?? null,
        senderRole: mapped.senderRole,
        bodyText: mapped.bodyText ?? undefined,
        providerTs: mapped.providerTs,
        messageType: mapped.messageType,
        quotedMessageId: mapped.quotedMessageId ?? null,
        providerPayload: raw as unknown as Record<string, unknown>,
        deliveryStatus: "history_sync"
      });

      if (mapped.attachment) {
        await insertWaMessageAttachment(trx, {
          tenantId: input.tenantId,
          waMessageId: String(saved.wa_message_id),
          attachmentType: mapped.attachment.attachmentType,
          mimeType: mapped.attachment.mimeType ?? null,
          fileName: mapped.attachment.fileName ?? null,
          fileSize: mapped.attachment.fileSize ?? null,
          width: mapped.attachment.width ?? null,
          height: mapped.attachment.height ?? null,
          durationMs: mapped.attachment.durationMs ?? null,
          storageUrl: mapped.attachment.storageUrl ?? null,
          previewUrl: mapped.attachment.previewUrl ?? null,
          providerPayload: raw as unknown as Record<string, unknown>
        });
      }
      inserted += 1;
    }
    return { ok: true, inserted };
  });
}

export async function ingestBaileysGroupsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  groups: Partial<GroupMetadata>[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const group of input.groups) {
      if (!group.id) continue;
      const conversation = await upsertWaConversation(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        chatJid: group.id,
        conversationType: "group",
        subject: typeof group.subject === "string" ? group.subject : null
      });

      for (const participant of group.participants ?? []) {
        if (!participant.id) continue;
        await upsertWaConversationMember(trx, {
          tenantId: input.tenantId,
          waConversationId: conversation.waConversationId,
          participantJid: participant.id,
          isAdmin: participant.admin === "admin" || participant.admin === "superadmin"
        });
      }
    }
    return { ok: true, count: input.groups.length };
  });
}

export async function ingestBaileysGroupParticipantsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  chatJid: string;
  participants: Array<{ id?: string | null } | string>;
  action: ParticipantAction;
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    const conversation = await upsertWaConversation(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatJid: input.chatJid,
      conversationType: "group"
    });

    for (const participant of input.participants) {
      const participantJid = typeof participant === "string" ? participant : (participant.id ?? null);
      if (!participantJid) continue;
      await upsertWaConversationMember(trx, {
        tenantId: input.tenantId,
        waConversationId: conversation.waConversationId,
        participantJid,
        left: input.action === "remove",
        isAdmin: input.action === "promote" ? true : input.action === "demote" ? false : undefined
      });
    }
    return { ok: true };
  });
}

export async function ingestBaileysChatsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  chats: Partial<Chat>[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const chat of input.chats) {
      if (!chat.id) continue;
      await upsertWaConversation(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        chatJid: chat.id,
        conversationType: chat.id.endsWith("@g.us") ? "group" : "direct",
        subject: typeof chat.name === "string" ? chat.name : null,
        contactJid: chat.id.endsWith("@g.us") ? null : chat.id
      });
    }
    return { ok: true, count: input.chats.length };
  });
}
