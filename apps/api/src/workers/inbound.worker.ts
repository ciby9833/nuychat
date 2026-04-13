import { Worker } from "bullmq";
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  inboundQueue,
  routingQueue,
  type InboundJobPayload
} from "../infra/queue/queues.js";
import { resolveChannelAdapter } from "../modules/channel/channel-adapter.registry.js";
import type { ResolvedChannelConfig } from "../modules/channel/channel.repository.js";
import { findActiveChannelConfig } from "../modules/channel/channel.repository.js";
import { ConversationCaseService } from "../modules/conversation/conversation-case.service.js";
import { ConversationService } from "../modules/conversation/conversation.service.js";
import { ConversationSegmentService } from "../modules/conversation/conversation-segment.service.js";
import { emitConversationUpdatedSnapshot } from "../modules/conversation/conversation-realtime.service.js";
import { CustomerService } from "../modules/customer/customer.service.js";
import { MessageService } from "../modules/message/message.service.js";
import { syncConversationUnreadCount } from "../modules/message/message.repository.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { DispatchAuditService } from "../modules/dispatch/dispatch-audit.service.js";
import { RoutingContextService } from "../modules/routing-engine/routing-context.service.js";
import { UnifiedRoutingEngineService } from "../modules/routing-engine/unified-routing-engine.service.js";
import { RoutingPlanRepository } from "../modules/routing-engine/routing-plan.repository.js";
import { RoutingExecutionService } from "../modules/routing-engine/routing-execution.service.js";
import { RoutingPlanStepService } from "../modules/routing-engine/routing-plan-step.service.js";
import { ServiceModeEngine } from "../modules/service-mode/service-mode.engine.js";
import { trackEvent } from "../modules/analytics/analytics.service.js";
import {
  cancelFollowUpTimeout,
  deriveInboundTimeoutPlan,
  resolveConversationSlaDefinition,
  scheduleAssignmentAcceptTimeout,
  scheduleFirstResponseTimeout,
  scheduleSubsequentResponseTimeout
} from "../modules/sla/conversation-sla.service.js";
import { resolveWhatsAppMediaAttachments } from "../modules/channel/adapters/whatsapp/whatsapp-media.service.js";
import { getWhatsAppPlatformConfig } from "../modules/channel/whatsapp-platform-config.js";
import type { UnifiedMessage } from "../shared/types/unified-message.js";

const customerService = new CustomerService();
const conversationService = new ConversationService();
const conversationCaseService = new ConversationCaseService();
const conversationSegmentService = new ConversationSegmentService();
const messageService = new MessageService();
const dispatchAuditService = new DispatchAuditService();
const routingContextService = new RoutingContextService();
const unifiedRoutingEngineService = new UnifiedRoutingEngineService();
const routingPlanRepository = new RoutingPlanRepository();
const routingExecutionService = new RoutingExecutionService();
const routingPlanStepService = new RoutingPlanStepService();
const serviceModeEngine = new ServiceModeEngine();

export function createInboundWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<InboundJobPayload>(
    inboundQueue.name,
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

      let unifiedMessage = parseInboundMessage(job.data.channelType, job.data.rawMessage, {
        tenantId: job.data.tenantId,
        channelId: job.data.channelId,
        config: channelConfig
      });

      // For WhatsApp media messages: download from Meta Graph API and save locally.
      // This resolves `mediaId` → local `/uploads/...` URL before the message is stored.
      if (job.data.channelType === "whatsapp" && unifiedMessage.attachments?.some((a) => a.mediaId && !a.url)) {
        const waConfig = getWhatsAppPlatformConfig();
        if (waConfig.systemUserAccessToken) {
          unifiedMessage = {
            ...unifiedMessage,
            attachments: await resolveWhatsAppMediaAttachments(unifiedMessage.attachments, {
              accessToken: waConfig.systemUserAccessToken,
              graphApiVersion: waConfig.graphApiVersion
            })
          };
        } else {
          console.warn(`[inbound] WhatsApp media message received but META_SYSTEM_USER_ACCESS_TOKEN is not set — attachments will store mediaId only`);
        }
      }

      const result = await withTenantTransaction(job.data.tenantId, async (trx) => {
        const conversationCustomer = await resolveConversationCustomer(trx, job.data.tenantId, unifiedMessage);

        const conversation = await conversationService.getOrCreateActiveConversation(trx, {
          tenantId: job.data.tenantId,
          customerId: conversationCustomer.customerId,
          channelId: job.data.channelId,
          channelType: unifiedMessage.channelType,
          chatType: unifiedMessage.chatType,
          chatExternalRef: unifiedMessage.chatExternalRef,
          chatName: unifiedMessage.chatName,
          lastMessageAt: unifiedMessage.receivedAt,
          lastMessagePreview: unifiedMessage.text ?? previewForMessage(unifiedMessage)
        });

        const currentCase = await conversationCaseService.getOrCreateActiveCase(trx, {
          tenantId: job.data.tenantId,
          conversationId: conversation.conversationId,
          customerId: conversationCustomer.customerId
        });

        let currentConversation = await trx("conversations")
          .where({ tenant_id: job.data.tenantId, conversation_id: conversation.conversationId })
          .select("status", "assigned_agent_id", "current_handler_type", "current_handler_id", "current_segment_id", "current_case_id")
          .first<{
            status: string;
            assigned_agent_id: string | null;
            current_handler_type: string | null;
            current_handler_id: string | null;
            current_segment_id: string | null;
            current_case_id: string | null;
          } | undefined>();

        if (!currentConversation?.current_segment_id) {
          if (currentConversation?.status === "human_active" && currentConversation.assigned_agent_id) {
            await conversationSegmentService.switchToHumanSegment(trx, {
              tenantId: job.data.tenantId,
              conversationId: conversation.conversationId,
              customerId: conversationCustomer.customerId,
              agentId: currentConversation.assigned_agent_id,
              reason: "backfill-human-owner"
            });
          } else if (currentConversation?.current_handler_type === "ai" && currentConversation.current_handler_id) {
            await conversationSegmentService.switchToAISegment(trx, {
              tenantId: job.data.tenantId,
              conversationId: conversation.conversationId,
              customerId: conversationCustomer.customerId,
              aiAgentId: currentConversation.current_handler_id,
              reason: "backfill-ai-owner"
            });
          } else {
            await conversationSegmentService.ensureSystemSegment(trx, {
              tenantId: job.data.tenantId,
              conversationId: conversation.conversationId,
              customerId: conversationCustomer.customerId,
              reason: conversation.created ? "thread-opened" : "awaiting-dispatch"
            });
          }

          currentConversation = await trx("conversations")
            .where({ tenant_id: job.data.tenantId, conversation_id: conversation.conversationId })
            .select("status", "assigned_agent_id", "current_handler_type", "current_handler_id", "current_segment_id", "current_case_id")
            .first<{
              status: string;
              assigned_agent_id: string | null;
              current_handler_type: string | null;
              current_handler_id: string | null;
              current_segment_id: string | null;
              current_case_id: string | null;
            } | undefined>();
        }

        if (!currentConversation?.current_case_id) {
          throw new Error(`Conversation has no current case after intake: ${conversation.conversationId}`);
        }

        const saved = await messageService.saveInboundMessage(trx, {
          tenantId: job.data.tenantId,
          conversationId: conversation.conversationId,
          unifiedMessage
        });

        const unreadCount = await syncConversationUnreadCount(job.data.tenantId, conversation.conversationId, trx);

        const routingContext = await routingContextService.build(trx, {
          tenantId: job.data.tenantId,
          conversationId: conversation.conversationId,
          customerId: conversationCustomer.customerId,
          channelType: unifiedMessage.channelType,
          channelId: job.data.channelId
        });
        const routingPlan = await unifiedRoutingEngineService.createPlan(trx, routingContext);
        const planId = await routingPlanRepository.create(trx, routingPlan);
        await routingPlanStepService.record(trx, {
          tenantId: job.data.tenantId,
          planId,
          stepType: "plan_created",
          status: "completed",
          payload: {
            mode: routingPlan.mode,
            action: routingPlan.action,
            triggerType: routingPlan.triggerType,
            target: routingPlan.target,
            statusPlan: routingPlan.statusPlan
          }
        });

        const executionId = await dispatchAuditService.recordExecution(trx, {
          tenantId: job.data.tenantId,
          conversationId: conversation.conversationId,
          customerId: conversationCustomer.customerId,
          segmentId: currentConversation?.current_segment_id ?? null,
          triggerType: "inbound_message",
          decisionType: "routing_plan",
          channelType: unifiedMessage.channelType,
          channelId: job.data.channelId,
          customerTier: (conversationCustomer as { tier?: string | null }).tier ?? null,
          customerLanguage: (conversationCustomer as { language?: string | null }).language ?? null,
          routingRuleId: routingPlan.trace.humanDispatch.routingRuleId,
          routingRuleName: routingPlan.trace.humanDispatch.routingRuleName,
          matchedConditions: routingPlan.trace.humanDispatch.matchedConditions,
          inputSnapshot: {
            conversationStatus: currentConversation?.status ?? null,
            currentHandlerType: currentConversation?.current_handler_type ?? null,
            currentHandlerId: currentConversation?.current_handler_id ?? null,
            preserveHumanOwner: routingContext.preserveHumanOwner,
            channelType: unifiedMessage.channelType,
            operatingMode: routingContext.operatingMode,
            issueSummary: routingContext.issueSummary
          },
          decisionSummary: {
            planId,
            mode: routingPlan.mode,
            action: routingPlan.action,
            selectedOwnerType: routingPlan.statusPlan.selectedOwnerType,
            departmentId: routingPlan.target.departmentId,
            teamId: routingPlan.target.teamId,
            assignedAgentId: routingPlan.target.agentId,
            aiAgentId: routingPlan.target.aiAgentId,
            strategy: routingPlan.target.strategy,
            status: routingPlan.statusPlan.queueStatus,
            issueSummary: routingPlan.trace.issueSummary
          },
          decisionReason: routingPlan.trace.decision.reason,
          candidates: [
            ...routingPlan.trace.humanDispatch.candidates,
            ...routingPlan.trace.aiSelection.candidates
          ]
        });

        await routingExecutionService.applyInboundPlan(trx, routingPlan);
        await routingPlanStepService.record(trx, {
          tenantId: job.data.tenantId,
          planId,
          stepType: "inbound_plan_applied",
          status: "completed",
          payload: {
            queueStatus: routingPlan.statusPlan.queueStatus,
            action: routingPlan.action,
            assignedAgentId: routingPlan.target.agentId,
            assignedAiAgentId: routingPlan.target.aiAgentId
          }
        });

        return {
          planId,
          executionId,
          customerId: conversationCustomer.customerId,
          conversationId: conversation.conversationId,
          messageId: saved.messageId,
          unreadCount,
          createdConversation: conversation.created,
          createdCase: currentCase.created,
          routingPlan,
          serviceModeFrom: serviceModeEngine.snapshotFromExistingAssignment(routingContext.existingAssignment),
          preserveHumanOwner: routingContext.preserveHumanOwner,
          conversationStatus: routingPlan.statusPlan.conversationStatus
        };
      });

      await routingQueue.add(
        "routing.required",
        {
          tenantId: job.data.tenantId,
          planId: result.planId,
          conversationId: result.conversationId,
          customerId: result.customerId,
          messageId: result.messageId,
          channelType: job.data.channelType
        },
        {
          removeOnComplete: 100,
          removeOnFail: 50
        }
      );

      if (result.createdConversation) {
        realtimeEventBus.emitEvent("conversation.created", {
          tenantId: job.data.tenantId,
          conversationId: result.conversationId,
          customerId: result.customerId,
          channelId: job.data.channelId,
          channelType: job.data.channelType,
          chatType: unifiedMessage.chatType,
          chatExternalRef: unifiedMessage.chatExternalRef,
          chatName: unifiedMessage.chatName ?? null,
          lastMessagePreview: unifiedMessage.text ?? previewForMessage(unifiedMessage),
          occurredAt: new Date().toISOString()
        });
      }

      realtimeEventBus.emitEvent("message.received", {
        tenantId: job.data.tenantId,
        conversationId: result.conversationId,
        messageId: result.messageId,
        externalId: unifiedMessage.externalId,
        messageType: unifiedMessage.messageType,
        chatType: unifiedMessage.chatType,
        chatExternalRef: unifiedMessage.chatExternalRef,
        chatName: unifiedMessage.chatName ?? null,
        text: unifiedMessage.text,
        senderExternalRef: unifiedMessage.senderExternalRef,
        occurredAt: new Date().toISOString()
      });

      await emitConversationUpdatedSnapshot(db, job.data.tenantId, result.conversationId, {
        occurredAt: new Date().toISOString()
      });

      serviceModeEngine.publishTransition({
        tenantId: job.data.tenantId,
        conversationId: result.conversationId,
        channelId: job.data.channelId,
        channelType: job.data.channelType,
        from: result.serviceModeFrom,
        to: serviceModeEngine.snapshotFromRoutingPlan(result.routingPlan),
        aiAgentName: result.routingPlan.target.aiAgentName ?? "AI",
        reason: result.routingPlan.trace.decision.reason
      });

  // ── Conversation timeout scheduling ──────────────────────────────────
      // New customer activity must cancel any pending post-reply close timer.
      void cancelFollowUpTimeout(result.conversationId).catch(() => null);

      await scheduleConversationTimeouts(
        job.data.tenantId,
        result.conversationId,
        result.customerId,
        result.routingPlan.statusPlan.queueStatus,
        result.preserveHumanOwner
      );

      // ── Analytics (fire-and-forget) ──────────────────────────────────────
      if (result.createdConversation) {
        trackEvent({ eventType: "conversation_started", tenantId: job.data.tenantId, conversationId: result.conversationId });
      }
      trackEvent({ eventType: "message_received", tenantId: job.data.tenantId, conversationId: result.conversationId, payload: { channelType: job.data.channelType } });

      return result;
    },
    {
      connection: workerConnection as any,
      concurrency: 5
    }
  );
}

function parseInboundMessage(
  channelType: string,
  rawMessage: Record<string, unknown>,
  context: {
    tenantId: string;
    channelId: string;
    config: ResolvedChannelConfig;
  }
) {
  return resolveChannelAdapter(channelType).parseInbound(rawMessage, context);
}

async function resolveConversationCustomer(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  unifiedMessage: UnifiedMessage
) {
  if (unifiedMessage.chatType === "group") {
    return customerService.getOrCreateByExternalRef(trx, {
      tenantId,
      channelType: unifiedMessage.channelType,
      externalRef: unifiedMessage.chatExternalRef,
      displayName: unifiedMessage.chatName,
      metadata: {
        entityKind: "group",
        chatType: unifiedMessage.chatType
      }
    });
  }

  return customerService.getOrCreateByExternalRef(trx, {
    tenantId,
    channelType: unifiedMessage.channelType,
    externalRef: unifiedMessage.senderExternalRef,
    displayName: unifiedMessage.participantDisplayName,
    metadata: {
      entityKind: "contact",
      chatType: unifiedMessage.chatType
    }
  });
}

function previewForMessage(message: { messageType: string }) {
  switch (message.messageType) {
    case "media":
      return "[media]";
    case "interactive":
      return "[interactive]";
    case "location":
      return "[location]";
    case "contacts":
      return "[contacts]";
    default:
      return "[event]";
  }
}

/**
 * Resets the idle-close timer and schedules the FRT alert for a new
 * customer inbound message.
 *
 * Idle timer scheduling is delegated to `scheduleIdleTimer` (shared with
 * outbound.worker) so the clock resets on activity from either party.
 * FRT scheduling is inbound-only — it tracks first human response time.
 *
 * Uses stable jobIds so each new message replaces the previous delayed job.
 */
async function scheduleConversationTimeouts(
  tenantId: string,
  conversationId: string,
  customerId: string,
  queueStatus: string,
  preserveHumanOwner: boolean,
): Promise<void> {
  const definition = await resolveConversationSlaDefinition(tenantId, customerId);
  if (!definition) return;
  const hasServiceReply = await db("messages")
    .where({ tenant_id: tenantId, conversation_id: conversationId, direction: "outbound" })
    .whereIn("sender_type", ["agent", "bot"])
    .first("message_id")
    .then((row) => Boolean(row));

  const timeoutPlan = deriveInboundTimeoutPlan({
    definition,
    queueStatus,
    preserveHumanOwner,
    hasServiceReply
  });

  if (timeoutPlan.scheduleFirstResponse) {
    await scheduleFirstResponseTimeout(tenantId, conversationId, customerId);
  }

  if (timeoutPlan.scheduleAssignmentAccept) {
    await scheduleAssignmentAcceptTimeout(tenantId, conversationId, customerId);
  }

  if (timeoutPlan.scheduleSubsequentResponse) {
    await scheduleSubsequentResponseTimeout(tenantId, conversationId, customerId);
  }
}
