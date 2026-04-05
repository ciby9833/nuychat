/**
 * 作用:
 * - 定义 WA provider 适配层的统一契约。
 *
 * 交互:
 * - 由具体 provider adapter 实现。
 * - 业务层仅依赖这里的标准会话/消息能力，不直接依赖第三方 payload。
 */
export type WaProviderCapability =
  | "session.login"
  | "session.reconnect"
  | "message.send_text"
  | "message.receive_text";

export type WaLoginSessionTicket = {
  sessionRef: string;
  qrCode: string;
  expiresAt: string;
};

export type WaProviderInboundMessage = {
  providerMessageId: string;
  chatJid: string;
  senderJid: string | null;
  participantJid?: string | null;
  messageType: "text" | "image" | "video" | "audio" | "document" | "reaction";
  bodyText: string | null;
  providerTs: number;
  direction: "inbound";
  conversationType: "direct" | "group";
  subject?: string | null;
  contactJid?: string | null;
  quotedMessageId?: string | null;
  reactionEmoji?: string | null;
  reactionTargetId?: string | null;
  attachment?: {
    attachmentType: "image" | "video" | "audio" | "document";
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

export type WaProviderWebhookResult = {
  eventType: string;
  sessionState?: string | null;
  messages: WaProviderInboundMessage[];
  groupParticipants: Array<{
    chatJid: string;
    participantJid: string;
    action: "add" | "remove" | "promote" | "demote";
  }>;
};

export type WaProviderSendTextResult = {
  providerMessageId: string;
  deliveryStatus: string;
  providerPayload: Record<string, unknown>;
};

export type WaProviderSendMediaResult = WaProviderSendTextResult;
export type WaProviderSendReactionResult = WaProviderSendTextResult;

export interface WaProviderAdapter {
  readonly providerKey: string;
  readonly capabilities: Set<WaProviderCapability>;
  createLoginTicket(input: { tenantId: string; waAccountId: string; instanceKey: string }): Promise<WaLoginSessionTicket>;
  restartSession(input: { instanceKey: string }): Promise<{ connectionState: string }>;
  sendText(input: {
    instanceKey: string;
    to: string;
    text: string;
    delayMs?: number;
    quotedMessageId?: string | null;
  }): Promise<WaProviderSendTextResult>;
  sendMedia(input: {
    instanceKey: string;
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
    remoteJid: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<WaProviderSendReactionResult>;
  parseWebhook(input: { body: Record<string, unknown> }): WaProviderWebhookResult;
}
