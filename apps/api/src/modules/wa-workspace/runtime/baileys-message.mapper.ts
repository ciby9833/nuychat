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

/** Safely read a chain of keys from an unknown object. */
function deepGet(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function extractBaileysBodyText(message: WAMessage["message"] | null | undefined): string | null {
  if (!message) return null;
  const m: unknown = message;

  // ── Most common types ────────────────────────────────────────────────────
  const direct =
    asString(message.conversation) ??
    asString(message.extendedTextMessage?.text) ??
    asString(message.imageMessage?.caption) ??
    asString(message.videoMessage?.caption) ??
    asString(message.documentMessage?.caption);
  if (direct) return direct;

  // ── Interactive / rich types ─────────────────────────────────────────────
  const interactive =
    // Buttons
    asString(deepGet(m, "buttonsMessage", "contentText")) ??
    asString(deepGet(m, "buttonsMessage", "text")) ??
    asString(deepGet(m, "buttonsResponseMessage", "selectedDisplayText")) ??
    // Lists
    asString(deepGet(m, "listMessage", "description")) ??
    asString(deepGet(m, "listMessage", "title")) ??
    asString(deepGet(m, "listResponseMessage", "title")) ??
    asString(deepGet(m, "listResponseMessage", "description")) ??
    // Interactive messages (WhatsApp Business)
    asString(deepGet(m, "interactiveMessage", "body", "text")) ??
    // Template messages
    asString(deepGet(m, "templateMessage", "hydratedTemplate", "hydratedContentText")) ??
    asString(deepGet(m, "templateButtonReplyMessage", "selectedDisplayText")) ??
    // Poll
    asString(deepGet(m, "pollCreationMessage", "name")) ??
    asString(deepGet(m, "pollCreationMessageV2", "name")) ??
    asString(deepGet(m, "pollCreationMessageV3", "name")) ??
    // Order messages
    asString(deepGet(m, "orderMessage", "message"));
  if (interactive) return interactive;

  // ── Wrapper / ephemeral types — recurse into inner content ───────────────
  const wrapperKeys = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "documentWithCaptionMessage"
  ];
  for (const key of wrapperKeys) {
    const inner = deepGet(m, key);
    if (inner && typeof inner === "object") {
      const innerMsg = (inner as Record<string, unknown>)["message"] as WAMessage["message"];
      const text = extractBaileysBodyText(innerMsg);
      if (text) return text;
    }
  }

  return null;
}

export function inferBaileysMessageType(message: WAMessage["message"] | null | undefined) {
  if (!message) return "text" as const;
  if (message.reactionMessage) return "reaction" as const;
  if (message.imageMessage) return "image" as const;
  if (message.videoMessage) return "video" as const;
  if (message.audioMessage) return "audio" as const;
  if (message.documentMessage) return "document" as const;
  if (message.stickerMessage) return "sticker" as const;
  if (message.locationMessage) return "location" as const;
  if (message.contactMessage || message.contactsArrayMessage) return "contact_card" as const;
  return "text" as const;
}

export function extractBaileysAttachment(message: WAMessage["message"] | null | undefined) {
  if (!message) return null;
  // Helper: WhatsApp Channels/Newsletters use `staticUrl` (a public, non-encrypted URL)
  // instead of `url` (encrypted CDN URL). Fall back to staticUrl when url is absent.
  function mediaUrl(msg: Record<string, unknown>): string | null {
    return asString(msg["url"]) ?? asString(msg["staticUrl"]);
  }

  const image = message.imageMessage;
  if (image) {
    const img = image as unknown as Record<string, unknown>;
    return {
      attachmentType: "image",
      mimeType: asString(image.mimetype),
      fileName: null,
      fileSize: asNumber(image.fileLength),
      width: asNumber(image.width),
      height: asNumber(image.height),
      durationMs: null,
      storageUrl: mediaUrl(img),
      previewUrl: null
    } as const;
  }
  const video = message.videoMessage;
  if (video) {
    const vid = video as unknown as Record<string, unknown>;
    return {
      attachmentType: "video",
      mimeType: asString(video.mimetype),
      fileName: null,
      fileSize: asNumber(video.fileLength),
      width: asNumber(video.width),
      height: asNumber(video.height),
      durationMs: asNumber(video.seconds) ? Number(video.seconds) * 1000 : null,
      storageUrl: mediaUrl(vid),
      previewUrl: null
    } as const;
  }
  const audio = message.audioMessage;
  if (audio) {
    const aud = audio as unknown as Record<string, unknown>;
    return {
      attachmentType: "audio",
      mimeType: asString(audio.mimetype),
      fileName: null,
      fileSize: asNumber(audio.fileLength),
      width: null,
      height: null,
      durationMs: asNumber(audio.seconds) ? Number(audio.seconds) * 1000 : null,
      storageUrl: mediaUrl(aud),
      previewUrl: null
    } as const;
  }
  const document = message.documentMessage;
  if (document) {
    const doc = document as unknown as Record<string, unknown>;
    return {
      attachmentType: "document",
      mimeType: asString(document.mimetype),
      fileName: asString(document.fileName),
      fileSize: asNumber(document.fileLength),
      width: null,
      height: null,
      durationMs: null,
      storageUrl: mediaUrl(doc),
      previewUrl: null
    } as const;
  }
  const sticker = message.stickerMessage;
  if (sticker) {
    const stk = sticker as unknown as Record<string, unknown>;
    return {
      attachmentType: "sticker",
      mimeType: asString(sticker.mimetype) ?? "image/webp",
      fileName: null,
      fileSize: asNumber(sticker.fileLength),
      width: asNumber(sticker.width),
      height: asNumber(sticker.height),
      durationMs: null,
      storageUrl: mediaUrl(stk),
      previewUrl: null
    } as const;
  }
  const location = message.locationMessage;
  if (location) {
    const lat = location.degreesLatitude;
    const lng = location.degreesLongitude;
    const name = asString(location.name) ?? asString(location.address);
    return {
      attachmentType: "location",
      mimeType: null,
      fileName: name,
      fileSize: null,
      width: typeof lat === "number" ? lat : null,
      height: typeof lng === "number" ? lng : null,
      durationMs: null,
      storageUrl: lat != null && lng != null
        ? `https://maps.google.com/?q=${lat},${lng}`
        : null,
      previewUrl: asString(location.jpegThumbnail
        ? `data:image/jpeg;base64,${Buffer.from(location.jpegThumbnail as Uint8Array).toString("base64")}`
        : null)
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
