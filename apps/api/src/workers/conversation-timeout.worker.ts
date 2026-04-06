/**
 * Conversation Timeout Worker
 *
 * Normalized timeout semantics:
 * - first_response: customer is waiting for the first human reply
 * - assignment_accept: conversation is reserved/assigned but still unclaimed
 * - subsequent_response: service replied before, customer replied again, owner still has not followed up
 * - follow_up: conversation was already handled and is now waiting to close or
 *   follow up (`semantic`, `waiting_customer`)
 */

import { Worker } from "bullmq";

import { withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  conversationTimeoutQueue,
  routingQueue,
  type ConversationTimeoutJobPayload
} from "../infra/queue/queues.js";
import { OwnershipService } from "../modules/conversation/ownership.service.js";
import { ConversationClosureEvaluatorService } from "../modules/conversation/conversation-closure-evaluator.service.js";
import { emitConversationUpdatedSnapshot } from "../modules/conversation/conversation-realtime.service.js";
import { ConversationSegmentService } from "../modules/conversation/conversation-segment.service.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE } from "../modules/message/message.constants.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { RoutingContextService } from "../modules/routing-engine/routing-context.service.js";
import { RoutingExecutionService } from "../modules/routing-engine/routing-execution.service.js";
import { RoutingPlanRepository } from "../modules/routing-engine/routing-plan.repository.js";
import { UnifiedRoutingEngineService } from "../modules/routing-engine/unified-routing-engine.service.js";
import { HumanDispatchService } from "../modules/routing-engine/human-dispatch.service.js";
import { recordConversationSlaBreach } from "../modules/sla/sla-breach.service.js";
import {
  resolveConversationSlaDefinition,
  resolveConfiguredFollowUpCloseMode,
  resolveConversationTriggerPolicy,
  scheduleAssignmentAcceptTimeout,
  scheduleFollowUpTimeout,
  scheduleSubsequentResponseTimeout,
  type FollowUpMonitorMode,
  type SlaTriggerAction
} from "../modules/sla/conversation-sla.service.js";

/** Conversation statuses that are considered "active" (eligible for soft close) */
const ACTIVE_STATUSES = new Set(["open", "queued", "bot_active", "human_active"]);
const conversationSegmentService = new ConversationSegmentService();
const humanDispatchService = new HumanDispatchService();
const ownershipService = new OwnershipService();
const conversationClosureEvaluatorService = new ConversationClosureEvaluatorService();
const routingContextService = new RoutingContextService();
const routingExecutionService = new RoutingExecutionService();
const unifiedRoutingEngineService = new UnifiedRoutingEngineService();
const routingPlanRepository = new RoutingPlanRepository();

function hasTriggerAction(actions: SlaTriggerAction[], type: SlaTriggerAction["type"]) {
  return actions.some((action) => action.type === type);
}

function findTriggerAction(actions: SlaTriggerAction[], type: SlaTriggerAction["type"]) {
  return actions.find((action) => action.type === type) ?? null;
}

function shouldCloseForMode(actions: SlaTriggerAction[], mode: FollowUpMonitorMode) {
  return actions.some((action) => action.type === "close_case" && (!action.mode || action.mode === mode));
}

function normalizeTimeoutAlert(input: ConversationTimeoutJobPayload): {
  alertType: "first_response" | "assignment_accept" | "subsequent_response" | "follow_up";
  followUpMode: FollowUpMonitorMode | null;
} {
  if (input.alertType === "frt") return { alertType: "first_response", followUpMode: null };
  if (input.alertType === "reassign") return { alertType: "assignment_accept", followUpMode: null };
  if (input.alertType === "close") return { alertType: "follow_up", followUpMode: input.closeMode ?? "waiting_customer" };
  if (input.alertType === "unanswered_close") return { alertType: "follow_up", followUpMode: input.followUpMode ?? "waiting_customer" };
  if (input.alertType === "follow_up") {
    return { alertType: "follow_up", followUpMode: input.followUpMode ?? "waiting_customer" };
  }
  return {
    alertType: input.alertType as "first_response" | "assignment_accept" | "subsequent_response" | "follow_up",
    followUpMode: null
  };
}

async function applySmartReassignment(
  trx: Parameters<typeof withTenantTransaction>[1] extends (arg: infer T) => unknown ? T : never,
  input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    channelType: string;
    channelId: string;
    previousAssignedAgentId: string | null;
    triggerType: "assignment_accept_timeout" | "subsequent_response_timeout";
  }
) {
  const context = await routingContextService.build(trx, {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    customerId: input.customerId,
    channelType: input.channelType,
    channelId: input.channelId,
    excludedAgentIds: input.previousAssignedAgentId ? [input.previousAssignedAgentId] : []
  });

  const plan = await unifiedRoutingEngineService.createPlan(trx, context);
  const reroutePlan = {
    ...plan,
    triggerType: input.triggerType as typeof plan.triggerType
  };
  const planId = await routingPlanRepository.create(trx, reroutePlan);
  reroutePlan.planId = planId;
  await routingExecutionService.applyInboundPlan(trx, reroutePlan);

  await trx("conversation_events").insert({
    tenant_id: input.tenantId,
    conversation_id: input.conversationId,
    event_type: "assignment_reassigned",
    actor_type: "system",
    actor_id: null,
    payload: {
      triggerType: input.triggerType,
      previousAssignedAgentId: input.previousAssignedAgentId,
      assignedAgentId: reroutePlan.target.agentId,
      assignedAiAgentId: reroutePlan.target.aiAgentId,
      status: reroutePlan.statusPlan.queueStatus,
      reason: reroutePlan.trace.decision.reason
    }
  });

  await emitConversationUpdatedSnapshot(trx, input.tenantId, input.conversationId, {
    occurredAt: new Date().toISOString()
  });

  return reroutePlan;
}

export function createConversationTimeoutWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<ConversationTimeoutJobPayload>(
    conversationTimeoutQueue.name,
    async (job) => {
      const { tenantId, conversationId, scheduledAt } = job.data;
      const normalized = normalizeTimeoutAlert(job.data);

      const result = await withTenantTransaction(tenantId, async (trx) => {
        const conv = await trx("conversations")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .select("status", "last_message_at", "channel_id", "channel_type")
          .first<{
            status: string;
            last_message_at: string | Date | null;
            channel_id: string;
            channel_type: string;
          }>();

        if (!conv) {
          return { skipped: true, reason: "conversation_not_found" };
        }

        if (normalized.alertType === "follow_up") {
          if (!ACTIVE_STATUSES.has(conv.status)) {
            return { skipped: true, reason: `already_${conv.status}` };
          }
          const latestActivity = await trx("messages")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .max<{ latest_at: string | Date | null }>("created_at as latest_at")
            .first();

          if (latestActivity?.latest_at) {
            const lastActivityMs = new Date(latestActivity.latest_at).getTime();
            if (lastActivityMs > scheduledAt) {
              return { skipped: true, reason: "activity_after_schedule" };
            }
          }

          const customer = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("customer_id", "current_case_id", "assigned_agent_id")
            .first<{ customer_id: string | null; current_case_id: string | null; assigned_agent_id: string | null } | undefined>();
          const definition = customer?.customer_id
            ? await resolveConversationSlaDefinition(tenantId, customer.customer_id)
            : null;
          const triggerPolicy = customer?.customer_id
            ? await resolveConversationTriggerPolicy(tenantId, customer.customer_id)
            : null;
          const configuredFollowUpMode = resolveConfiguredFollowUpCloseMode(triggerPolicy) ?? "waiting_customer";
          const actualSec = latestActivity?.latest_at && definition?.followUpTargetSec
            ? Math.max(
              definition.followUpTargetSec + 1,
              Math.ceil((Date.now() - new Date(latestActivity.latest_at).getTime()) / 1000)
            )
            : null;

          if (definition?.followUpTargetSec && actualSec) {
            await recordConversationSlaBreach({
              trx,
              tenantId,
              conversationId,
              customerId: customer?.customer_id ?? null,
              caseId: customer?.current_case_id ?? null,
              agentId: customer?.assigned_agent_id ?? null,
              metric: "follow_up",
              targetSec: definition.followUpTargetSec,
              actualSec,
              severity: "warning",
              details: {
                trigger: "follow_up_timeout",
                followUpMode: configuredFollowUpMode
              }
            });
          }

          if (hasTriggerAction(triggerPolicy?.followUpActions ?? [], "escalate")) {
            await trx("conversation_events").insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              event_type: "sla_follow_up_escalated",
              actor_type: "system",
              actor_id: null,
              payload: { followUpMode: configuredFollowUpMode }
            });
          }

          if (!shouldCloseForMode(triggerPolicy?.followUpActions ?? [], configuredFollowUpMode)) {
            return { skipped: false, action: "follow_up_breach_recorded" };
          }

          if (configuredFollowUpMode === "semantic") {
            const verdict = await conversationClosureEvaluatorService.evaluate(trx, {
              tenantId,
              conversationId
            });

            if (verdict.verdict !== "close") {
              if (customer?.customer_id) {
                await scheduleFollowUpTimeout(tenantId, conversationId, customer.customer_id, {
                  mode: "semantic"
                });
              }
              return {
                skipped: false,
                action: "follow_up_semantic_continues",
                verdict: verdict.verdict,
                confidence: verdict.confidence,
                reason: verdict.reason
              };
            }
          }

          await conversationSegmentService.closeCurrentSegment(trx, {
            tenantId,
            conversationId,
            status: "resolved",
            reason: `sla-follow-up-${configuredFollowUpMode}`
          });

          // Auto-resolve the conversation
          await ownershipService.applyTransition(trx, {
            type: "resolve_conversation",
            tenantId,
            conversationId,
            status: "resolved"
          });

          await trx("queue_assignments")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .update({
              status: "resolved",
              handoff_required: false,
              handoff_reason: null,
              updated_at: new Date()
            });

          await trx("conversation_events").insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            event_type: "auto_resolved_close",
            actor_type: "system",
            actor_id: null,
            payload: {
              closeMode: configuredFollowUpMode
            }
          });

          await emitConversationUpdatedSnapshot(trx, tenantId, conversationId, {
            occurredAt: new Date().toISOString()
          });

          return { skipped: false, action: "auto_resolved_close" };
        }

        if (normalized.alertType === "first_response") {
          if (!["human_active", "queued", "open"].includes(conv.status)) {
            return { skipped: true, reason: `status_is_${conv.status}` };
          }

          const customer = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("customer_id", "current_case_id", "assigned_agent_id")
            .first<{ customer_id: string | null; current_case_id: string | null; assigned_agent_id: string | null } | undefined>();
          const definition = customer?.customer_id
            ? await resolveConversationSlaDefinition(tenantId, customer.customer_id)
            : null;
          const triggerPolicy = customer?.customer_id
            ? await resolveConversationTriggerPolicy(tenantId, customer.customer_id)
            : null;
          const latestCustomerMessage = await trx("messages")
            .where({
              tenant_id: tenantId,
              conversation_id: conversationId,
              direction: "inbound",
              sender_type: CUSTOMER_MESSAGE_SENDER_TYPE
            })
            .max<{ latest_at: string | Date | null }>("created_at as latest_at")
            .first();
          const frtActualSec = latestCustomerMessage?.latest_at && definition?.firstResponseTargetSec
            ? Math.max(
              definition.firstResponseTargetSec + 1,
              Math.ceil((Date.now() - new Date(latestCustomerMessage.latest_at).getTime()) / 1000)
            )
            : null;

          if (definition?.firstResponseTargetSec && frtActualSec) {
            await recordConversationSlaBreach({
              trx,
              tenantId,
              conversationId,
              customerId: customer?.customer_id ?? null,
              caseId: customer?.current_case_id ?? null,
              agentId: customer?.assigned_agent_id ?? null,
              metric: "first_response",
              targetSec: definition.firstResponseTargetSec,
              actualSec: frtActualSec,
              severity: "warning",
              details: {
                trigger: "first_response_timeout",
                conversationStatus: conv.status
              }
            });
          }

          if (hasTriggerAction(triggerPolicy?.firstResponseActions ?? [], "escalate")) {
            await trx("conversation_events").insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              event_type: "sla_first_response_escalated",
              actor_type: "system",
              actor_id: null,
              payload: { conversationStatus: conv.status }
            });
          }

          realtimeEventBus.emitEvent("conversation.updated", {
            tenantId,
            conversationId,
            status: `frt_breach:${conv.status}`,
            occurredAt: new Date().toISOString()
          });

          return { skipped: false, action: "frt_alert_emitted" };
        }

        if (normalized.alertType === "subsequent_response") {
          const conversation = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("customer_id", "current_case_id", "assigned_agent_id", "current_handler_type", "current_handler_id", "channel_type", "channel_id")
            .first<{
              customer_id: string | null;
              current_case_id: string | null;
              assigned_agent_id: string | null;
              current_handler_type: string | null;
              current_handler_id: string | null;
              channel_type: string;
              channel_id: string;
            } | undefined>();

          if (!conversation?.customer_id || !conversation.assigned_agent_id) {
            return { skipped: true, reason: "subsequent_response_no_human_owner" };
          }
          if (conv.status !== "human_active") {
            return { skipped: true, reason: `status_is_${conv.status}` };
          }

          const latestServiceReply = await trx("messages")
            .where({ tenant_id: tenantId, conversation_id: conversationId, direction: "outbound", sender_type: "agent" })
            .max<{ latest_at: string | Date | null }>("created_at as latest_at")
            .first();
          if (latestServiceReply?.latest_at && new Date(latestServiceReply.latest_at).getTime() > scheduledAt) {
            return { skipped: true, reason: "service_replied_after_schedule" };
          }

          const latestCustomerReply = await trx("messages")
            .where({ tenant_id: tenantId, conversation_id: conversationId, direction: "inbound", sender_type: "customer" })
            .max<{ latest_at: string | Date | null }>("created_at as latest_at")
            .first();
          if (!latestCustomerReply?.latest_at) {
            return { skipped: true, reason: "no_customer_reply_found" };
          }

          const definition = await resolveConversationSlaDefinition(tenantId, conversation.customer_id);
          const triggerPolicy = await resolveConversationTriggerPolicy(tenantId, conversation.customer_id);
          const targetSec = definition?.subsequentResponseTargetSec ?? null;
          const actualSec = targetSec
            ? Math.max(targetSec + 1, Math.ceil((Date.now() - new Date(latestCustomerReply.latest_at).getTime()) / 1000))
            : null;

          if (targetSec && actualSec) {
            await recordConversationSlaBreach({
              trx,
              tenantId,
              conversationId,
              customerId: conversation.customer_id,
              caseId: conversation.current_case_id,
              agentId: conversation.assigned_agent_id,
              metric: "subsequent_response",
              targetSec,
              actualSec,
              severity: "warning",
              details: {
                trigger: "subsequent_response_timeout",
                currentOwnerAgentId: conversation.assigned_agent_id
              }
            });
          }

          const reassignAction = findTriggerAction(triggerPolicy?.subsequentResponseActions ?? [], "reassign");
          const reassignMode = reassignAction?.condition ?? "owner_unavailable";
          const ownerAvailability = await humanDispatchService.inspectAgentAvailability(trx, {
            tenantId,
            agentId: conversation.assigned_agent_id
          });
          const ownerUnavailable = !ownerAvailability || !ownerAvailability.eligible;

          if (!reassignAction || (reassignMode === "owner_unavailable" && !ownerUnavailable)) {
            if (hasTriggerAction(triggerPolicy?.subsequentResponseActions ?? [], "escalate")) {
              await trx("conversation_events").insert({
                tenant_id: tenantId,
                conversation_id: conversationId,
                event_type: "sla_subsequent_response_escalated",
                actor_type: "system",
                actor_id: null,
                payload: {
                  currentOwnerAgentId: conversation.assigned_agent_id,
                  ownerUnavailable,
                  reassignMode
                }
              });
            }
            await scheduleSubsequentResponseTimeout(tenantId, conversationId, conversation.customer_id);
            return { skipped: false, action: "subsequent_response_breach_recorded" };
          }

          const reroutePlan = await applySmartReassignment(trx, {
            tenantId,
            conversationId,
            customerId: conversation.customer_id,
            channelType: conversation.channel_type,
            channelId: conversation.channel_id,
            previousAssignedAgentId: conversation.assigned_agent_id,
            triggerType: "subsequent_response_timeout"
          });

          return {
            skipped: false,
            action: "subsequent_response_reassigned",
            assignedAgentId: reroutePlan.target.agentId,
            assignedAiAgentId: reroutePlan.target.aiAgentId,
            queueStatus: reroutePlan.statusPlan.queueStatus,
            planId: reroutePlan.planId ?? null,
            customerId: conversation.customer_id,
            channelType: conversation.channel_type
          };
        }

        if (normalized.alertType === "assignment_accept") {
          const assignment = await trx("queue_assignments")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select(
              "status",
              "assigned_agent_id",
              "assigned_ai_agent_id",
              "department_id",
              "team_id",
              "assignment_strategy",
              "priority",
              "updated_at",
              "handoff_required",
              "handoff_reason"
            )
            .first<{
              status: string | null;
              assigned_agent_id: string | null;
              assigned_ai_agent_id: string | null;
              department_id: string | null;
              team_id: string | null;
              assignment_strategy: "round_robin" | "least_busy" | "balanced_new_case" | "sticky" | null;
              priority: number | null;
              updated_at: string | Date | null;
              handoff_required: boolean | null;
              handoff_reason: string | null;
            }>();

          const caseState = await trx("conversation_cases")
            .where({ tenant_id: tenantId, case_id: (await resolveCaseId(trx, tenantId, conversationId)) ?? "" })
            .select("current_owner_type", "current_owner_id")
            .first<{ current_owner_type: string | null; current_owner_id: string | null } | undefined>();

          if (!assignment) {
            return { skipped: true, reason: "assignment_not_found" };
          }
          if (!["queued", "open"].includes(conv.status)) {
            return { skipped: true, reason: `status_is_${conv.status}` };
          }
          if (caseState?.current_owner_type === "agent" && caseState.current_owner_id) {
            return { skipped: true, reason: "assignment_already_accepted" };
          }
          if (assignment.updated_at && new Date(assignment.updated_at).getTime() > scheduledAt) {
            return { skipped: true, reason: "assignment_updated_after_schedule" };
          }

          const latestActivity = await trx("messages")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .where((builder) => {
              builder
                .where({ direction: "inbound", sender_type: "customer" })
                .orWhere({ direction: "outbound", sender_type: "agent" });
            })
            .max<{ latest_at: string | Date | null }>("created_at as latest_at")
            .first();

          if (latestActivity?.latest_at && new Date(latestActivity.latest_at).getTime() > scheduledAt) {
            return { skipped: true, reason: "activity_after_schedule" };
          }

          const customer = await trx("customers")
            .join("conversations as c", function joinConversation() {
              this.on("c.customer_id", "=", "customers.customer_id").andOn("c.tenant_id", "=", "customers.tenant_id");
            })
            .where({ "customers.tenant_id": tenantId, "c.conversation_id": conversationId })
            .select("customers.customer_id", "customers.language", "customers.tier", "c.channel_type", "c.channel_id", "c.current_case_id")
            .first<{
              customer_id: string;
              language: string | null;
              tier: string | null;
              channel_type: string;
              channel_id: string;
              current_case_id: string | null;
            } | undefined>();

          if (!customer) {
            return { skipped: true, reason: "customer_not_found" };
          }

          const definition = await resolveConversationSlaDefinition(tenantId, customer.customer_id);
          const triggerPolicy = await resolveConversationTriggerPolicy(tenantId, customer.customer_id);
          const reassignActualSec = assignment.updated_at && definition?.assignmentAcceptTargetSec
            ? Math.max(
              definition.assignmentAcceptTargetSec + 1,
              Math.ceil((Date.now() - new Date(assignment.updated_at).getTime()) / 1000)
            )
            : null;

          if (definition?.assignmentAcceptTargetSec && reassignActualSec) {
            await recordConversationSlaBreach({
              trx,
              tenantId,
              conversationId,
              customerId: customer.customer_id,
              caseId: customer.current_case_id,
              agentId: assignment.assigned_agent_id,
              metric: "assignment_accept",
              targetSec: definition.assignmentAcceptTargetSec,
              actualSec: reassignActualSec,
              severity: "warning",
              details: {
                trigger: "assignment_accept_timeout",
                previousAssignedAgentId: assignment.assigned_agent_id,
                queueStatus: assignment.status
              }
            });
          }

          if (!hasTriggerAction(triggerPolicy?.assignmentAcceptActions ?? [], "reassign")) {
            if (hasTriggerAction(triggerPolicy?.assignmentAcceptActions ?? [], "escalate")) {
              await trx("conversation_events").insert({
                tenant_id: tenantId,
                conversation_id: conversationId,
                event_type: "sla_assignment_accept_escalated",
                actor_type: "system",
                actor_id: null,
                payload: {
                  previousAssignedAgentId: assignment.assigned_agent_id,
                  queueStatus: assignment.status
                }
              });
            }
            return { skipped: false, action: "assignment_accept_breach_recorded" };
          }

          const reroutePlan = await applySmartReassignment(trx, {
            tenantId,
            conversationId,
            customerId: customer.customer_id,
            channelType: customer.channel_type,
            channelId: customer.channel_id,
            previousAssignedAgentId: assignment.assigned_agent_id,
            triggerType: "assignment_accept_timeout"
          });

          if (reroutePlan.statusPlan.selectedOwnerType === "human" && ["assigned", "pending"].includes(reroutePlan.statusPlan.queueStatus)) {
            await scheduleAssignmentAcceptTimeout(tenantId, conversationId, customer.customer_id, {
              currentJobId: job.id ?? null
            });
          }

          return {
            skipped: false,
            action: "assignment_reassigned",
            assignedAgentId: reroutePlan.target.agentId,
            assignedAiAgentId: reroutePlan.target.aiAgentId,
            queueStatus: reroutePlan.statusPlan.queueStatus,
            planId: reroutePlan.planId ?? null,
            customerId: customer.customer_id,
            channelType: customer.channel_type
          };
        }

        return { skipped: true, reason: "unknown_alert_type" };
      });

      if (
        result &&
        typeof result === "object" &&
        "planId" in result &&
        "assignedAiAgentId" in result &&
        result.planId &&
        result.assignedAiAgentId &&
        "customerId" in result &&
        result.customerId &&
        "channelType" in result &&
        result.channelType
      ) {
        await routingQueue.add(
          "routing.required",
          {
            tenantId,
            planId: String(result.planId),
            conversationId,
            customerId: String(result.customerId),
            messageId: null,
            channelType: String(result.channelType)
          },
          {
            removeOnComplete: 100,
            removeOnFail: 50
          }
        );
      }

      return result;
    },
    {
      connection: workerConnection as any,
      concurrency: 5
    }
  );
}

async function buildUnansweredClosureSummary(
  trx: Parameters<typeof withTenantTransaction>[1] extends (arg: infer T) => unknown ? T : never,
  tenantId: string,
  conversationId: string,
  scheduledAt: number
) {
  const conversation = await trx("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("customer_id", "assigned_agent_id", "current_handler_type", "current_handler_id", "last_message_at")
    .first<{
      customer_id: string | null;
      assigned_agent_id: string | null;
      current_handler_type: string | null;
      current_handler_id: string | null;
      last_message_at: string | Date | null;
    } | undefined>();

  const traces = await trx("decision_traces")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .whereIn("trace_kind", ["dispatch_execution", "dispatch_transition"])
    .orderBy("created_at", "asc")
    .select(
      "trace_kind",
      "decision_type",
      "created_at",
      "decision_summary",
      "payload",
      "to_owner_type",
      "to_owner_id"
    ) as Array<Record<string, unknown>>;

  const attempts = traces.flatMap((row) => {
    const createdAt = toDate(row.created_at);
    if (!createdAt) return [];
    if (row.trace_kind === "dispatch_execution") {
      const summary = parseJsonObject(row.decision_summary);
      const assignedAgentId = readNullableString(summary.assignedAgentId);
      const aiAgentId = readNullableString(summary.aiAgentId);
      if (!assignedAgentId && !aiAgentId) return [];
      return [{
        ownerType: assignedAgentId ? "agent" : "ai",
        ownerId: assignedAgentId ?? aiAgentId,
        startedAt: createdAt.toISOString(),
        source: String(row.decision_type ?? "dispatch_execution")
      }];
    }

    if (row.trace_kind === "dispatch_transition" && row.decision_type === "assignment_reroute") {
      const payload = parseJsonObject(row.payload);
      const assignedAgentId = readNullableString(payload.assignedAgentId) ?? readNullableString(row.to_owner_id);
      if (!assignedAgentId) return [];
      return [{
        ownerType: "agent",
        ownerId: assignedAgentId,
        startedAt: createdAt.toISOString(),
        source: "assignment_reroute"
      }];
    }

    return [];
  });

  const uniqueAttempts = attempts.filter((attempt, index) => {
    return attempts.findIndex((candidate) =>
      candidate.ownerType === attempt.ownerType &&
      candidate.ownerId === attempt.ownerId &&
      candidate.startedAt === attempt.startedAt
    ) === index;
  });

  const agentIds = uniqueAttempts.filter((attempt) => attempt.ownerType === "agent").map((attempt) => attempt.ownerId);
  const aiAgentIds = uniqueAttempts.filter((attempt) => attempt.ownerType === "ai").map((attempt) => attempt.ownerId);

  const [agentRows, aiRows] = await Promise.all([
    agentIds.length > 0
      ? trx("agent_profiles")
        .where({ tenant_id: tenantId })
        .whereIn("agent_id", agentIds)
        .select("agent_id", "display_name")
      : Promise.resolve([]),
    aiAgentIds.length > 0
      ? trx("tenant_ai_agents")
        .where({ tenant_id: tenantId })
        .whereIn("ai_agent_id", aiAgentIds)
        .select("ai_agent_id", "name")
      : Promise.resolve([])
  ]);

  const agentNames = new Map(agentRows.map((row) => [String(row.agent_id), row.display_name ?? null]));
  const aiAgentNames = new Map(aiRows.map((row) => [String(row.ai_agent_id), row.name ?? null]));

  const endAt = new Date(scheduledAt).toISOString();
  const assignmentAttempts = uniqueAttempts.map((attempt, index) => {
    const nextStart = uniqueAttempts[index + 1]?.startedAt ?? endAt;
    const durationSec = Math.max(0, Math.floor((new Date(nextStart).getTime() - new Date(attempt.startedAt).getTime()) / 1000));
    return {
      ownerType: attempt.ownerType,
      ownerId: attempt.ownerId,
      ownerName: attempt.ownerType === "agent"
        ? (agentNames.get(attempt.ownerId!) ?? undefined)
        : (aiAgentNames.get(attempt.ownerId!) ?? undefined),
      assignedAt: attempt.startedAt,
      endedAt: nextStart,
      unhandledDurationSec: durationSec,
      source: attempt.source
    };
  });

  return {
    autoCloseReason: "unanswered_auto_close_timeout",
    customerId: conversation?.customer_id ?? null,
    lastCustomerMessageAt: conversation?.last_message_at ? new Date(conversation.last_message_at).toISOString() : null,
    totalAssignmentAttempts: assignmentAttempts.length,
    totalReassignments: Math.max(0, assignmentAttempts.length - 1),
    assignmentAttempts,
    finalOwnerType: conversation?.current_handler_type ?? "system",
    finalOwnerId: conversation?.current_handler_id ?? conversation?.assigned_agent_id ?? null
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

async function resolveCaseId(
  trx: Parameters<typeof withTenantTransaction>[1] extends (arg: infer T) => unknown ? T : never,
  tenantId: string,
  conversationId: string
) {
  const row = await trx("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();

  return row?.current_case_id ?? null;
}
