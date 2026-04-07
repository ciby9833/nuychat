/**
 * Routing Worker
 *
 * Processes jobs from the `routing` queue. Each job represents a conversation
 * that has just received a new inbound message and needs an AI response or
 * human handoff decision.
 *
 * Flow:
 *   1. Fetch tenant context (operating mode, AI config)
 *   2. If ai_first / ai_autonomous → call OrchestratorService
 *   3. If AI produced a reply → enqueue outbound message
 *   4. If handoff needed → update conversation status to "queued"
 *   5. Emit realtime events
 */
import type { Knex } from "knex";
import { Worker } from "bullmq";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { outboundQueue, routingQueue, type RoutingJobPayload } from "../infra/queue/queues.js";
import { OwnershipService } from "../modules/conversation/ownership.service.js";
import { emitConversationUpdatedSnapshot } from "../modules/conversation/conversation-realtime.service.js";
import { DispatchAuditService } from "../modules/dispatch/dispatch-audit.service.js";
import { OrchestratorService } from "../modules/orchestrator/orchestrator.service.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { RoutingPlanRepository } from "../modules/routing-engine/routing-plan.repository.js";
import { RoutingPlanStepService } from "../modules/routing-engine/routing-plan-step.service.js";
import { RoutingContextService } from "../modules/routing-engine/routing-context.service.js";
import { RoutingNoticeService } from "../modules/routing-engine/routing-notice.service.js";
import { UnifiedRoutingEngineService } from "../modules/routing-engine/unified-routing-engine.service.js";
import { scheduleAssignmentAcceptTimeout } from "../modules/sla/conversation-sla.service.js";
import {
  inferStructuredMessageFromText,
  isInternalControlPayload,
  structuredToPlainText
} from "../shared/messaging/structured-message.js";

const orchestrator = new OrchestratorService();
const ownershipService = new OwnershipService();
const dispatchAuditService = new DispatchAuditService();
const routingPlanRepository = new RoutingPlanRepository();
const routingPlanStepService = new RoutingPlanStepService();
const routingContextService = new RoutingContextService();
const unifiedRoutingEngineService = new UnifiedRoutingEngineService();
const routingNoticeService = new RoutingNoticeService();

function fitAiTraceReason(value: string | null | undefined) {
  if (!value) return null;
  return value.length > 100 ? value.slice(0, 100) : value;
}

export function createRoutingWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<RoutingJobPayload>(
    routingQueue.name,
    async (job) => {
      const { tenantId, planId, conversationId, customerId, channelType } = job.data;
      const plan = await withTenantTransaction(tenantId, async (trx) =>
        routingPlanRepository.getById(trx, tenantId, planId)
      );
      if (!plan) {
        throw new Error(`Routing plan not found: ${planId}`);
      }

      if (plan.statusPlan.selectedOwnerType === "human") {
        await withTenantTransaction(tenantId, async (trx) => {
          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "skipped",
            payload: { reason: "selected_owner_human" }
          });
        });
        return { skipped: true, reason: "selected_owner_human" };
      }

      const conversation = await withTenantTransaction(tenantId, async (trx) =>
        trx("conversations")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .select(
            "channel_id",
            "status",
            "customer_id",
            "current_case_id",
            "assigned_agent_id",
            "current_handler_type",
            "current_handler_id",
            "current_segment_id"
          )
          .first()
      );

      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      // Human-exclusive guard: if a human agent has taken over, AI must not re-engage
      if (conversation.status === "human_active") {
        await withTenantTransaction(tenantId, async (trx) => {
          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "skipped",
            payload: { reason: "human_active_exclusive" }
          });
        });
        return { skipped: true, reason: "human_active_exclusive" };
      }

      await withTenantTransaction(tenantId, async (trx) => {
        await routingPlanStepService.record(trx, {
          tenantId,
          planId,
          stepType: "ai_runtime",
          status: "started",
          payload: {
            aiAgentId: plan.target.aiAgentId,
            aiAgentName: plan.target.aiAgentName
          }
        });
      });

      const preferences = await withTenantTransaction(tenantId, async (trx) =>
        trx("conversation_skill_preferences")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .select("preferred_skills")
          .first<{ preferred_skills: unknown }>()
      );

      const selectedExecutionId = await withTenantTransaction(tenantId, async (trx) => {
        return dispatchAuditService.recordExecution(trx, {
          tenantId,
          conversationId,
          customerId,
          segmentId: (conversation.current_segment_id as string | null | undefined) ?? null,
          triggerType: "ai_routing_execution",
          decisionType: "ai_runtime",
          channelType,
          channelId: conversation.channel_id as string,
          routingRuleId: plan.trace.aiSelection.routingRuleId,
          routingRuleName: plan.trace.aiSelection.routingRuleName,
          matchedConditions: plan.trace.aiSelection.matchedConditions,
          inputSnapshot: {
            planId,
            currentHandlerType: conversation.current_handler_type ?? null,
            currentHandlerId: conversation.current_handler_id ?? null,
            conversationStatus: conversation.status
          },
          decisionSummary: {
            aiAgentId: plan.target.aiAgentId,
            aiAgentName: plan.target.aiAgentName,
            selectionMode: plan.trace.aiSelection.selectionMode
          },
          decisionReason: plan.trace.aiSelection.reason,
          candidates: plan.trace.aiSelection.candidates
        });
      });

      if (!plan.target.aiAgentId) {
        const handoffTarget = await withTenantTransaction(tenantId, async (trx) =>
          resolveReservedHumanTarget(trx, {
            tenantId,
            plannedTarget: {
              assignedAgentId: plan.fallback?.agentId ?? null,
              departmentId: plan.fallback?.departmentId ?? plan.target.departmentId,
              teamId: plan.fallback?.teamId ?? plan.target.teamId,
              strategy: (plan.fallback?.strategy ?? plan.target.strategy) as ("round_robin" | "least_busy" | "sticky"),
              priority: plan.fallback?.priority ?? plan.target.priority
            }
          })
        );

        await releaseConversationToHumanQueue({
          tenantId,
          planId,
          conversationId,
          customerId,
          channelType,
          conversation,
          executionId: selectedExecutionId,
          handoffTarget,
          reason: plan.trace.aiSelection.reason || "no_active_ai_agent",
          transitionType: "ai_unavailable_to_system",
          actorType: "system",
          actorId: null,
          assignedAiAgentId: null,
          stepStatus: "failed",
          stepPayload: {
            reason: plan.trace.aiSelection.reason || "no_active_ai_agent",
            queueStatus: handoffTarget.status,
            assignedAgentId: handoffTarget.assignedAgentId
          }
        });

        return {
          conversationId,
          responded: false,
          handoff: true,
          reason: "no_active_ai_agent"
        };
      }

      // ── 3. Run orchestrator ──────────────────────────────────────────────────
      const orchestratorStart = Date.now();
      let result;
      let orchestratorError: string | null = null;
      try {
        result = await withTenantTransaction(tenantId, async (trx) =>
          orchestrator.run(trx, {
            tenantId,
            conversationId,
            customerId,
            channelType,
            caseId: conversation.current_case_id as string | null,
            capabilityScope: null,
            actorType: "ai",
            preferredSkillNames: parsePreferredSkills(preferences?.preferred_skills),
            aiAgentId: plan.target.aiAgentId
          })
        );
      } catch (err) {
        orchestratorError = (err as Error).message ?? "unknown_error";
        result = {
          action: "handoff" as const,
          response: null as null,
          intent: "unknown",
          sentiment: "neutral" as const,
          shouldHandoff: true,
          handoffReason: orchestratorError,
          tokensUsed: 0,
          confidence: 0,
          skillsInvoked: [] as string[],
          skillsBlocked: [] as Array<{ name: string; reason: string }>
        };
      }
      const orchestratorDurationMs = Date.now() - orchestratorStart;

      // ── 4. Save AI trace ─────────────────────────────────────────────────────
      await withTenantTransaction(tenantId, async (trx) => {
        await trx("ai_traces").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          supervisor: "orchestrator",
          steps: JSON.stringify([
            { step: "intent",             output: result.intent },
            { step: "sentiment",          output: result.sentiment },
            { step: "response_generated", output: result.response !== null },
            { step: "skills_called",      output: result.skillsInvoked },
            { step: "skills_blocked",     output: result.skillsBlocked ?? [] },
            { step: "ai_agent",           output: plan.target.aiAgentName }
          ]),
          skills_called: JSON.stringify(result.skillsInvoked),
          token_usage: JSON.stringify({ prompt: 0, completion: 0, total: result.tokensUsed }),
          total_duration_ms: orchestratorDurationMs,
          handoff_reason: fitAiTraceReason(result.handoffReason),
          error: orchestratorError
        });
      });

      // ── 5. Act on result ─────────────────────────────────────────────────────
      if (result.action === "reply" && result.response) {
        const structured = inferStructuredMessageFromText(result.response);
        const outboundText = isInternalControlPayload(result.response)
          ? ""
          : structuredToPlainText(structured, result.response);
        if (!outboundText) {
          return {
            conversationId,
            intent: result.intent,
            sentiment: result.sentiment,
            responded: false,
            handoff: false
          };
        }
        // AI produced a reply → send it
        await outboundQueue.add(
          "outbound.ai_reply",
          {
            tenantId,
            conversationId,
            channelId: conversation.channel_id,
            channelType,
            message: {
              text: outboundText,
              structured,
              aiAgentName: plan.target.aiAgentName ?? undefined
            }
          },
          { removeOnComplete: 100, removeOnFail: 50 }
        );

        // Update conversation to bot_active
        await withTenantTransaction(tenantId, async (trx) => {
          const fromSegmentId = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("current_segment_id")
            .first<{ current_segment_id: string | null } | undefined>();
          await ownershipService.applyTransition(trx, {
            type: "activate_ai_owner",
            tenantId,
            conversationId,
            customerId: conversation.customer_id as string,
            caseId: conversation.current_case_id as string,
            aiAgentId: plan.target.aiAgentId!,
            reason: "ai-replied",
            caseStatus: "waiting_customer",
            conversationStatus: "bot_active"
          });
          const updatedConversation = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("current_segment_id")
            .first<{ current_segment_id: string | null } | undefined>();
          await dispatchAuditService.recordTransition(trx, {
            tenantId,
            conversationId,
            customerId: conversation.customer_id as string,
            executionId: selectedExecutionId,
            transitionType: "ai_takeover",
            actorType: "ai",
            actorId: plan.target.aiAgentId,
            fromOwnerType: (conversation.current_handler_type as string | null) ?? null,
            fromOwnerId: (conversation.current_handler_id as string | null) ?? null,
            fromSegmentId: fromSegmentId?.current_segment_id ?? null,
            toOwnerType: "ai",
            toOwnerId: plan.target.aiAgentId,
            toSegmentId: updatedConversation?.current_segment_id ?? null,
            reason: "ai-replied"
          });

          await trx("queue_assignments")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .update({
              assigned_ai_agent_id: plan.target.aiAgentId,
              handoff_required: false,
              handoff_reason: null,
              last_ai_response_at: trx.fn.now(),
              updated_at: trx.fn.now()
            });

          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "completed",
            payload: {
              outcome: "replied",
              aiAgentId: plan.target.aiAgentId,
              handoff: false,
              confidence: result.confidence
            }
          });
        });

        await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
          occurredAt: new Date().toISOString()
        });
      } else if (result.action === "handoff" || result.shouldHandoff) {
        const handoffTarget = await withTenantTransaction(tenantId, async (trx) =>
          resolveReservedHumanTarget(trx, {
            tenantId,
            plannedTarget: {
              assignedAgentId: plan.fallback?.agentId ?? null,
              departmentId: plan.fallback?.departmentId ?? plan.target.departmentId,
              teamId: plan.fallback?.teamId ?? plan.target.teamId,
              strategy: (plan.fallback?.strategy ?? plan.target.strategy) as ("round_robin" | "least_busy" | "sticky"),
              priority: plan.fallback?.priority ?? plan.target.priority
            }
          })
        );

        await releaseConversationToHumanQueue({
          tenantId,
          planId,
          conversationId,
          customerId,
          channelType,
          conversation,
          executionId: selectedExecutionId,
          handoffTarget,
          reason: result.handoffReason ?? "ai_requested_handoff",
          transitionType: "ai_handoff_to_human_queue",
          actorType: "ai",
          actorId: plan.target.aiAgentId,
          assignedAiAgentId: plan.target.aiAgentId,
          stepStatus: "completed",
          stepPayload: {
            outcome: "handoff",
            aiAgentId: plan.target.aiAgentId,
            handoff: true,
            queueStatus: handoffTarget.status,
            assignedAgentId: handoffTarget.assignedAgentId,
            handoffReason: result.handoffReason ?? "ai_requested_handoff",
            confidence: result.confidence
          }
        });
      } else {
        await withTenantTransaction(tenantId, async (trx) => {
          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "completed",
            payload: {
              outcome: "no_response_no_handoff",
              aiAgentId: plan.target.aiAgentId,
              confidence: result.confidence
            }
          });
        });
      }

      return {
        conversationId,
        intent: result.intent,
        sentiment: result.sentiment,
        responded: result.response !== null,
        handoff: result.action === "handoff" || result.shouldHandoff
      };
    },
    {
      connection: workerConnection as any,
      concurrency: 3
    }
  );
}

function parsePreferredSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

type ReservedHumanTarget = {
  departmentId: string | null;
  teamId: string | null;
  assignedAgentId: string | null;
  strategy: "round_robin" | "least_busy" | "sticky";
  priority: number;
  status: "pending" | "assigned";
  reason: string;
  queuePosition: number | null;
  estimatedWaitSec: number | null;
};

type RoutingConversationRow = {
  customer_id: string | null;
  current_case_id: string | null;
  current_handler_type: string | null;
  current_handler_id: string | null;
  channel_id?: string;
};

async function releaseConversationToHumanQueue(input: {
  tenantId: string;
  planId: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  conversation: RoutingConversationRow;
  executionId: string;
  handoffTarget: ReservedHumanTarget;
  reason: string;
  transitionType: "ai_unavailable_to_system" | "ai_handoff_to_human_queue";
  actorType: "system" | "ai";
  actorId: string | null;
  assignedAiAgentId: string | null;
  stepStatus: "failed" | "completed";
  stepPayload: Record<string, unknown>;
}) {
  const resolvedHandoffTarget = input.handoffTarget.assignedAgentId
    ? input.handoffTarget
    : await withTenantTransaction(input.tenantId, async (trx) => {
        const routingContext = await routingContextService.build(trx, {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          customerId: input.customerId,
          channelType: input.channelType,
          channelId: input.conversation.channel_id as string
        });
        const handoffPlan = await unifiedRoutingEngineService.createPlan(trx, routingContext, {
          triggerType: "ai_handoff"
        });
        const handoffPlanId = await routingPlanRepository.create(trx, handoffPlan);
        await routingPlanStepService.record(trx, {
          tenantId: input.tenantId,
          planId: handoffPlanId,
          stepType: "ai_handoff_human_plan_created",
          status: "completed",
          payload: {
            action: handoffPlan.action,
            queueStatus: handoffPlan.statusPlan.queueStatus,
            assignedAgentId: handoffPlan.target.agentId
          }
        });
        return {
          departmentId: handoffPlan.target.departmentId,
          teamId: handoffPlan.target.teamId,
          assignedAgentId: handoffPlan.target.agentId,
          strategy: handoffPlan.target.strategy,
          priority: handoffPlan.target.priority,
          status: handoffPlan.statusPlan.queueStatus,
          reason: handoffPlan.trace.decision.reason,
          queuePosition: handoffPlan.statusPlan.queuePosition,
          estimatedWaitSec: handoffPlan.statusPlan.estimatedWaitSec
        };
      });

  await withTenantTransaction(input.tenantId, async (trx) => {
    const fromSegmentId = await trx("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("current_segment_id")
      .first<{ current_segment_id: string | null } | undefined>();

    await ownershipService.applyTransition(trx, {
      type: "release_to_queue",
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.conversation.customer_id as string,
      caseId: input.conversation.current_case_id as string | null,
      reason: input.reason,
      assignedAgentId: resolvedHandoffTarget.assignedAgentId,
      conversationStatus: "queued"
    });

    const updatedConversation = await trx("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("current_segment_id")
      .first<{ current_segment_id: string | null } | undefined>();

    await dispatchAuditService.recordTransition(trx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.conversation.customer_id as string,
      executionId: input.executionId,
      transitionType: input.transitionType,
      actorType: input.actorType,
      actorId: input.actorId,
      fromOwnerType: input.conversation.current_handler_type ?? null,
      fromOwnerId: input.conversation.current_handler_id ?? null,
      fromSegmentId: fromSegmentId?.current_segment_id ?? null,
      toOwnerType: "system",
      toOwnerId: null,
      toSegmentId: updatedConversation?.current_segment_id ?? null,
      reason: input.reason
    });

    await trx("queue_assignments")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .update({
        department_id: resolvedHandoffTarget.departmentId,
        team_id: resolvedHandoffTarget.teamId,
        assigned_agent_id: resolvedHandoffTarget.assignedAgentId,
        // Once AI gives up control, the queue record must be purely human-facing.
        assigned_ai_agent_id: null,
        assignment_strategy: resolvedHandoffTarget.strategy,
        priority: resolvedHandoffTarget.priority,
        status: resolvedHandoffTarget.status,
        assignment_reason: resolvedHandoffTarget.reason,
        handoff_required: true,
        handoff_reason: input.reason,
        service_request_mode: "human_requested",
        queue_mode: resolvedHandoffTarget.assignedAgentId ? "assigned_waiting" : "pending_unavailable",
        queue_position: resolvedHandoffTarget.queuePosition,
        estimated_wait_sec: resolvedHandoffTarget.estimatedWaitSec,
        ai_fallback_allowed: true,
        locked_human_side: true,
        updated_at: trx.fn.now()
      });

    await routingPlanStepService.record(trx, {
      tenantId: input.tenantId,
      planId: input.planId,
      stepType: "ai_runtime",
      status: input.stepStatus,
      payload: input.stepPayload
    });
  });

  if (["assigned", "pending"].includes(resolvedHandoffTarget.status)) {
    await scheduleAssignmentAcceptTimeout(input.tenantId, input.conversationId, input.customerId);
  }

  await emitConversationUpdatedSnapshot(db, input.tenantId, input.conversationId, {
    occurredAt: new Date().toISOString()
  });

  await queueHumanRoutingNotice({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    channelId: input.conversation.channel_id as string,
    channelType: input.channelType,
    handoffTarget: resolvedHandoffTarget
  });
}

async function resolveReservedHumanTarget(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    plannedTarget: {
      assignedAgentId: string | null;
      departmentId: string | null;
      teamId: string | null;
      strategy: "round_robin" | "least_busy" | "sticky";
      priority: number;
    };
  }
): Promise<ReservedHumanTarget> {
  if (input.plannedTarget.assignedAgentId) {
    return {
      departmentId: input.plannedTarget.departmentId,
      teamId: input.plannedTarget.teamId,
      assignedAgentId: input.plannedTarget.assignedAgentId,
      strategy: input.plannedTarget.strategy,
      priority: input.plannedTarget.priority,
      status: "assigned",
      reason: "planned_reserved_agent",
      queuePosition: null,
      estimatedWaitSec: null
    };
  }
  return {
    departmentId: input.plannedTarget.departmentId,
    teamId: input.plannedTarget.teamId,
    assignedAgentId: null,
    strategy: input.plannedTarget.strategy,
    priority: input.plannedTarget.priority,
    status: "pending",
    reason: "planned_fallback_scope_without_reserved_agent",
    queuePosition: null,
    estimatedWaitSec: null
  };
}

async function queueHumanRoutingNotice(input: {
  tenantId: string;
  conversationId: string;
  channelId: string;
  channelType: string;
  handoffTarget: ReservedHumanTarget;
}) {
  const scenario = input.handoffTarget.assignedAgentId ? "human_assigned" : "human_queue";
  const notice = await withTenantTransaction(input.tenantId, async (trx) =>
    routingNoticeService.buildNotice(trx, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      scenario,
      aiAgentName: "AI"
    })
  );

  if (!notice) return;

  await outboundQueue.add(
    "outbound.routing_notice",
    {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      channelId: input.channelId,
      channelType: input.channelType,
      message: {
        text: notice.text,
        aiAgentName: notice.aiAgentName
      }
    },
    { removeOnComplete: 100, removeOnFail: 50 }
  );
}
