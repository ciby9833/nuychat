/**
 * 作用:
 * - Evolution API 的 WA provider 适配实现。
 *
 * 交互:
 * - 对上实现 provider-contract。
 * - 对下负责把 Evolution payload 转成内部标准事件/登录 ticket。
 *
 * 说明:
 * - 当前 Phase 1 先提供最小文本消息与登录 ticket 骨架。
 */
import crypto from "node:crypto";

import { getEvolutionConfig } from "./evolution-config.js";
import type {
  WaProviderHistoryResult,
  WaLoginSessionTicket,
  WaProviderAdapter,
  WaProviderInboundMessage,
  WaProviderSendMediaResult,
  WaProviderSendReactionResult,
  WaProviderSendTextResult,
  WaProviderWebhookResult
} from "../provider-contract.js";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeEventType(value: unknown): string {
  const text = asString(value) ?? "unknown";
  return text.replace(/\./g, "_").toUpperCase();
}

function normalizeConnectionState(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  if (normalized === "open" || normalized === "connected" || normalized === "connection_open") return "open";
  if (normalized === "close" || normalized === "closed" || normalized === "disconnected" || normalized === "connection_close") return "close";
  if (normalized === "connecting" || normalized === "connecting_to_whatsapp") return "connecting";
  if (normalized === "qr" || normalized === "qrcode" || normalized === "qr_required" || normalized === "qrcode_updated") return "qr_required";
  return normalized;
}

function extractBodyText(messageNode: Record<string, unknown> | null): string | null {
  if (!messageNode) return null;
  const conversation = asString(messageNode.conversation);
  if (conversation) return conversation;

  const richNodes = [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage"
  ];
  for (const key of richNodes) {
    const node = asRecord(messageNode[key]);
    const text = asString(node?.text) ?? asString(node?.caption) ?? asString(node?.conversation);
    if (text) return text;
  }
  return null;
}

function inferMessageType(messageNode: Record<string, unknown> | null, explicitType: string | null) {
  const normalized = explicitType?.toLowerCase() ?? "";
  if (normalized === "conversation" || normalized === "extendedtextmessage") return "text";
  if (normalized === "imagemessage") return "image";
  if (normalized === "videomessage") return "video";
  if (normalized === "audiomessage") return "audio";
  if (normalized === "documentmessage") return "document";
  if (normalized === "reactionmessage") return "reaction";

  if (!messageNode) return "text";
  if (asRecord(messageNode.reactionMessage)) return "reaction";
  if (asRecord(messageNode.imageMessage)) return "image";
  if (asRecord(messageNode.videoMessage)) return "video";
  if (asRecord(messageNode.audioMessage)) return "audio";
  if (asRecord(messageNode.documentMessage)) return "document";
  if (asRecord(messageNode.extendedTextMessage) || asString(messageNode.conversation)) return "text";
  return "text";
}

function extractQuotedMessageId(messageNode: Record<string, unknown> | null): string | null {
  const extended = asRecord(messageNode?.extendedTextMessage);
  const contextInfo = asRecord(extended?.contextInfo);
  return asString(contextInfo?.stanzaId);
}

function extractReactionMeta(messageNode: Record<string, unknown> | null) {
  const reaction = asRecord(messageNode?.reactionMessage);
  const key = asRecord(reaction?.key);
  return {
    emoji: asString(reaction?.text),
    targetId: asString(key?.id)
  };
}

function extractAttachment(messageNode: Record<string, unknown> | null, messageType: WaProviderInboundMessage["messageType"]) {
  const node =
    messageType === "image" ? asRecord(messageNode?.imageMessage) :
    messageType === "video" ? asRecord(messageNode?.videoMessage) :
    messageType === "audio" ? asRecord(messageNode?.audioMessage) :
    messageType === "document" ? asRecord(messageNode?.documentMessage) :
    null;
  if (!node) return null;

  return {
    attachmentType: messageType,
    mimeType: asString(node.mimetype) ?? asString(node.mimeType),
    fileName: asString(node.fileName),
    fileSize: asNumber(node.fileLength) ?? asNumber(node.fileSize),
    width: asNumber(node.width),
    height: asNumber(node.height),
    durationMs: asNumber(node.seconds) ? Number(node.seconds) * 1000 : asNumber(node.durationMs),
    storageUrl: asString(node.url) ?? asString(node.mediaUrl),
    previewUrl: asString(node.thumbnailDirectPath) ?? asString(node.previewUrl)
  } satisfies NonNullable<WaProviderInboundMessage["attachment"]>;
}

async function callEvolution<T>(input: {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: Record<string, unknown>;
}): Promise<T | null> {
  const config = getEvolutionConfig();
  if (!config) return null;

  const response = await fetch(`${config.baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evolution request failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

function normalizeTarget(value: string) {
  if (value.includes("@")) return value;
  return value.replace(/[^\d]/g, "");
}

function resolveLoginQrValue(payload: Record<string, unknown> | null | undefined): string {
  const qrOrCode = asString(payload?.qrOrCode);
  if (qrOrCode) return qrOrCode;

  const qrcode = asString(payload?.qrcode) ?? asString(payload?.base64);
  if (qrcode) {
    return qrcode.startsWith("data:image/")
      ? qrcode
      : `data:image/png;base64,${qrcode}`;
  }

  return asString(payload?.code) ?? "";
}

function parseMessage(item: unknown): WaProviderInboundMessage | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const providerMessageId = asString(record.messageId) ?? asString(record.id);
  const chatJid = asString(record.chatJid) ?? asString(record.chatId);
  const providerTs = asNumber(record.timestamp) ?? Date.now();
  if (!providerMessageId || !chatJid) return null;
  const conversationType = chatJid.endsWith("@g.us") ? "group" : "direct";
  const bodyText = asString(record.text) ?? asString(record.body);
  const mediaType = asString(record.mediaType)?.toLowerCase();
  const mimeType = asString(record.mimetype) ?? asString(record.mimeType);
  const reactionEmoji = asString(record.reaction) ?? asString(record.reactionText);
  const reactionTargetId = asString(record.reactionMessageId) ?? asString(record.reactionTargetId);
  const quotedMessageId = asString(record.quotedMessageId) ?? asString((record.quoted as Record<string, unknown> | undefined)?.id);

  let messageType: WaProviderInboundMessage["messageType"] = "text";
  if (reactionEmoji || reactionTargetId) messageType = "reaction";
  else if (mediaType === "image") messageType = "image";
  else if (mediaType === "video") messageType = "video";
  else if (mediaType === "audio") messageType = "audio";
  else if (mediaType === "document") messageType = "document";

  if (messageType === "text" && !bodyText) return null;

  return {
    providerMessageId,
    chatJid,
    senderJid: asString(record.senderJid) ?? asString(record.from),
    participantJid: asString(record.participantJid) ?? asString(record.participant),
    messageType,
    bodyText: bodyText ?? null,
    providerTs,
    direction: "inbound",
    conversationType,
    subject: asString(record.subject),
    contactJid: conversationType === "direct" ? chatJid : null,
    quotedMessageId,
    reactionEmoji,
    reactionTargetId,
    attachment: messageType === "text" || messageType === "reaction"
      ? null
      : {
          attachmentType: messageType,
          mimeType,
          fileName: asString(record.fileName),
          fileSize: asNumber(record.fileSize),
          width: asNumber(record.width),
          height: asNumber(record.height),
          durationMs: asNumber(record.durationMs) ?? (asNumber(record.seconds) ? Number(record.seconds) * 1000 : null),
          storageUrl: asString(record.mediaUrl) ?? asString(record.url),
          previewUrl: asString(record.previewUrl) ?? asString(record.thumbnailUrl)
        }
  };
}

function parseBaileysStyleMessage(item: unknown): WaProviderInboundMessage | null {
  const record = asRecord(item);
  const key = asRecord(record?.key);
  const messageNode = asRecord(record?.message);
  const remoteJid = asString(key?.remoteJid) ?? asString(record?.remoteJid);
  const providerMessageId = asString(key?.id) ?? asString(record?.messageId) ?? asString(record?.id);
  if (!remoteJid || !providerMessageId) return null;

  const participantJid = asString(key?.participant) ?? asString(record?.participant);
  const senderJid = key?.fromMe === true
    ? null
    : participantJid ?? remoteJid;
  const explicitType = asString(record?.messageType);
  const messageType = inferMessageType(messageNode, explicitType);
  const reactionMeta = extractReactionMeta(messageNode);
  const bodyText = messageType === "reaction" ? null : extractBodyText(messageNode);
  const chatJid = remoteJid;
  const conversationType = chatJid.endsWith("@g.us") ? "group" : "direct";

  return {
    providerMessageId,
    chatJid,
    senderJid,
    participantJid,
    messageType,
    bodyText,
    providerTs: asNumber(record?.messageTimestamp) ?? asNumber(record?.messageTimestampMs) ?? Date.now(),
    direction: "inbound",
    conversationType,
    subject: asString(record?.pushName) ?? asString(record?.subject),
    contactJid: conversationType === "direct" ? chatJid : null,
    quotedMessageId: extractQuotedMessageId(messageNode),
    reactionEmoji: reactionMeta.emoji,
    reactionTargetId: reactionMeta.targetId,
    attachment: extractAttachment(messageNode, messageType)
  };
}

export class EvolutionProviderAdapter implements WaProviderAdapter {
  readonly providerKey = "evolution";
  readonly capabilities = new Set([
    "session.login",
    "session.reconnect",
    "message.send_text",
    "message.receive_text",
    "history.sync"
  ] as const);

  async createLoginTicket(input: { tenantId: string; waAccountId: string; instanceKey: string }): Promise<WaLoginSessionTicket> {
    const config = getEvolutionConfig();
    const instanceToken = crypto.randomUUID();

    if (!config) {
      throw new Error("Evolution provider is not configured. Please set WA_EVOLUTION_BASE_URL and WA_EVOLUTION_API_KEY");
    }

    await callEvolution({
      method: "POST",
      path: "/instance/create",
      body: {
        instanceName: input.instanceKey,
        integration: "WHATSAPP-BAILEYS",
        token: instanceToken,
        qrcode: true,
        webhook: undefined
      }
    }).catch((error) => {
      if (!(error instanceof Error) || !error.message.includes("409")) throw error;
      return null;
    });

    if (config.webhookBaseUrl) {
      const webhookUrl = new URL(`/internal/wa/evolution/${input.waAccountId}/webhook`, config.webhookBaseUrl);
      webhookUrl.searchParams.set("tenantId", input.tenantId);

      await callEvolution({
        method: "POST",
        path: `/webhook/set/${encodeURIComponent(input.instanceKey)}`,
        body: {
          url: webhookUrl.toString(),
          webhook_by_events: false,
          webhook_base64: false,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "QRCODE_UPDATED", "CONNECTION_UPDATE"]
        }
      });
    }

    const connectResult = await callEvolution<{
      pairingCode?: string | null;
      code?: string;
      qrOrCode?: string;
      qrcode?: string;
      base64?: string;
      count?: number;
    }>({
      method: "GET",
      path: `/instance/connect/${encodeURIComponent(input.instanceKey)}`
    });

    const sessionRef = `${input.instanceKey}:${crypto.randomUUID()}`;
    return {
      sessionRef,
      qrCode: resolveLoginQrValue(connectResult),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
  }

  async restartSession(input: { instanceKey: string }): Promise<{ connectionState: string }> {
    const result = await callEvolution<{ instance?: { state?: string } }>({
      method: "PUT",
      path: `/instance/restart/${encodeURIComponent(input.instanceKey)}`
    });
    return {
      connectionState: result?.instance?.state ?? "reconnecting"
    };
  }

  async sendText(input: {
    instanceKey: string;
    to: string;
    text: string;
    delayMs?: number;
    quotedMessageId?: string | null;
  }): Promise<WaProviderSendTextResult> {
    const response = await callEvolution<{
      key?: { id?: string };
      status?: string;
      messageTimestamp?: string;
      message?: Record<string, unknown>;
    }>({
      method: "POST",
      path: `/message/sendText/${encodeURIComponent(input.instanceKey)}`,
      body: {
        number: normalizeTarget(input.to),
        text: input.text,
        delay: input.delayMs ?? 0,
        quoted: input.quotedMessageId
          ? {
              key: { id: input.quotedMessageId },
              message: { conversation: "" }
            }
          : undefined
      }
    });

    return {
      providerMessageId: response?.key?.id ?? crypto.randomUUID(),
      deliveryStatus: String(response?.status ?? "sent").toLowerCase(),
      providerPayload: (response ?? {}) as Record<string, unknown>
    };
  }

  async sendMedia(input: {
    instanceKey: string;
    to: string;
    mediaType: "image" | "video" | "audio" | "document";
    mimeType: string;
    fileName: string;
    mediaUrl: string;
    caption?: string | null;
    delayMs?: number;
    quotedMessageId?: string | null;
  }): Promise<WaProviderSendMediaResult> {
    const response = await callEvolution<{
      key?: { id?: string };
      status?: string;
      message?: Record<string, unknown>;
    }>({
      method: "POST",
      path: `/message/sendMedia/${encodeURIComponent(input.instanceKey)}`,
      body: {
        number: normalizeTarget(input.to),
        mediatype: input.mediaType,
        mimetype: input.mimeType,
        caption: input.caption ?? "",
        media: input.mediaUrl,
        fileName: input.fileName,
        delay: input.delayMs ?? 0,
        quoted: input.quotedMessageId
          ? {
              key: { id: input.quotedMessageId },
              message: { conversation: "" }
            }
          : undefined
      }
    });

    return {
      providerMessageId: response?.key?.id ?? crypto.randomUUID(),
      deliveryStatus: String(response?.status ?? "sent").toLowerCase(),
      providerPayload: (response ?? {}) as Record<string, unknown>
    };
  }

  async sendReaction(input: {
    instanceKey: string;
    remoteJid: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<WaProviderSendReactionResult> {
    const response = await callEvolution<{
      key?: { id?: string };
      status?: string;
      message?: Record<string, unknown>;
    }>({
      method: "POST",
      path: `/message/sendReaction/${encodeURIComponent(input.instanceKey)}`,
      body: {
        key: {
          remoteJid: input.remoteJid,
          fromMe: true,
          id: input.targetMessageId
        },
        reaction: input.emoji
      }
    });

    return {
      providerMessageId: response?.key?.id ?? crypto.randomUUID(),
      deliveryStatus: String(response?.status ?? "sent").toLowerCase(),
      providerPayload: (response ?? {}) as Record<string, unknown>
    };
  }

  async fetchHistory(input: {
    instanceKey: string;
    chatJid: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<WaProviderHistoryResult> {
    const response = await callEvolution<unknown>({
      method: "POST",
      path: `/chat/findMessages/${encodeURIComponent(input.instanceKey)}`,
      body: {
        where: {
          key: {
            remoteJid: input.chatJid
          }
        },
        limit: input.limit ?? 50
      }
    }).catch(() => null);

    const items = Array.isArray(response)
      ? response
      : Array.isArray(asRecord(response)?.messages)
        ? (asRecord(response)?.messages as unknown[])
        : [];

    return {
      messages: items
        .map((item) => parseBaileysStyleMessage(item) ?? parseMessage(item))
        .filter(Boolean) as WaProviderInboundMessage[],
      nextCursor: null
    };
  }

  parseWebhook(input: { body: Record<string, unknown> }): WaProviderWebhookResult {
    const data = asRecord(input.body.data) ?? input.body;
    const eventType = normalizeEventType(input.body.event ?? input.body.eventType);
    const sessionState = normalizeConnectionState(
      data.state ??
      input.body.sessionState ??
      input.body.connection
    );
    const rawMessages =
      Array.isArray(data.messages) ? data.messages :
      Array.isArray(data.message) ? data.message :
      Array.isArray(input.body.messages) ? input.body.messages :
      Array.isArray(input.body.data) ? input.body.data :
      [];
    const messages = rawMessages
      .map((item) => parseBaileysStyleMessage(item) ?? parseMessage(item))
      .filter(Boolean) as WaProviderInboundMessage[];
    const rawParticipants = Array.isArray(data.participants) ? data.participants : Array.isArray(input.body.participants) ? input.body.participants : [];
    const chatJid = asString(data.id) ?? asString(data.chatJid) ?? asString(input.body.chatJid) ?? asString(input.body.chatId) ?? "";
    const action = asString(data.action) as "add" | "remove" | "promote" | "demote" | null;
    const sessionQrCode = resolveLoginQrValue(data);
    const groupParticipants = chatJid && action
      ? rawParticipants
          .map((item) => asString(asRecord(item)?.id) ?? asString(item))
          .filter(Boolean)
          .map((participantJid) => ({
            chatJid,
            participantJid: participantJid as string,
            action
          }))
      : [];
    return { eventType, sessionState, sessionQrCode, messages, groupParticipants };
  }
}
