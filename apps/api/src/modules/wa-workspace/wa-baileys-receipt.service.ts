/**
 * 作用:
 * - 消费 Baileys `message-receipt.update` 事件并更新 WA 消息回执状态。
 *
 * 交互:
 * - 被 runtime manager 调用。
 * - 依赖 repository 更新 `wa_messages` 与 `wa_message_receipts`，并发出 realtime 事件。
 */
import type { MessageUserReceiptUpdate } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../infra/db/client.js";
import {
  findWaMessageByProviderId,
  getWaMessageReceiptSummary,
  updateWaMessageByProviderId,
  upsertWaMessageReceipt
} from "./wa-conversation.repository.js";
import { emitWaMessageUpdated } from "./wa-realtime.service.js";

const DELIVERY_STATUS_ORDER = ["pending", "server_ack", "delivered", "read", "played", "failed", "revoked"] as const;

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function deriveReceiptStatus(update: MessageUserReceiptUpdate["receipt"]) {
  if (normalizeNumber(update.playedTimestamp)) return "played";
  if (normalizeNumber(update.readTimestamp)) return "read";
  if (normalizeNumber(update.receiptTimestamp)) return "delivered";
  return "server_ack";
}

function pickHigherDeliveryStatus(current: string | null | undefined, next: string) {
  const currentIndex = DELIVERY_STATUS_ORDER.indexOf((current ?? "pending") as (typeof DELIVERY_STATUS_ORDER)[number]);
  const nextIndex = DELIVERY_STATUS_ORDER.indexOf(next as (typeof DELIVERY_STATUS_ORDER)[number]);
  if (currentIndex < 0) return next;
  if (nextIndex < 0) return current ?? next;
  return nextIndex >= currentIndex ? next : (current ?? next);
}

export async function ingestBaileysMessageReceipts(input: {
  tenantId: string;
  waAccountId: string;
  receipts: MessageUserReceiptUpdate[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const item of input.receipts) {
      const providerMessageId = normalizeString(item.key?.id);
      const userJid = normalizeString(item.receipt?.userJid);
      if (!providerMessageId || !userJid) continue;

      const target = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId
      });
      if (!target) continue;

      const receiptStatus = deriveReceiptStatus(item.receipt);
      await upsertWaMessageReceipt(trx, {
        tenantId: input.tenantId,
        waMessageId: target.waMessageId,
        userJid,
        receiptStatus,
        receiptTs: normalizeNumber(item.receipt?.receiptTimestamp),
        readTs: normalizeNumber(item.receipt?.readTimestamp),
        playedTs: normalizeNumber(item.receipt?.playedTimestamp),
        pendingDeviceJids: Array.isArray(item.receipt?.pendingDeviceJid) ? item.receipt.pendingDeviceJid.map(String) : [],
        deliveredDeviceJids: Array.isArray(item.receipt?.deliveredDeviceJid) ? item.receipt.deliveredDeviceJid.map(String) : [],
        providerPayload: item as unknown as Record<string, unknown>
      });

      const summary = await getWaMessageReceiptSummary(trx, {
        tenantId: input.tenantId,
        waMessageId: target.waMessageId
      });

      const mergedStatus = pickHigherDeliveryStatus(summary.latestStatus, receiptStatus);
      const updated = await updateWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        providerMessageId,
        deliveryStatus: mergedStatus,
        providerPayload: {
          lastReceiptUpdate: item as unknown as Record<string, unknown>,
          receiptSummary: summary
        }
      });

      emitWaMessageUpdated({
        tenantId: input.tenantId,
        waConversationId: target.waConversationId,
        waMessageId: target.waMessageId,
        providerMessageId,
        deliveryStatus: updated?.delivery_status ? String(updated.delivery_status) : mergedStatus,
        receiptSummary: summary
      });
    }

    return { ok: true, count: input.receipts.length };
  });
}
