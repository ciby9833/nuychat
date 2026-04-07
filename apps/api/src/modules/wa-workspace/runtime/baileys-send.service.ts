/**
 * 作用:
 * - 封装 Baileys sendMessage，供出站 worker 调用。
 *
 * 交互:
 * - 依赖 runtime manager 获取账号对应的 socket。
 * - 对上返回 provider-neutral 的发送结果，供 wa-outbound.service 回写消息状态。
 */
import crypto from "node:crypto";
import path from "node:path";

import type { AnyMessageContent, WAMessage } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../../infra/db/client.js";
import { getUploadsDir } from "../../../infra/storage/upload.service.js";
import { mapBaileysDeliveryStatus } from "./baileys-message.mapper.js";
import { ensureBaileysRuntime, getBaileysRuntime, restartBaileysRuntime } from "./baileys-runtime.manager.js";

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

/**
 * Cleans a WAMessage["message"] object that was round-tripped through JSON storage.
 *
 * When Node.js Buffer objects are serialized to JSON they become
 * `{"type":"Buffer","data":[...]}` plain objects.  Baileys calls
 * `proto.Message.fromObject()` on quoted message content, and protobufjs
 * cannot reconstruct `bytes` fields from that plain-object form — it either
 * silently produces empty buffers or throws, causing the entire send to fail.
 *
 * For quoted-message context we only need human-readable fields (text, caption,
 * mimetype, dimensions, duration …).  Binary blobs (mediaKey, file hashes,
 * jpeg thumbnail, waveform …) are not needed for a reply preview, so we strip
 * them before handing the content to Baileys.
 */
function sanitizeMessageForQuote(rawMsg: unknown): WAMessage["message"] {
  if (!rawMsg || typeof rawMsg !== "object") {
    return { conversation: "[引用消息]" };
  }

  // Shallow-copy the top-level message object.
  const msg = { ...(rawMsg as Record<string, unknown>) };

  // Binary fields that Baileys stores on every media message type but that are
  // not needed for a quoted-message preview.
  const binaryFields = [
    "jpegThumbnail",
    "thumbnailDirectPath",
    "thumbnailEncSha256",
    "thumbnailSha256",
    "mediaKey",
    "mediaKeyTimestamp",
    "fileEncSha256",
    "fileSha256",
    "streamingSidecarBytes",
    "waveform",
    "ptt",       // boolean, not binary, but safe to keep — listed here for completeness
  ] as const;

  const mediaMessageTypes = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage",
    "gifMessage",
  ];

  for (const mediaType of mediaMessageTypes) {
    if (msg[mediaType] && typeof msg[mediaType] === "object") {
      const mediaContent = { ...(msg[mediaType] as Record<string, unknown>) };
      for (const field of binaryFields) {
        delete mediaContent[field];
      }
      msg[mediaType] = mediaContent;
    }
  }

  return msg as WAMessage["message"];
}

async function buildQuotedMessage(
  tenantId: string,
  waAccountId: string,
  chatJid: string,
  quotedMessageId?: string | null
): Promise<WAMessage | undefined> {
  if (!quotedMessageId) return undefined;

  const row = await withTenantTransaction(tenantId, async (trx) =>
    trx("wa_messages")
      .where("tenant_id", tenantId)
      .where("wa_account_id", waAccountId)
      .andWhere((builder) => {
        builder.where("provider_message_id", quotedMessageId).orWhere("wa_message_id", quotedMessageId);
      })
      .select("provider_message_id", "direction", "participant_jid", "sender_jid", "provider_payload")
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>()
  );
  if (!row) {
    console.warn("[baileys-send] buildQuotedMessage: message not found", { quotedMessageId });
    return undefined;
  }

  // Must use the WhatsApp provider message ID, not our internal UUID.
  const providerMessageId =
    typeof row.provider_message_id === "string" && row.provider_message_id.trim()
      ? row.provider_message_id.trim()
      : null;
  if (!providerMessageId) {
    // Message hasn't been delivered to WhatsApp yet (still pending/failed). Skip the quote.
    console.warn("[baileys-send] buildQuotedMessage: no provider_message_id yet", { quotedMessageId });
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
    return runtime;
  };

  let runtime = await ensureRuntime(false);

  const quoted = await buildQuotedMessage(input.tenantId, input.waAccountId, input.chatJid, input.quotedMessageId);

  let content: AnyMessageContent;
  if (input.jobType === "send_media") {
    if (!input.mediaUrl || !input.mediaType) {
      throw new Error("mediaUrl and mediaType are required");
    }
    // Resolve "/uploads/..." relative paths to absolute disk paths so Baileys
    // can read the file. HTTP/HTTPS URLs are returned unchanged.
    const resolvedUrl = resolveMediaUrl(input.mediaUrl);
    if (input.mediaType === "image") {
      content = { image: { url: resolvedUrl }, caption: input.text ?? undefined, mimetype: input.mimeType ?? undefined };
    } else if (input.mediaType === "video") {
      content = { video: { url: resolvedUrl }, caption: input.text ?? undefined, mimetype: input.mimeType ?? undefined };
    } else if (input.mediaType === "audio") {
      content = { audio: { url: resolvedUrl }, mimetype: input.mimeType ?? undefined };
    } else {
      content = {
        document: { url: resolvedUrl },
        mimetype: input.mimeType ?? "application/octet-stream",
        fileName: input.fileName ?? "attachment",
        caption: input.text ?? undefined
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
      text: input.text ?? ""
    };
  }

  let response;
  try {
    response = await runtime.socket.sendMessage(input.chatJid, content, quoted ? { quoted } : undefined);
  } catch (error) {
    if (error instanceof Error && /Connection Closed/i.test(error.message)) {
      runtime = await ensureRuntime(true);
      response = await runtime.socket.sendMessage(input.chatJid, content, quoted ? { quoted } : undefined);
    } else {
      throw error;
    }
  }

  return {
    providerMessageId: response?.key?.id ?? crypto.randomUUID(),
    deliveryStatus: mapBaileysDeliveryStatus(response?.status) ?? "pending",
    providerPayload: (response ?? {}) as Record<string, unknown>
  };
}
