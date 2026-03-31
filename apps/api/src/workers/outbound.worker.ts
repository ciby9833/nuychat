import { Worker } from "bullmq";
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { outboundQueue, type OutboundJobPayload } from "../infra/queue/queues.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { normalizeStructuredMessage, structuredToPlainText } from "../shared/messaging/structured-message.js";
import { resolveChannelAdapter } from "../modules/channel/channel-adapter.registry.js";
import type { ResolvedChannelConfig } from "../modules/channel/channel.repository.js";
import { findActiveChannelConfig } from "../modules/channel/channel.repository.js";
import { PresenceService } from "../modules/agent/presence.service.js";
import { ConversationCaseService } from "../modules/conversation/conversation-case.service.js";
import { OwnershipService } from "../modules/conversation/ownership.service.js";
import { MessageService } from "../modules/message/message.service.js";
import { markCustomerMessagesRead } from "../modules/message/message.repository.js";
import { emitConversationUpdatedSnapshot } from "../modules/conversation/conversation-realtime.service.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { trackEvent } from "../modules/analytics/analytics.service.js";
import { ConversationClosureEvaluatorService } from "../modules/conversation/conversation-closure-evaluator.service.js";
import {
  cancelAssignmentAcceptTimeout,
  cancelFirstResponseTimeout,
  cancelFollowUpTimeout,
  scheduleFollowUpTimeout
} from "../modules/sla/conversation-sla.service.js";

const messageService = new MessageService();
const presenceService = new PresenceService();
const conversationCaseService = new ConversationCaseService();
const ownershipService = new OwnershipService();
const conversationClosureEvaluatorService = new ConversationClosureEvaluatorService();

export function createOutboundWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<OutboundJobPayload>(
    outboundQueue.name,
    async (job) => {
      const channelConfig = await findActiveChannelConfig(job.data.channelId);
      if (!channelConfig) {
        throw new Error(`Channel config not found for ${job.data.channelId}`);
      }
      if (channelConfig.tenantId !== job.data.tenantId) {
        throw new Error(`Channel tenant mismatch for ${job.data.channelId}`);
      }
      if (channelConfig.channelType !== job.data.channelType) {
        throw new Error(`Channel type mismatch for ${job.data.channelId}`);
      }

      const conversation = await withTenantTransaction(job.data.tenantId, async (trx) => {
        return trx("conversations")
          .join("customers", "customers.customer_id", "conversations.customer_id")
          .select("customers.external_ref", "conversations.chat_type", "conversations.chat_external_ref")
          .where("conversations.conversation_id", job.data.conversationId)
          .first();
      });

      const recipientRef =
        conversation?.chat_type === "group"
          ? (conversation.chat_external_ref as string | null | undefined)
          : (conversation?.external_ref as string | null | undefined);

      if (!recipientRef) {
        throw new Error(`Conversation recipient not found: ${job.data.conversationId}`);
      }

      const sendResult = await sendOutboundByChannel(
        job.data.channelType,
        {
          text: job.data.message.text,
          structured: job.data.message.structured ?? null,
          actions: job.data.message.actions ?? [],
          to: recipientRef,
          recipientType: conversation?.chat_type === "group" ? "group" : "individual",
          attachment: job.data.message.attachment ?? undefined,
          contextMessageId: job.data.message.replyToExternalId ?? undefined,
          reactionEmoji: job.data.message.reactionEmoji ?? undefined,
          reactionMessageId: job.data.message.reactionExternalId ?? undefined
        },
        { config: channelConfig }
      );

      const saved = await withTenantTransaction(job.data.tenantId, async (trx) => {
        const convRow = await trx("conversations")
          .where({ conversation_id: job.data.conversationId })
          .select("customer_id", "status", "last_message_preview")
          .first<{ customer_id: string | null; status: string; last_message_preview: string | null }>();

        // If a human agent writes into a resolved/closed thread, the thread stays
        // the same but a fresh active case becomes the new business object.
        const wasResolved =
          job.data.message.agentId &&
          ["resolved", "closed"].includes(convRow?.status ?? "") &&
          convRow?.customer_id;

        if (wasResolved) {
          await trx("conversations")
            .where({ conversation_id: job.data.conversationId })
            .update({
              current_segment_id: null,
              updated_at: new Date()
            });

          await conversationCaseService.getOrCreateActiveCase(trx, {
            tenantId: job.data.tenantId,
            conversationId: job.data.conversationId,
            customerId: convRow.customer_id as string
          });
        }

        const message = await messageService.saveOutboundMessage(trx, {
          tenantId: job.data.tenantId,
          conversationId: job.data.conversationId,
          externalId: sendResult.externalMessageId,
          text: job.data.message.text,
          structured: job.data.message.structured ?? null,
          actions: job.data.message.actions ?? [],
          senderId: job.data.message.agentId ?? null,
          aiAgentName: job.data.message.aiAgentName ?? null,
          attachment: job.data.message.attachment ?? undefined,
          replyToMessageId: job.data.message.replyToMessageId ?? null,
          replyToExternalId: job.data.message.replyToExternalId ?? null,
          reactionEmoji: job.data.message.reactionEmoji ?? null,
          reactionTargetMessageId: job.data.message.reactionMessageId ?? null,
          reactionTargetExternalId: job.data.message.reactionExternalId ?? null
        });

        await trx("conversations")
          .where({ conversation_id: job.data.conversationId })
          .update({
            last_message_at: trx.fn.now(),
            last_message_preview:
              job.data.message.reactionEmoji
                ? (convRow?.last_message_preview ?? null)
                : structuredToPlainText(
                    normalizeStructuredMessage(job.data.message.structured),
                    job.data.message.text
                  ) ||
                  (job.data.message.attachment ? `[${job.data.message.attachment.fileName ?? "附件"}]` : ""),
            updated_at: new Date()
          });

        await markCustomerMessagesRead(job.data.tenantId, job.data.conversationId, trx);

        if (job.data.message.agentId && convRow?.customer_id) {
          const caseId = await resolveCurrentCaseId(trx, job.data.conversationId);
          await ownershipService.applyTransition(trx, {
            type: "activate_human_owner",
            tenantId: job.data.tenantId,
            conversationId: job.data.conversationId,
            customerId: convRow.customer_id,
            caseId,
            agentId: job.data.message.agentId,
            reason: wasResolved ? "agent-reopened-thread" : "agent-replied",
            caseStatus: "waiting_customer"
          });

          await trx("queue_assignments")
            .where({ tenant_id: job.data.tenantId, conversation_id: job.data.conversationId })
            .update({
              status: "assigned",
              assigned_agent_id: job.data.message.agentId,
              handoff_required: false,
              handoff_reason: null,
              updated_at: trx.fn.now()
            });
        }

        if (job.data.message.agentId) {
          await presenceService.recordActivity(trx, {
            tenantId: job.data.tenantId,
            agentId: job.data.message.agentId
          });
        }

        return {
          message,
          customerId: convRow?.customer_id ?? null,
          wasResolved: Boolean(wasResolved)
        };
      });

      if (job.data.message.agentId) {
        // A human reply satisfies FRT — cancel the first-response timer.
        await cancelFirstResponseTimeout(job.data.conversationId);
        await cancelAssignmentAcceptTimeout(job.data.conversationId);
      }

      if (saved.customerId) {
        await cancelFollowUpTimeout(job.data.conversationId);
        void schedulePostReplyCloseTimer({
          tenantId: job.data.tenantId,
          conversationId: job.data.conversationId,
          customerId: saved.customerId
        }).catch(() => null);
      }

      realtimeEventBus.emitEvent("message.sent", {
        tenantId: job.data.tenantId,
        conversationId: job.data.conversationId,
        messageId: saved.message.messageId,
        text: job.data.message.text,
        occurredAt: new Date().toISOString()
      });

      await emitConversationUpdatedSnapshot(db, job.data.tenantId, job.data.conversationId, {
        occurredAt: new Date().toISOString()
      });

      trackEvent({ eventType: "message_sent", tenantId: job.data.tenantId, conversationId: job.data.conversationId });

      return {
        messageId: saved.message.messageId,
        externalMessageId: sendResult.externalMessageId
      };
    },
    {
      connection: workerConnection as any,
      concurrency: 3
    }
  );
}

async function schedulePostReplyCloseTimer(input: {
  tenantId: string;
  conversationId: string;
  customerId: string;
}) {
  const verdict = await withTenantTransaction(input.tenantId, async (trx) =>
    conversationClosureEvaluatorService.evaluate(trx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId
    })
  );

  await scheduleFollowUpTimeout(input.tenantId, input.conversationId, input.customerId, {
    mode: verdict.verdict === "close" ? "semantic" : "waiting_customer"
  });
}

async function resolveCurrentCaseId(trx: Knex.Transaction, conversationId: string) {
  const row = await trx("conversations")
    .where({ conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();
  if (!row?.current_case_id) {
    throw new Error(`Conversation has no active case: ${conversationId}`);
  }
  return row.current_case_id;
}

async function sendOutboundByChannel(
  channelType: string,
  input: {
    text: string;
    structured?: OutboundJobPayload["message"]["structured"];
    actions?: OutboundJobPayload["message"]["actions"];
    to: string;
    recipientType?: "individual" | "group";
    attachment?: { url: string; mimeType: string; fileName?: string };
    contextMessageId?: string;
    reactionEmoji?: string;
    reactionMessageId?: string;
  },
  context: { config: ResolvedChannelConfig }
) {
  return resolveChannelAdapter(channelType).sendMessage(input, context);
}
