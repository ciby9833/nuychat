/**
 * 作用:
 * - 负责把 Baileys 原始消息与状态更新映射为 WA 域标准结构。
 *
 * 交互:
 * - 被 Baileys 事件消费服务与 provider.fetchHistory 复用。
 * - 统一处理文本、媒体、reaction、引用回复、送达状态。
 */
import { WAMessageStatus, type WAMessage, type WAMessageUpdate } from "@whiskeysockets/baileys";

import type { WaNormalizedMessage } from "../provider/provider-contract.js";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

export function mapBaileysDeliveryStatus(status?: number | null) {
  if (status === WAMessageStatus.ERROR) return "failed";
  if (status === WAMessageStatus.PENDING) return "pending";
  if (status === WAMessageStatus.SERVER_ACK) return "server_ack";
  if (status === WAMessageStatus.DELIVERY_ACK) return "delivered";
  if (status === WAMessageStatus.READ) return "read";
  if (status === WAMessageStatus.PLAYED) return "played";
  return null;
}

export function extractBaileysBodyText(message: WAMessage["message"] | null | undefined): string | null {
  if (!message) return null;
  return (
    asString(message.conversation) ??
    asString(message.extendedTextMessage?.text) ??
    asString(message.imageMessage?.caption) ??
    asString(message.videoMessage?.caption) ??
    asString(message.documentMessage?.caption) ??
    null
  );
}

export function inferBaileysMessageType(message: WAMessage["message"] | null | undefined) {
  if (!message) return "text" as const;
  if (message.reactionMessage) return "reaction" as const;
  if (message.imageMessage) return "image" as const;
  if (message.videoMessage) return "video" as const;
  if (message.audioMessage) return "audio" as const;
  if (message.documentMessage) return "document" as const;
  return "text" as const;
}

export function extractBaileysAttachment(message: WAMessage["message"] | null | undefined) {
  if (!message) return null;
  const image = message.imageMessage;
  if (image) {
    return {
      attachmentType: "image",
      mimeType: asString(image.mimetype),
      fileName: null,
      fileSize: asNumber(image.fileLength),
      width: asNumber(image.width),
      height: asNumber(image.height),
      durationMs: null,
      storageUrl: asString(image.url),
      previewUrl: null
    } as const;
  }
  const video = message.videoMessage;
  if (video) {
    return {
      attachmentType: "video",
      mimeType: asString(video.mimetype),
      fileName: null,
      fileSize: asNumber(video.fileLength),
      width: asNumber(video.width),
      height: asNumber(video.height),
      durationMs: asNumber(video.seconds) ? Number(video.seconds) * 1000 : null,
      storageUrl: asString(video.url),
      previewUrl: null
    } as const;
  }
  const audio = message.audioMessage;
  if (audio) {
    return {
      attachmentType: "audio",
      mimeType: asString(audio.mimetype),
      fileName: null,
      fileSize: asNumber(audio.fileLength),
      width: null,
      height: null,
      durationMs: asNumber(audio.seconds) ? Number(audio.seconds) * 1000 : null,
      storageUrl: asString(audio.url),
      previewUrl: null
    } as const;
  }
  const document = message.documentMessage;
  if (document) {
    return {
      attachmentType: "document",
      mimeType: asString(document.mimetype),
      fileName: asString(document.fileName),
      fileSize: asNumber(document.fileLength),
      width: null,
      height: null,
      durationMs: null,
      storageUrl: asString(document.url),
      previewUrl: null
    } as const;
  }
  return null;
}

export function mapBaileysMessageToInbound(message: WAMessage): WaNormalizedMessage | null {
  const remoteJid = asString(message.key?.remoteJid);
  const providerMessageId = asString(message.key?.id);
  if (!remoteJid || !providerMessageId) return null;

  const conversationType = remoteJid.endsWith("@g.us") ? "group" : "direct";
  const participantJid = asString(message.key?.participant);
  const fromMe = Boolean(message.key?.fromMe);
  const senderJid = fromMe ? remoteJid : (participantJid ?? remoteJid);
  const messageType = inferBaileysMessageType(message.message);
  const reaction = message.message?.reactionMessage;
  const direction = fromMe ? "outbound" : "inbound";
  const senderRole =
    fromMe
      ? "wa_account"
      : conversationType === "group"
        ? "group_member"
        : "customer";

  return {
    providerMessageId,
    chatJid: remoteJid,
    senderJid,
    participantJid: participantJid ?? null,
    messageType,
    bodyText: extractBaileysBodyText(message.message),
    providerTs: asNumber(message.messageTimestamp) ? Number(message.messageTimestamp) * 1000 : Date.now(),
    direction,
    senderRole,
    conversationType,
    // pushName on outbound (fromMe) messages is the account's own display name, not the contact's.
    // For groups, pushName is the sender's name (not the group name — that comes from groups.update).
    subject: conversationType === "direct" && !fromMe ? asString(message.pushName) : null,
    contactName: conversationType === "direct" && !fromMe ? asString(message.pushName) : null,
    contactPhoneE164: conversationType === "direct" ? derivePhoneE164FromJid(remoteJid) : null,
    contactJid: conversationType === "direct" ? remoteJid : null,
    quotedMessageId: asString(message.message?.extendedTextMessage?.contextInfo?.stanzaId),
    reactionEmoji: asString(reaction?.text),
    reactionTargetId: asString(reaction?.key?.id),
    attachment: extractBaileysAttachment(message.message)
  };
}

export function mapBaileysMessageUpdate(input: WAMessageUpdate) {
  const providerMessageId = asString(input.key?.id);
  if (!providerMessageId) return null;
  return {
    providerMessageId,
    deliveryStatus:
      mapBaileysDeliveryStatus(asNumber(input.update.status)) ??
      (input.update.message === null ? "revoked" : null),
    bodyText: extractBaileysBodyText(input.update.message ?? undefined)
  };
}
