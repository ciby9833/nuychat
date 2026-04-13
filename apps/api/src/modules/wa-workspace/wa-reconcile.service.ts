/**
 * 作用:
 * - 处理 WA 消息缺口的最小补偿闭环。
 * - 重连后主动与 WhatsApp 侧对账，补齐断连期间遗漏的消息。
 *
 * 交互:
 * - 被 webhook 服务调用以登记缺口与自动关闭。
 * - 被 internal route 调用以触发会话级 reconcile / 历史同步。
 * - 被 runtime manager 在 receivedPendingNotifications 后调用，执行主动对账。
 */
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { waProviderAdapter } from "./provider/provider-registry.js";
import {
  createWaMessageGap,
  findWaMessageByProviderId,
  getWaConversationById,
  insertWaMessage,
  insertWaMessageAttachment,
  insertWaMessageReaction,
  listOpenWaMessageGaps,
  resolveWaMessageGapsByTarget,
  updateWaMessageGapStatus,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";
import { emitWaConversationProjection } from "./wa-conversation-projection.service.js";

export async function createMissingReferenceGap(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    waConversationId: string;
    gapReason: "missing_quoted_message" | "missing_reaction_target";
    targetProviderMessageId: string;
    sourceProviderMessageId: string;
  }
) {
  return createWaMessageGap(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    waConversationId: input.waConversationId,
    gapReason: input.gapReason,
    payload: {
      targetProviderMessageId: input.targetProviderMessageId,
      sourceProviderMessageId: input.sourceProviderMessageId
    }
  });
}

export async function resolveGapsForArrivedMessage(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; providerMessageId: string }
) {
  if (typeof input.providerMessageId !== "string" || !input.providerMessageId.trim()) {
    return [];
  }
  return resolveWaMessageGapsByTarget(trx, input);
}

export async function reconcileWaConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; reason?: string | null }
) {
  const conversation = await getWaConversationById(trx, input.tenantId, input.waConversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const gaps = await listOpenWaMessageGaps(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId
  });

  if (gaps.length === 0) {
    return {
      accepted: true,
      waConversationId: input.waConversationId,
      openGapCount: 0,
      resolvedGapCount: 0,
      pulledMessageCount: 0
    };
  }

  for (const gap of gaps) {
    await updateWaMessageGapStatus(trx, {
      tenantId: input.tenantId,
      gapId: gap.gapId,
      status: "reconciling"
    });
  }

  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: conversation.waAccountId })
    .select("instance_key", "provider_key")
    .first<{ instance_key: string; provider_key: string } | undefined>();
  if (!account) {
    throw new Error("WA account not found");
  }

  const providerResult = await waProviderAdapter.fetchHistory({
    tenantId: input.tenantId,
    waAccountId: conversation.waAccountId,
    instanceKey: account.instance_key,
    chatJid: conversation.chatJid,
    limit: 50
  });

  let pulledMessageCount = 0;
  for (const message of providerResult.messages) {
    const existing = await findWaMessageByProviderId(trx, {
      tenantId: input.tenantId,
      waAccountId: conversation.waAccountId,
      providerMessageId: message.providerMessageId
    });
    if (existing) {
      await resolveWaMessageGapsByTarget(trx, {
        tenantId: input.tenantId,
        waConversationId: input.waConversationId,
        targetProviderMessageId: message.providerMessageId
      });
      continue;
    }

    const savedMessage = await insertWaMessage(trx, {
      tenantId: input.tenantId,
      waAccountId: conversation.waAccountId,
      waConversationId: input.waConversationId,
      providerMessageId: message.providerMessageId,
      direction: message.direction,
      senderJid: message.senderJid,
      participantJid: message.participantJid ?? null,
      senderRole: message.senderRole,
      bodyText: message.bodyText ?? undefined,
      providerTs: message.providerTs,
      messageType: message.messageType,
      quotedMessageId: message.quotedMessageId ?? null,
      providerPayload: {
        source: "history_sync",
        reason: input.reason ?? null
      }
    });

    if (message.conversationType === "group" && message.participantJid) {
      await upsertWaConversationMember(trx, {
        tenantId: input.tenantId,
        waConversationId: input.waConversationId,
        participantJid: message.participantJid
      });
    }

    if (message.attachment) {
      await insertWaMessageAttachment(trx, {
        tenantId: input.tenantId,
        waMessageId: String(savedMessage.wa_message_id),
        attachmentType: message.attachment.attachmentType,
        mimeType: message.attachment.mimeType ?? null,
        fileName: message.attachment.fileName ?? null,
        fileSize: message.attachment.fileSize ?? null,
        width: message.attachment.width ?? null,
        height: message.attachment.height ?? null,
        durationMs: message.attachment.durationMs ?? null,
        storageUrl: message.attachment.storageUrl ?? null,
        previewUrl: message.attachment.previewUrl ?? null,
        providerPayload: {
          source: "history_sync",
          reason: input.reason ?? null
        }
      });
    }

    if (message.messageType === "reaction" && message.reactionEmoji && message.reactionTargetId) {
      const reactionTarget = await findWaMessageByProviderId(trx, {
        tenantId: input.tenantId,
        waAccountId: conversation.waAccountId,
        providerMessageId: message.reactionTargetId
      });
      if (reactionTarget) {
        await insertWaMessageReaction(trx, {
          tenantId: input.tenantId,
          waMessageId: reactionTarget.waMessageId,
          actorJid: message.senderJid,
          emoji: message.reactionEmoji,
          providerTs: message.providerTs
        });
      }
    }

    await resolveWaMessageGapsByTarget(trx, {
      tenantId: input.tenantId,
      waConversationId: input.waConversationId,
      targetProviderMessageId: message.providerMessageId
    });
    pulledMessageCount += 1;
  }

  const remainingGaps = await listOpenWaMessageGaps(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId
  });

  for (const gap of remainingGaps) {
    await updateWaMessageGapStatus(trx, {
      tenantId: input.tenantId,
      gapId: gap.gapId,
      status: "manual_review",
      payload: {
        ...gap.payload,
        lastReconcileReason: input.reason ?? null
      }
    });
  }

  return {
    accepted: true,
    waConversationId: input.waConversationId,
    openGapCount: gaps.length,
    resolvedGapCount: gaps.length - remainingGaps.length,
    pulledMessageCount
  };
}

/**
 * 重连后主动对账：将 Baileys 内存缓存中的消息与 DB 对比，补入遗漏的消息。
 * 在 receivedPendingNotifications = true 后延迟调用。
 *
 * 流程:
 * 1. 查询该账号最近活跃的会话（24h 内有消息）
 * 2. 对每个会话，从 recentHistory 缓存取消息
 * 3. 与 DB 逐条比对 provider_message_id，不存在则补入
 * 4. 同时解决 open 状态的 gaps
 */
export async function reconcileAfterReconnect(input: {
  tenantId: string;
  waAccountId: string;
}) {
  const { tenantId, waAccountId } = input;

  // Find recently active conversations for this account, along with the account's instance key
  const account = await withTenantTransaction(tenantId, async (trx) => {
    return trx("wa_accounts")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .select("instance_key")
      .first<{ instance_key: string } | undefined>();
  });
  if (!account) return { reconciledConversations: 0, backfilledMessages: 0, resolvedGaps: 0 };

  const conversations = await withTenantTransaction(tenantId, async (trx) => {
    return trx("wa_conversations")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .andWhere("last_message_at", ">", trx.raw("NOW() - INTERVAL '24 hours'"))
      .select("wa_conversation_id", "chat_jid", "conversation_type")
      .orderBy("last_message_at", "desc")
      .limit(50);
  });

  if (conversations.length === 0) return { reconciledConversations: 0, backfilledMessages: 0, resolvedGaps: 0 };

  let totalBackfilled = 0;
  let totalResolvedGaps = 0;

  for (const conv of conversations) {
    const chatJid = String(conv.chat_jid);
    const waConversationId = String(conv.wa_conversation_id);

    // Get cached messages from Baileys runtime via provider adapter
    const providerResult = await waProviderAdapter.fetchHistory({
      tenantId,
      waAccountId,
      instanceKey: account.instance_key,
      chatJid,
      limit: 200
    });

    if (providerResult.messages.length === 0) continue;

    try {
      const result = await withTenantTransaction(tenantId, async (trx) => {
        let backfilled = 0;
        let gapsResolved = 0;

        for (const message of providerResult.messages) {
          const existing = await findWaMessageByProviderId(trx, {
            tenantId,
            waAccountId,
            providerMessageId: message.providerMessageId
          });
          if (existing) {
            // Message exists — try to resolve any gaps it might close
            const resolved = await resolveWaMessageGapsByTarget(trx, {
              tenantId,
              waConversationId,
              targetProviderMessageId: message.providerMessageId
            });
            gapsResolved += resolved.length;
            continue;
          }

          // Missing message — backfill it
          const savedMessage = await insertWaMessage(trx, {
            tenantId,
            waAccountId,
            waConversationId,
            providerMessageId: message.providerMessageId,
            direction: message.direction,
            senderJid: message.senderJid,
            participantJid: message.participantJid ?? null,
            senderRole: message.senderRole,
            bodyText: message.bodyText ?? undefined,
            providerTs: message.providerTs,
            messageType: message.messageType,
            quotedMessageId: message.quotedMessageId ?? null,
            deliveryStatus: "received",
            providerPayload: { source: "reconnect_reconcile" }
          });

          if (message.attachment && savedMessage) {
            await insertWaMessageAttachment(trx, {
              tenantId,
              waMessageId: String(savedMessage.wa_message_id),
              attachmentType: message.attachment.attachmentType,
              mimeType: message.attachment.mimeType ?? null,
              fileName: message.attachment.fileName ?? null,
              fileSize: message.attachment.fileSize ?? null,
              width: message.attachment.width ?? null,
              height: message.attachment.height ?? null,
              durationMs: message.attachment.durationMs ?? null,
              storageUrl: message.attachment.storageUrl ?? null,
              previewUrl: message.attachment.previewUrl ?? null,
              providerPayload: { source: "reconnect_reconcile" }
            }).catch(() => { /* best-effort attachment backfill */ });
          }

          const resolved = await resolveWaMessageGapsByTarget(trx, {
            tenantId,
            waConversationId,
            targetProviderMessageId: message.providerMessageId
          });
          gapsResolved += resolved.length;
          backfilled += 1;
        }

        return { backfilled, gapsResolved };
      });

      totalBackfilled += result.backfilled;
      totalResolvedGaps += result.gapsResolved;

      if (result.backfilled > 0) {
        await emitWaConversationProjection({ tenantId, waAccountId, waConversationId });
      }
    } catch (error) {
      console.error("[wa-reconcile] reconnect reconciliation failed for conversation", {
        tenantId, waAccountId, waConversationId: conv.wa_conversation_id, error
      });
    }
  }

  console.info("[wa-reconcile] reconnect reconciliation complete", {
    tenantId,
    waAccountId,
    reconciledConversations: conversations.length,
    backfilledMessages: totalBackfilled,
    resolvedGaps: totalResolvedGaps
  });

  return { reconciledConversations: conversations.length, backfilledMessages: totalBackfilled, resolvedGaps: totalResolvedGaps };
}

/**
 * 定期对账：查找有 open 状态 gap 的会话，尝试从缓存补齐。
 * 适合作为定时任务每 5 分钟运行一次。
 */
export async function reconcileOpenGaps(input: { tenantId: string; waAccountId: string }) {
  const { tenantId, waAccountId } = input;

  const conversationsWithGaps = await withTenantTransaction(tenantId, async (trx) => {
    return trx("wa_message_gaps")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .whereIn("status", ["open"])
      .select("wa_conversation_id")
      .groupBy("wa_conversation_id")
      .limit(20);
  });

  if (conversationsWithGaps.length === 0) return { reconciledConversations: 0, resolvedGaps: 0 };

  let totalResolved = 0;

  for (const row of conversationsWithGaps) {
    try {
      const result = await withTenantTransaction(tenantId, async (trx) => {
        return reconcileWaConversation(trx, {
          tenantId,
          waConversationId: String(row.wa_conversation_id),
          reason: "periodic_gap_reconcile"
        });
      });
      totalResolved += result.resolvedGapCount;
    } catch (error) {
      console.error("[wa-reconcile] periodic gap reconciliation failed", {
        tenantId, waAccountId, waConversationId: row.wa_conversation_id, error
      });
    }
  }

  return { reconciledConversations: conversationsWithGaps.length, resolvedGaps: totalResolved };
}
