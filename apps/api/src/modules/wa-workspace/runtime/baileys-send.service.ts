/**
 * 作用:
 * - 封装 Baileys sendMessage，供出站 worker 调用。
 *
 * 交互:
 * - 依赖 runtime manager 获取账号对应的 socket。
 * - 对上返回 provider-neutral 的发送结果，供 wa-outbound.service 回写消息状态。
 */
import path from "node:path";

import type { AnyMessageContent, WAMessage } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../../infra/db/client.js";
import { getUploadsDir } from "../../../infra/storage/upload.service.js";
import { mapBaileysDeliveryStatus } from "./baileys-message.mapper.js";
import { ensureBaileysRuntime, getBaileysRuntime, restartBaileysRuntime } from "./baileys-runtime.manager.js";

const SEND_READY_TIMEOUT_MS = 15_000;
const SEND_MESSAGE_TIMEOUT_MS = 45_000;

/**
 * Baileys receives a `url` field for media messages and resolves it internally.
 * When the URL is a relative local upload path like "/uploads/xxx.png", Baileys
 * calls createReadStream("/uploads/xxx.png") which fails with ENOENT because the
 * real uploads directory is at UPLOADS_DIR (e.g. "data/uploads/").
 *
 * Convert any "/uploads/..." path to the real absolute disk path so Baileys can
 * open the file. HTTP/HTTPS URLs are returned unchanged.
 */
function resolveMediaUrl(url: string): string {
  if (url.startsWith("/uploads/")) {
    return path.join(getUploadsDir(), path.basename(url));
  }
  return url;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function waitForRuntimeOpen(input: {
  tenantId: string;
  waAccountId: string;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();
  let lastState = getBaileysRuntime(input.tenantId, input.waAccountId)?.connectionState ?? "missing";

  while (Date.now() - startedAt < (input.timeoutMs ?? SEND_READY_TIMEOUT_MS)) {
    const runtime = getBaileysRuntime(input.tenantId, input.waAccountId);
    lastState = runtime?.connectionState ?? "missing";
    if (runtime?.connectionState === "open") return runtime;
    await delay(250);
  }

  throw new Error(`WhatsApp runtime is not ready for sending (state=${lastState})`);
}

/**
 * Converts a WAMessage["message"] that was round-tripped through JSON storage
 * into a form that Baileys' protobuf serializer can safely handle.
 *
 * Problem: Node.js Buffer fields (mediaKey, fileSha256, jpegThumbnail, waveform …)
 * are stored in the DB as `{"type":"Buffer","data":[...]}` plain objects after
 * JSON.stringify.  When Baileys calls `proto.Message.fromObject()` on the quoted
 * context it cannot reconstruct proto `bytes` fields from that form — it either
 * emits empty buffers or throws, crashing the send.
 *
 * Solution: For text messages keep the text content as-is.  For ALL media types
 * (image, video, audio, document, sticker …) replace the whole media object with
 * a simple `{conversation: "[类型]"}` fallback.  WhatsApp only needs the message
 * ID (stanzaId) to look up the original message on its servers; the quoted content
 * object is merely a local preview shown in the bubble.
 */
function sanitizeMessageForQuote(rawMsg: unknown): WAMessage["message"] {
  if (!rawMsg || typeof rawMsg !== "object") {
    return { conversation: "[引用消息]" };
  }

  const msg = rawMsg as Record<string, unknown>;

  // Plain text — safe to pass as-is.
  if (typeof msg.conversation === "string") {
    return { conversation: msg.conversation };
  }

  // Extended text (links etc.) — keep only the text field.
  if (msg.extendedTextMessage && typeof msg.extendedTextMessage === "object") {
    const ext = msg.extendedTextMessage as Record<string, unknown>;
    if (typeof ext.text === "string") {
      return { extendedTextMessage: { text: ext.text } };
    }
  }

  // Media types: replace with safe text label so protobuf serialization never
  // chokes on JSON-serialized Buffer objects.
  const mediaLabels: Record<string, string> = {
    imageMessage:    "[图片消息]",
    videoMessage:    "[视频消息]",
    audioMessage:    "[语音消息]",
    documentMessage: "[文件消息]",
    stickerMessage:  "[贴纸]",
    gifMessage:      "[GIF]",
    locationMessage: "[位置消息]",
    contactMessage:  "[联系人名片]",
    productMessage:  "[商品消息]",
    listMessage:     "[列表消息]",
    buttonsMessage:  "[按钮消息]",
  };

  for (const [key, label] of Object.entries(mediaLabels)) {
    if (msg[key]) return { conversation: label };
  }

  // Unknown type — use a generic fallback.
  return { conversation: "[引用消息]" };
}

async function buildQuotedMessage(
  tenantId: string,
  waAccountId: string,
  chatJid: string,
  quotedMessageId?: string | null
): Promise<WAMessage | undefined> {
  if (!quotedMessageId) return undefined;

  const normalizedQuotedMessageId = quotedMessageId.trim();
  const quotedMessageIdIsUuid = isUuidLike(normalizedQuotedMessageId);

  const row = await withTenantTransaction(tenantId, async (trx) =>
    trx("wa_messages")
      .where("tenant_id", tenantId)
      .where("wa_account_id", waAccountId)
      .andWhere((builder) => {
        builder.where("provider_message_id", normalizedQuotedMessageId);
        if (quotedMessageIdIsUuid) {
          builder.orWhere("wa_message_id", normalizedQuotedMessageId);
        }
      })
      .select("provider_message_id", "direction", "participant_jid", "sender_jid", "provider_payload")
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>()
  );
  if (!row) {
    console.warn("[baileys-send] buildQuotedMessage: message not found", {
      quotedMessageId: normalizedQuotedMessageId,
      lookupBy: quotedMessageIdIsUuid ? ["provider_message_id", "wa_message_id"] : ["provider_message_id"]
    });
    return undefined;
  }

  // Must use the WhatsApp provider message ID, not our internal UUID.
  const providerMessageId =
    typeof row.provider_message_id === "string" && row.provider_message_id.trim()
      ? row.provider_message_id.trim()
      : null;
  if (!providerMessageId) {
    // Message hasn't been delivered to WhatsApp yet (still pending/failed). Skip the quote.
    console.warn("[baileys-send] buildQuotedMessage: no provider_message_id yet", {
      quotedMessageId: normalizedQuotedMessageId
    });
    return undefined;
  }

  const payload = typeof row.provider_payload === "string"
    ? JSON.parse(String(row.provider_payload))
    : (row.provider_payload as Record<string, unknown> | null);

  // Strip binary blobs that cannot survive JSON round-trip so Baileys can
  // serialize the quoted context info without errors.
  const message = sanitizeMessageForQuote(payload?.message);

  // For group messages, Baileys requires `participant` in the key.
  const isGroup = chatJid.endsWith("@g.us");
  const participant = isGroup
    ? ((row.participant_jid ? String(row.participant_jid) : null) ?? (row.sender_jid ? String(row.sender_jid) : null) ?? undefined)
    : undefined;

  return {
    key: {
      remoteJid: chatJid,
      id: providerMessageId,
      fromMe: String(row.direction) === "outbound",
      ...(participant ? { participant } : {})
    },
    message
  };
}

export async function sendBaileysMessage(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  chatJid: string;
  jobType: "send_text" | "send_media" | "send_reaction";
  text?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  mimeType?: string;
  fileName?: string;
  mediaUrl?: string;
  emoji?: string;
  reactionTargetId?: string;
  quotedMessageId?: string | null;
  mentionJids?: string[] | null;
}) {
  const ensureRuntime = async (forceRestart = false) => {
    if (forceRestart) {
      await restartBaileysRuntime({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        instanceKey: input.instanceKey,
        loginMode: "worker_send_retry"
      });
    }
    let runtime = getBaileysRuntime(input.tenantId, input.waAccountId);
    if (!runtime || runtime.connectionState === "close") {
      runtime = await ensureBaileysRuntime({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        instanceKey: input.instanceKey,
        loginMode: "worker_send",
        forceNew: forceRestart
      });
    }
    if (runtime.connectionState !== "open") {
      return waitForRuntimeOpen({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId
      });
    }
    return runtime;
  };

  let runtime = await ensureRuntime(false);

  const quoted = await buildQuotedMessage(input.tenantId, input.waAccountId, input.chatJid, input.quotedMessageId);

  let content: AnyMessageContent;
  const mentions = Array.from(new Set((input.mentionJids ?? []).map((jid) => jid.trim()).filter(Boolean)));
  if (input.jobType === "send_media") {
    if (!input.mediaUrl || !input.mediaType) {
      throw new Error("mediaUrl and mediaType are required");
    }
    // Resolve "/uploads/..." relative paths to absolute disk paths so Baileys
    // can read the file. HTTP/HTTPS URLs are returned unchanged.
    const resolvedUrl = resolveMediaUrl(input.mediaUrl);
    if (input.mediaType === "image") {
      content = {
        image: { url: resolvedUrl },
        caption: input.text ?? undefined,
        mimetype: input.mimeType ?? undefined,
        ...(mentions.length > 0 ? { mentions } : {})
      };
    } else if (input.mediaType === "video") {
      content = {
        video: { url: resolvedUrl },
        caption: input.text ?? undefined,
        mimetype: input.mimeType ?? undefined,
        ...(mentions.length > 0 ? { mentions } : {})
      };
    } else if (input.mediaType === "audio") {
      content = { audio: { url: resolvedUrl }, mimetype: input.mimeType ?? undefined };
    } else {
      content = {
        document: { url: resolvedUrl },
        mimetype: input.mimeType ?? "application/octet-stream",
        fileName: input.fileName ?? "attachment",
        caption: input.text ?? undefined,
        ...(mentions.length > 0 ? { mentions } : {})
      };
    }
  } else if (input.jobType === "send_reaction") {
    if (!input.emoji || !input.reactionTargetId) {
      throw new Error("emoji and reactionTargetId are required");
    }
    content = {
      react: {
        text: input.emoji,
        key: {
          remoteJid: input.chatJid,
          id: input.reactionTargetId,
          fromMe: false
        }
      }
    };
  } else {
    content = {
      text: input.text ?? "",
      ...(mentions.length > 0 ? { mentions } : {})
    };
  }

  let response;
  try {
    response = await withTimeout(
      runtime.socket.sendMessage(input.chatJid, content, quoted ? { quoted } : undefined),
      SEND_MESSAGE_TIMEOUT_MS,
      "WhatsApp send timed out before provider acknowledgement"
    );
  } catch (error) {
    if (error instanceof Error && /Connection Closed/i.test(error.message)) {
      runtime = await ensureRuntime(true);
      response = await withTimeout(
        runtime.socket.sendMessage(input.chatJid, content, quoted ? { quoted } : undefined),
        SEND_MESSAGE_TIMEOUT_MS,
        "WhatsApp send timed out before provider acknowledgement"
      );
    } else {
      throw error;
    }
  }

  const providerMessageId = response?.key?.id;
  if (!providerMessageId) {
    throw new Error("WhatsApp send did not return provider message id");
  }
  const deliveryStatus = mapBaileysDeliveryStatus(response?.status) ?? "pending";
  if (deliveryStatus === "failed") {
    throw new Error("WhatsApp send returned failed status");
  }

  return {
    providerMessageId,
    deliveryStatus,
    providerPayload: (response ?? {}) as Record<string, unknown>
  };
}
