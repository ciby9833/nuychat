/**
 * 作用:
 * - 定义内嵌 Baileys 运行时对业务层暴露的最小契约。
 *
 * 交互:
 * - 由当前唯一的 Baileys adapter 实现。
 * - 业务层只依赖这里的登录、发送、历史补偿能力。
 */

export type WaLoginSessionTicket = {
  sessionRef: string;
  qrCode: string | null;
  loginPhase: string;
  connectionState: string;
  expiresAt: string;
};

export type WaNormalizedMessage = {
  providerMessageId: string;
  chatJid: string;
  senderJid: string | null;
  participantJid?: string | null;
  messageType: "text" | "image" | "video" | "audio" | "document" | "reaction" | "sticker" | "location" | "contact_card";
  bodyText: string | null;
  providerTs: number;
  direction: "inbound" | "outbound";
  senderRole: "customer" | "group_member" | "employee" | "wa_account";
  conversationType: "direct" | "group";
  subject?: string | null;
  contactName?: string | null;
  contactPhoneE164?: string | null;
  contactJid?: string | null;
  quotedMessageId?: string | null;
  reactionEmoji?: string | null;
  reactionTargetId?: string | null;
  attachment?: {
    attachmentType: "image" | "video" | "audio" | "document" | "sticker" | "location";
    mimeType?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
    storageUrl?: string | null;
    previewUrl?: string | null;
  } | null;
};

export type WaProviderSendTextResult = {
  providerMessageId: string;
  deliveryStatus: string;
  providerPayload: Record<string, unknown>;
};

export type WaProviderSendMediaResult = WaProviderSendTextResult;
export type WaProviderSendReactionResult = WaProviderSendTextResult;

export type WaProviderHistoryResult = {
  messages: WaNormalizedMessage[];
  nextCursor?: string | null;
};

export interface WaProviderAdapter {
  createLoginTicket(input: { tenantId: string; waAccountId: string; instanceKey: string; forceFresh?: boolean }): Promise<WaLoginSessionTicket>;
  restartSession(input: { instanceKey: string; tenantId?: string; waAccountId?: string }): Promise<{ connectionState: string }>;
  logoutSession(input: { instanceKey: string; tenantId?: string; waAccountId?: string }): Promise<{ ok: true }>;
  markConversationRead(input: {
    tenantId?: string;
    waAccountId?: string;
    instanceKey: string;
    keys: Array<{
      remoteJid: string;
      id: string;
      participant?: string | null;
      fromMe?: boolean;
    }>;
  }): Promise<{ ok: true }>;
  sendText(input: {
    instanceKey: string;
    tenantId?: string;
    waAccountId?: string;
    to: string;
    text: string;
    delayMs?: number;
    quotedMessageId?: string | null;
  }): Promise<WaProviderSendTextResult>;
  sendMedia(input: {
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
  }): Promise<WaProviderSendMediaResult>;
  sendReaction(input: {
    instanceKey: string;
    tenantId?: string;
    waAccountId?: string;
    remoteJid: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<WaProviderSendReactionResult>;
  fetchHistory(input: {
    tenantId?: string;
    waAccountId?: string;
    instanceKey: string;
    chatJid: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<WaProviderHistoryResult>;
}
