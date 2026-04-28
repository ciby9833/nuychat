/**
 * 作用:
 * - 统一封装 WA 模块向全局 realtime bus 发出的事件。
 *
 * 交互:
 * - 被 Baileys runtime、出站 worker、回执消费服务调用。
 * - 复用现有 tenant 级 Socket.IO 通道，不再额外引入第二套推送机制。
 */
import { realtimeEventBus } from "../realtime/realtime.events.js";

export function emitWaAccountUpdated(input: {
  tenantId: string;
  waAccountId: string;
  status: {
    code: string;
    label: string;
    detail: string;
    tone: "default" | "warning" | "success" | "danger" | "processing";
  };
  connectionState: string;
  loginPhase: string;
  sessionRef?: string | null;
  heartbeatAt?: string | null;
  qrCode?: string | null;
  disconnectReason?: string | null;
  autoReconnectCount?: number;
  isOnline?: boolean | null;
  phoneConnected?: boolean | null;
  receivedPendingNotifications?: boolean | null;
  occurredAt?: string;
}) {
  realtimeEventBus.emitEvent("wa.account.updated", {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    status: input.status,
    connectionState: input.connectionState,
    loginPhase: input.loginPhase,
    sessionRef: input.sessionRef ?? null,
    heartbeatAt: input.heartbeatAt ?? null,
    qrCode: input.qrCode ?? null,
    disconnectReason: input.disconnectReason ?? null,
    autoReconnectCount: input.autoReconnectCount ?? 0,
    isOnline: input.isOnline ?? null,
    phoneConnected: input.phoneConnected ?? null,
    receivedPendingNotifications: input.receivedPendingNotifications ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

export function emitWaMessageUpdated(input: {
  tenantId: string;
  waConversationId: string;
  waMessageId: string;
  providerMessageId?: string | null;
  deliveryStatus: string;
  receiptSummary?: Record<string, unknown> | null;
  occurredAt?: string;
}) {
  realtimeEventBus.emitEvent("wa.message.updated", {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    waMessageId: input.waMessageId,
    providerMessageId: input.providerMessageId ?? null,
    deliveryStatus: input.deliveryStatus,
    receiptSummary: input.receiptSummary ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

export function emitWaMessageReceived(input: {
  tenantId: string;
  waAccountId: string;
  waConversationId: string;
  waMessageId: string;
  providerMessageId?: string | null;
  direction: string;
  messageType: string;
  bodyText?: string | null;
  senderDisplayName?: string | null;
  participantJid?: string | null;
  conversationDisplayName?: string | null;
  conversationSecondaryLabel?: string | null;
  unreadCount: number;
  occurredAt?: string;
}) {
  realtimeEventBus.emitEvent("wa.message.received", {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    waConversationId: input.waConversationId,
    waMessageId: input.waMessageId,
    providerMessageId: input.providerMessageId ?? null,
    direction: input.direction,
    messageType: input.messageType,
    bodyText: input.bodyText ?? null,
    senderDisplayName: input.senderDisplayName ?? null,
    participantJid: input.participantJid ?? null,
    conversationDisplayName: input.conversationDisplayName ?? null,
    conversationSecondaryLabel: input.conversationSecondaryLabel ?? null,
    unreadCount: input.unreadCount,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

export function emitWaConversationUpdated(input: {
  tenantId: string;
  waAccountId: string;
  conversation: {
    waConversationId: string;
    waAccountId: string;
    chatJid: string;
    conversationType: string;
    subject: string | null;
    displayName: string | null;
    contactJid: string | null;
    contactName: string | null;
    contactPhoneE164: string | null;
    secondaryLabel?: string | null;
    listCategory?: string | null;
    conversationStatus: string;
    currentReplierMembershipId: string | null;
    currentReplierName: string | null;
    accountDisplayName: string | null;
    lastMessageAt: string | null;
    lastMessagePreview: string | null;
    unreadCount: number;
  };
  occurredAt?: string;
}) {
  realtimeEventBus.emitEvent("wa.conversation.updated", {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    conversation: input.conversation,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}
