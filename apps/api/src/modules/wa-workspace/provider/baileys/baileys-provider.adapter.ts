/**
 * 作用:
 * - 基于项目内嵌 Baileys runtime 的 provider 适配实现。
 *
 * 交互:
 * - 对上实现 provider-contract。
 * - 对下调用 runtime manager 处理二维码登录与重连。
 */
import {
  createBaileysLoginTicket,
  getBaileysHistorySnapshot,
  logoutBaileysRuntime,
  markBaileysConversationRead,
  restartBaileysRuntime
} from "../../runtime/baileys-runtime.manager.js";
import { sendBaileysMessage } from "../../runtime/baileys-send.service.js";
import type {
  WaLoginSessionTicket,
  WaProviderAdapter,
  WaProviderHistoryResult,
  WaProviderSendMediaResult,
  WaProviderSendReactionResult,
  WaProviderSendTextResult
} from "../provider-contract.js";

export class BaileysProviderAdapter implements WaProviderAdapter {
  async createLoginTicket(input: { tenantId: string; waAccountId: string; instanceKey: string; forceFresh?: boolean }): Promise<WaLoginSessionTicket> {
    return createBaileysLoginTicket({
      ...input,
      loginMode: "employee_scan"
    });
  }

  async restartSession(input: { tenantId?: string; waAccountId?: string; instanceKey: string }): Promise<{ connectionState: string }> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys reconnect");
    }
    return restartBaileysRuntime({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      loginMode: "admin_scan"
    });
  }

  async logoutSession(input: { tenantId?: string; waAccountId?: string; instanceKey: string }): Promise<{ ok: true }> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys logout");
    }
    return logoutBaileysRuntime({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey
    });
  }

  async markConversationRead(input: {
    tenantId?: string;
    waAccountId?: string;
    instanceKey: string;
    keys: Array<{
      remoteJid: string;
      id: string;
      participant?: string | null;
      fromMe?: boolean;
      remoteJidAlt?: string | null;
      participantAlt?: string | null;
      addressingMode?: string | null;
    }>;
  }): Promise<{ ok: true }> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys markConversationRead");
    }
    return markBaileysConversationRead({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      keys: input.keys
    });
  }

  async sendText(input: {
    instanceKey: string;
    tenantId?: string;
    waAccountId?: string;
    to: string;
    text: string;
    delayMs?: number;
    quotedMessageId?: string | null;
    mentionJids?: string[] | null;
  }): Promise<WaProviderSendTextResult> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys sendText");
    }
    return sendBaileysMessage({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      chatJid: input.to,
      jobType: "send_text",
      text: input.text,
      quotedMessageId: input.quotedMessageId ?? null,
      mentionJids: input.mentionJids ?? null
    });
  }

  async sendMedia(input: {
    instanceKey: string;
    tenantId?: string;
    waAccountId?: string;
    to: string;
    mediaType: "image" | "video" | "audio" | "document";
    mimeType: string;
    fileName: string;
    mediaUrl: string;
    caption?: string | null;
    delayMs?: number;
    quotedMessageId?: string | null;
    mentionJids?: string[] | null;
  }): Promise<WaProviderSendMediaResult> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys sendMedia");
    }
    return sendBaileysMessage({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      chatJid: input.to,
      jobType: "send_media",
      text: input.caption ?? undefined,
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      fileName: input.fileName,
      mediaUrl: input.mediaUrl,
      quotedMessageId: input.quotedMessageId ?? null,
      mentionJids: input.mentionJids ?? null
    });
  }

  async sendReaction(input: {
    instanceKey: string;
    tenantId?: string;
    waAccountId?: string;
    remoteJid: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<WaProviderSendReactionResult> {
    if (!input.tenantId || !input.waAccountId) {
      throw new Error("tenantId and waAccountId are required for Baileys sendReaction");
    }
    return sendBaileysMessage({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      instanceKey: input.instanceKey,
      chatJid: input.remoteJid,
      jobType: "send_reaction",
      emoji: input.emoji,
      reactionTargetId: input.targetMessageId
    });
  }

  async fetchHistory(input: {
    tenantId?: string;
    waAccountId?: string;
    instanceKey: string;
    chatJid: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<WaProviderHistoryResult> {
    return {
      messages: !input.tenantId || !input.waAccountId
        ? []
        : getBaileysHistorySnapshot({
            tenantId: input.tenantId,
            waAccountId: input.waAccountId,
            chatJid: input.chatJid,
            limit: input.limit ?? 50
          }),
      nextCursor: null
    };
  }
}
