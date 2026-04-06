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
  accountStatus: string;
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
    accountStatus: input.accountStatus,
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
