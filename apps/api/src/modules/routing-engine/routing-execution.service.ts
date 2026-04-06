import type { Knex } from "knex";

import { OwnershipService } from "../conversation/ownership.service.js";
import type { OwnershipTransition } from "../conversation/ownership.types.js";
import { QueueAssignmentService } from "../routing/queue-assignment.service.js";
import type { RoutingPlan } from "./types.js";

const queueAssignmentService = new QueueAssignmentService();
const ownershipService = new OwnershipService();

export class RoutingExecutionService {
  async applyInboundPlan(db: Knex | Knex.Transaction, plan: RoutingPlan) {
    const selectedOwnerType = plan.statusPlan.selectedOwnerType;
    await queueAssignmentService.upsertAssignment(db, {
      tenantId: plan.tenantId,
      conversationId: plan.conversationId,
      departmentId: plan.target.departmentId,
      teamId: plan.target.teamId,
      assignedAgentId: selectedOwnerType === "human" ? plan.target.agentId : null,
      // Keep the reserved AI owner on inbound plans so routing/orchestrator
      // and supervisor monitors can still see who is expected to handle it.
      assignedAiAgentId: selectedOwnerType === "ai" ? plan.target.aiAgentId : null,
      strategy: plan.target.strategy,
      priority: plan.target.priority,
      status: plan.statusPlan.queueStatus,
      reason: plan.trace.decision.reason,
      serviceRequestMode: plan.statusPlan.serviceRequestMode,
      queueMode: plan.statusPlan.queueMode,
      queuePosition: plan.statusPlan.queuePosition,
      estimatedWaitSec: plan.statusPlan.estimatedWaitSec,
      aiFallbackAllowed: plan.statusPlan.aiFallbackAllowed,
      lockedHumanSide: plan.statusPlan.lockedHumanSide
    });

    await ownershipService.applyTransition(db, buildInboundOwnershipTransition(plan));
  }
}

function buildInboundOwnershipTransition(plan: RoutingPlan): OwnershipTransition {
  switch (plan.action) {
    case "preserve_existing_owner":
      if (!plan.target.agentId) {
        throw new Error(`Preserve plan missing agent target: ${plan.conversationId}`);
      }
      return {
        type: "preserve_existing_owner",
        tenantId: plan.tenantId,
        conversationId: plan.conversationId,
        caseId: plan.caseId,
        segmentId: plan.segmentId,
        agentId: plan.target.agentId
      };
    case "assign_specific_owner":
    case "enqueue_for_human":
      return {
        type: "assign_human_queue",
        tenantId: plan.tenantId,
        conversationId: plan.conversationId,
        caseId: plan.caseId,
        assignedAgentId: plan.action === "assign_specific_owner" ? plan.target.agentId : null,
        conversationStatus: plan.statusPlan.conversationStatus as any
      };
    case "assign_ai_owner":
      return {
        type: "assign_ai_pending",
        tenantId: plan.tenantId,
        conversationId: plan.conversationId,
        caseId: plan.caseId,
        conversationStatus: plan.statusPlan.conversationStatus as any
      };
    default:
      throw new Error(`Unsupported routing action for conversation ${plan.conversationId}`);
  }
}
