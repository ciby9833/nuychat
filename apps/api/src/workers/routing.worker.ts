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
import { scheduleAssignmentAcceptTimeout } from "../modules/sla/conversation-sla.service.js";

const orchestrator = new OrchestratorService();
const ownershipService = new OwnershipService();
const dispatchAuditService = new DispatchAuditService();
const routingPlanRepository = new RoutingPlanRepository();
const routingPlanStepService = new RoutingPlanStepService();

export function createRoutingWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<RoutingJobPayload>(
    routingQueue.name,
    async (job) => {
      const { tenantId, planId, conversationId, customerId, channelType } = job.data;
      const plan = await routingPlanRepository.getById(db, tenantId, planId);
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

      const conversation = await db("conversations")
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
        .first();

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
            aiAgentName: plan.target.aiAgentName,
            moduleId: plan.target.moduleId,
            skillGroupId: plan.target.skillGroupId
          }
        });
      });

      const preferences = await db("conversation_skill_preferences")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("preferred_skills")
        .first<{ preferred_skills: unknown }>();

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
              moduleId: plan.fallback?.moduleId ?? plan.target.moduleId,
              skillGroupId: plan.fallback?.skillGroupId ?? plan.target.skillGroupId,
              departmentId: plan.fallback?.departmentId ?? plan.target.departmentId,
              teamId: plan.fallback?.teamId ?? plan.target.teamId,
              strategy: plan.fallback?.strategy ?? plan.target.strategy,
              priority: plan.fallback?.priority ?? plan.target.priority
            }
          })
        );

        await withTenantTransaction(tenantId, async (trx) => {
          const fromSegmentId = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("current_segment_id")
            .first<{ current_segment_id: string | null } | undefined>();
          await ownershipService.applyTransition(trx, {
            type: "release_to_queue",
            tenantId,
            conversationId,
            customerId: conversation.customer_id as string,
            caseId: conversation.current_case_id as string | null,
            reason: "no-active-ai-agent",
            assignedAgentId: handoffTarget.assignedAgentId,
            conversationStatus: "queued"
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
            transitionType: "ai_unavailable_to_system",
            actorType: "system",
            fromOwnerType: (conversation.current_handler_type as string | null) ?? null,
            fromOwnerId: (conversation.current_handler_id as string | null) ?? null,
            fromSegmentId: fromSegmentId?.current_segment_id ?? null,
            toOwnerType: "system",
            toOwnerId: null,
            toSegmentId: updatedConversation?.current_segment_id ?? null,
            reason: plan.trace.aiSelection.reason || "no-active-ai-agent"
          });

          await trx("queue_assignments")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .update({
              module_id: handoffTarget.moduleId,
              skill_group_id: handoffTarget.skillGroupId,
              department_id: handoffTarget.departmentId,
              team_id: handoffTarget.teamId,
              assigned_agent_id: handoffTarget.assignedAgentId,
              assigned_ai_agent_id: null,
              assignment_strategy: handoffTarget.strategy,
              priority: handoffTarget.priority,
              status: handoffTarget.status,
              assignment_reason: handoffTarget.reason,
              handoff_required: true,
              handoff_reason: plan.trace.aiSelection.reason || "no_active_ai_agent",
              updated_at: trx.fn.now()
            });

          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "failed",
            payload: {
              reason: plan.trace.aiSelection.reason || "no_active_ai_agent",
              queueStatus: handoffTarget.status,
              assignedAgentId: handoffTarget.assignedAgentId
            }
          });
        });

        if (["assigned", "pending"].includes(handoffTarget.status)) {
          await scheduleAssignmentAcceptTimeout(tenantId, conversationId, customerId);
        }

        await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
          occurredAt: new Date().toISOString()
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
        result = await orchestrator.run(db, {
          tenantId,
          conversationId,
          customerId,
          channelType,
          moduleId: plan.target.moduleId,
          skillGroupId: plan.target.skillGroupId,
          actorType: "ai",
          preferredSkillNames: parsePreferredSkills(preferences?.preferred_skills),
          aiAgentId: plan.target.aiAgentId
        });
      } catch (err) {
        orchestratorError = (err as Error).message ?? "unknown_error";
        result = {
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
      await db("ai_traces").insert({
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
        handoff_reason: result.handoffReason ?? null,
        error: orchestratorError
      });

      // ── 5. Act on result ─────────────────────────────────────────────────────
      if (result.response) {
        // AI produced a reply → send it
        await outboundQueue.add(
          "outbound.ai_reply",
          {
            tenantId,
            conversationId,
            channelId: conversation.channel_id,
            channelType,
            message: { text: result.response, aiAgentName: plan.target.aiAgentName ?? undefined }
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
            aiAgentId: plan.target.aiAgentId,
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
      } else if (result.shouldHandoff) {
        const handoffTarget = await withTenantTransaction(tenantId, async (trx) =>
          resolveReservedHumanTarget(trx, {
            tenantId,
            plannedTarget: {
              assignedAgentId: plan.fallback?.agentId ?? null,
              moduleId: plan.fallback?.moduleId ?? plan.target.moduleId,
              skillGroupId: plan.fallback?.skillGroupId ?? plan.target.skillGroupId,
              departmentId: plan.fallback?.departmentId ?? plan.target.departmentId,
              teamId: plan.fallback?.teamId ?? plan.target.teamId,
              strategy: plan.fallback?.strategy ?? plan.target.strategy,
              priority: plan.fallback?.priority ?? plan.target.priority
            }
          })
        );

        await withTenantTransaction(tenantId, async (trx) => {
          const fromSegmentId = await trx("conversations")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .select("current_segment_id")
            .first<{ current_segment_id: string | null } | undefined>();
          await ownershipService.applyTransition(trx, {
            type: "release_to_queue",
            tenantId,
            conversationId,
            customerId: conversation.customer_id as string,
            caseId: conversation.current_case_id as string | null,
            reason: result.handoffReason ?? "ai-requested-handoff",
            assignedAgentId: handoffTarget.assignedAgentId,
            conversationStatus: "queued"
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
            transitionType: "ai_handoff_to_human_queue",
            actorType: "ai",
            actorId: plan.target.aiAgentId,
            fromOwnerType: (conversation.current_handler_type as string | null) ?? null,
            fromOwnerId: (conversation.current_handler_id as string | null) ?? null,
            fromSegmentId: fromSegmentId?.current_segment_id ?? null,
            toOwnerType: "system",
            toOwnerId: null,
            toSegmentId: updatedConversation?.current_segment_id ?? null,
            reason: result.handoffReason ?? "ai-requested-handoff"
          });

          await trx("queue_assignments")
            .where({ tenant_id: tenantId, conversation_id: conversationId })
            .update({
              module_id: handoffTarget.moduleId,
              skill_group_id: handoffTarget.skillGroupId,
              department_id: handoffTarget.departmentId,
              team_id: handoffTarget.teamId,
              assigned_agent_id: handoffTarget.assignedAgentId,
              assigned_ai_agent_id: plan.target.aiAgentId,
              assignment_strategy: handoffTarget.strategy,
              priority: handoffTarget.priority,
              status: handoffTarget.status,
              assignment_reason: handoffTarget.reason,
              handoff_required: true,
              handoff_reason: result.handoffReason ?? "ai_requested_handoff",
              updated_at: trx.fn.now()
            });

          await routingPlanStepService.record(trx, {
            tenantId,
            planId,
            stepType: "ai_runtime",
            status: "completed",
            payload: {
              outcome: "handoff",
              aiAgentId: plan.target.aiAgentId,
              handoff: true,
              queueStatus: handoffTarget.status,
              assignedAgentId: handoffTarget.assignedAgentId,
              handoffReason: result.handoffReason ?? "ai_requested_handoff",
              confidence: result.confidence
            }
          });
        });

        if (["assigned", "pending"].includes(handoffTarget.status)) {
          await scheduleAssignmentAcceptTimeout(tenantId, conversationId, customerId);
        }

        await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
          occurredAt: new Date().toISOString()
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
        handoff: result.shouldHandoff
      };
    },
    {
      connection: workerConnection,
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
  moduleId: string | null;
  skillGroupId: string | null;
  departmentId: string | null;
  teamId: string | null;
  assignedAgentId: string | null;
  strategy: "round_robin" | "least_busy" | "sticky";
  priority: number;
  status: "pending" | "assigned";
  reason: string;
};

async function resolveReservedHumanTarget(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    plannedTarget: {
      assignedAgentId: string | null;
      moduleId: string | null;
      skillGroupId: string | null;
      departmentId: string | null;
      teamId: string | null;
      strategy: "round_robin" | "least_busy" | "sticky";
      priority: number;
    };
  }
): Promise<ReservedHumanTarget> {
  if (input.plannedTarget.assignedAgentId) {
    return {
      moduleId: input.plannedTarget.moduleId,
      skillGroupId: input.plannedTarget.skillGroupId,
      departmentId: input.plannedTarget.departmentId,
      teamId: input.plannedTarget.teamId,
      assignedAgentId: input.plannedTarget.assignedAgentId,
      strategy: input.plannedTarget.strategy,
      priority: input.plannedTarget.priority,
      status: "assigned",
      reason: "planned_reserved_agent"
    };
  }
  return {
    moduleId: input.plannedTarget.moduleId,
    skillGroupId: input.plannedTarget.skillGroupId,
    departmentId: input.plannedTarget.departmentId,
    teamId: input.plannedTarget.teamId,
    assignedAgentId: null,
    strategy: input.plannedTarget.strategy,
    priority: input.plannedTarget.priority,
    status: "pending",
    reason: "planned_fallback_scope_without_reserved_agent"
  };
}
