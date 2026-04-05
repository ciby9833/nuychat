/**
 * 作用:
 * - 处理 WA 消息缺口的最小补偿闭环。
 *
 * 交互:
 * - 被 webhook 服务调用以登记缺口与自动关闭。
 * - 被 internal route 调用以触发会话级 reconcile / 历史同步。
 */
import type { Knex } from "knex";

import { getWaProviderAdapter } from "./provider/provider-registry.js";
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

  const provider = getWaProviderAdapter(account.provider_key);
  const providerResult = await provider.fetchHistory({
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
      direction: "inbound",
      senderJid: message.senderJid,
      participantJid: message.participantJid ?? null,
      senderRole: message.conversationType === "group" ? "group_member" : "customer",
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
