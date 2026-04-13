import type { RoutingContext, RoutingPlan } from "../routing-engine/types.js";
import { serviceModeEventBus } from "./service-mode.events.js";
import type {
  HumanProgress,
  QueueMode,
  ServiceMode,
  ServiceModeChangedEvent,
  ServiceModeSnapshot,
  ServiceRequestMode
} from "./service-mode.types.js";

type QueueAssignmentState = RoutingContext["existingAssignment"];

type HumanQueueTarget = {
  assignedAgentId: string | null;
  queuePosition: number | null;
  estimatedWaitSec: number | null;
  aiFallbackAllowed: boolean;
};

export class ServiceModeEngine {
  snapshotFromExistingAssignment(assignment: QueueAssignmentState): ServiceModeSnapshot | null {
    if (!assignment) return null;
    return buildSnapshot({
      serviceRequestMode: assignment.serviceRequestMode,
      humanProgress: assignment.humanProgress,
      queueMode: assignment.queueMode,
      assignedAgentId: assignment.assignedAgentId,
      assignedAiAgentId: null,
      queuePosition: assignment.queuePosition,
      estimatedWaitSec: assignment.estimatedWaitSec,
      aiFallbackAllowed: assignment.aiFallbackAllowed,
      lockedHumanSide: assignment.lockedHumanSide
    });
  }

  snapshotFromRoutingPlan(plan: RoutingPlan): ServiceModeSnapshot {
    return buildSnapshot({
      serviceRequestMode: plan.statusPlan.serviceRequestMode,
      humanProgress: plan.statusPlan.humanProgress,
      queueMode: plan.statusPlan.queueMode,
      assignedAgentId: plan.statusPlan.selectedOwnerType === "human" ? plan.target.agentId : null,
      assignedAiAgentId: plan.statusPlan.selectedOwnerType === "ai" ? plan.target.aiAgentId : null,
      queuePosition: plan.statusPlan.queuePosition,
      estimatedWaitSec: plan.statusPlan.estimatedWaitSec,
      aiFallbackAllowed: plan.statusPlan.aiFallbackAllowed,
      lockedHumanSide: plan.statusPlan.lockedHumanSide
    });
  }

  snapshotFromHumanQueueTarget(input: HumanQueueTarget): ServiceModeSnapshot {
    return buildSnapshot({
      serviceRequestMode: "human_requested",
      humanProgress: input.assignedAgentId ? "assigned_waiting" : "queued_waiting",
      queueMode: input.assignedAgentId ? "assigned_waiting" : "pending_unavailable",
      assignedAgentId: input.assignedAgentId,
      assignedAiAgentId: null,
      queuePosition: input.queuePosition,
      estimatedWaitSec: input.estimatedWaitSec,
      aiFallbackAllowed: input.aiFallbackAllowed,
      lockedHumanSide: true
    });
  }

  publishTransition(input: Omit<ServiceModeChangedEvent, "occurredAt">) {
    if (!hasMeaningfulTransition(input.from, input.to)) return;
    serviceModeEventBus.emitEvent("service_mode.changed", {
      ...input,
      occurredAt: new Date().toISOString()
    });
  }
}

function buildSnapshot(input: {
  serviceRequestMode: ServiceRequestMode;
  humanProgress: HumanProgress;
  queueMode: QueueMode;
  assignedAgentId: string | null;
  assignedAiAgentId: string | null;
  queuePosition: number | null;
  estimatedWaitSec: number | null;
  aiFallbackAllowed: boolean;
  lockedHumanSide: boolean;
}): ServiceModeSnapshot {
  return {
    serviceMode: deriveServiceMode(input),
    serviceRequestMode: input.serviceRequestMode,
    humanProgress: input.humanProgress,
    queueMode: input.queueMode,
    assignedAgentId: input.assignedAgentId,
    assignedAiAgentId: input.assignedAiAgentId,
    queuePosition: input.queuePosition,
    estimatedWaitSec: input.estimatedWaitSec,
    aiFallbackAllowed: input.aiFallbackAllowed,
    lockedHumanSide: input.lockedHumanSide
  };
}

function deriveServiceMode(input: {
  serviceRequestMode: ServiceRequestMode;
  humanProgress: HumanProgress;
  queueMode: QueueMode;
  assignedAgentId: string | null;
  assignedAiAgentId: string | null;
  aiFallbackAllowed: boolean;
}): ServiceMode {
  if (input.serviceRequestMode === "human_requested") {
    if (input.humanProgress === "human_active") return "human_active";
    if (input.assignedAgentId) return "human_assigned";
    if (input.assignedAiAgentId || input.aiFallbackAllowed) return "fallback_ai";
    return "queued_human";
  }
  if (input.assignedAiAgentId) return "ai_active";
  return "normal";
}

function hasMeaningfulTransition(from: ServiceModeSnapshot | null, to: ServiceModeSnapshot) {
  if (!from) return true;
  return (
    from.serviceMode !== to.serviceMode ||
    from.serviceRequestMode !== to.serviceRequestMode ||
    from.humanProgress !== to.humanProgress ||
    from.queueMode !== to.queueMode ||
    from.assignedAgentId !== to.assignedAgentId ||
    from.assignedAiAgentId !== to.assignedAiAgentId ||
    from.queuePosition !== to.queuePosition ||
    from.estimatedWaitSec !== to.estimatedWaitSec ||
    from.aiFallbackAllowed !== to.aiFallbackAllowed ||
    from.lockedHumanSide !== to.lockedHumanSide
  );
}
