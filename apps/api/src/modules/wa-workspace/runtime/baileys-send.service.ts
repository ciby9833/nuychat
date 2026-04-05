/**
 * 作用:
 * - 封装 Baileys sendMessage，供出站 worker 调用。
 *
 * 交互:
 * - 依赖 runtime manager 获取账号对应的 socket。
 * - 对上返回 provider-neutral 的发送结果，供 wa-outbound.service 回写消息状态。
 */
import crypto from "node:crypto";

import type { AnyMessageContent, WAMessage } from "@whiskeysockets/baileys";

import { ensureBaileysRuntime, getBaileysRuntime } from "./baileys-runtime.manager.js";

function buildQuotedMessage(chatJid: string, quotedMessageId?: string | null): WAMessage | undefined {
  if (!quotedMessageId) return undefined;
  return {
    key: {
      remoteJid: chatJid,
      id: quotedMessageId,
      fromMe: false
    },
    message: {
      conversation: ""
    }
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
  let runtime = getBaileysRuntime(input.tenantId, input.waAccountId);
  if (!runtime) {
    runtime = await ensureBaileysRuntime({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      loginMode: "worker_send"
    });
  }

  const quoted = buildQuotedMessage(input.chatJid, input.quotedMessageId);

  let content: AnyMessageContent;
  if (input.jobType === "send_media") {
    if (!input.mediaUrl || !input.mediaType) {
      throw new Error("mediaUrl and mediaType are required");
    }
    if (input.mediaType === "image") {
      content = { image: { url: input.mediaUrl }, caption: input.text ?? undefined, mimetype: input.mimeType ?? undefined };
    } else if (input.mediaType === "video") {
      content = { video: { url: input.mediaUrl }, caption: input.text ?? undefined, mimetype: input.mimeType ?? undefined };
    } else if (input.mediaType === "audio") {
      content = { audio: { url: input.mediaUrl }, mimetype: input.mimeType ?? undefined };
    } else {
      content = {
        document: { url: input.mediaUrl },
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

  const response = await runtime.socket.sendMessage(input.chatJid, content, quoted ? { quoted } : undefined);

  return {
    providerMessageId: response?.key?.id ?? crypto.randomUUID(),
    deliveryStatus: "sent",
    providerPayload: (response ?? {}) as Record<string, unknown>
  };
}
