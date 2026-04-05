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

export class EvolutionProviderAdapter implements WaProviderAdapter {
  readonly providerKey = "evolution";
  readonly capabilities = new Set([
    "session.login",
    "session.reconnect",
    "message.send_text",
    "message.receive_text"
  ] as const);

  async createLoginTicket(input: { tenantId: string; waAccountId: string; instanceKey: string }): Promise<WaLoginSessionTicket> {
    const config = getEvolutionConfig();
    const instanceToken = crypto.randomUUID();

    if (!config) {
      const sessionRef = `${input.instanceKey}:${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const qrCode = `wa-login://${input.tenantId}/${input.waAccountId}/${encodeURIComponent(sessionRef)}`;
      return { sessionRef, qrCode, expiresAt };
    }

    await callEvolution({
      method: "POST",
      path: "/instance/create",
      body: {
        instanceName: input.instanceKey,
        integration: "WHATSAPP-BAILEYS",
        token: instanceToken,
        qrcode: true,
        webhook: config.webhookBaseUrl
          ? {
              enabled: true,
              url: `${config.webhookBaseUrl}/internal/wa/evolution/${input.waAccountId}/webhook`,
              webhook_by_events: true,
              events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "QRCODE_UPDATED", "CONNECTION_UPDATE"]
            }
          : undefined
      }
    }).catch((error) => {
      if (!(error instanceof Error) || !error.message.includes("409")) throw error;
      return null;
    });

    const connectResult = await callEvolution<{ pairingCode?: string; code?: string; count?: number }>({
      method: "GET",
      path: `/instance/connect/${encodeURIComponent(input.instanceKey)}`
    });

    const sessionRef = `${input.instanceKey}:${crypto.randomUUID()}`;
    return {
      sessionRef,
      qrCode: connectResult?.code ?? "",
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

  parseWebhook(input: { body: Record<string, unknown> }): WaProviderWebhookResult {
    const eventType = asString(input.body.eventType) ?? "unknown";
    const sessionState = asString(input.body.sessionState);
    const rawMessages = Array.isArray(input.body.messages) ? input.body.messages : [];
    const messages = rawMessages.map(parseMessage).filter(Boolean) as WaProviderInboundMessage[];
    const rawParticipants = Array.isArray(input.body.participants) ? input.body.participants : [];
    const chatJid = asString(input.body.chatJid) ?? asString(input.body.chatId) ?? "";
    const action = asString(input.body.action) as "add" | "remove" | "promote" | "demote" | null;
    const groupParticipants = chatJid && action
      ? rawParticipants
          .map((item) => asString(item))
          .filter(Boolean)
          .map((participantJid) => ({
            chatJid,
            participantJid: participantJid as string,
            action
          }))
      : [];
    return { eventType, sessionState, messages, groupParticipants };
  }
}
