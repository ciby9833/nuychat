export type ServiceRequestMode = "normal" | "human_requested" | "ai_opt_in";
export type QueueMode = "none" | "assigned_waiting" | "pending_unavailable";
export type HumanProgress =
  | "none"
  | "assigned_waiting"
  | "queued_waiting"
  | "human_active"
  | "unavailable_fallback_ai";

export type ServiceMode =
  | "normal"
  | "ai_active"
  | "human_assigned"
  | "human_active"
  | "queued_human"
  | "fallback_ai";

export type ServiceModeSnapshot = {
  serviceMode: ServiceMode;
  serviceRequestMode: ServiceRequestMode;
  humanProgress: HumanProgress;
  queueMode: QueueMode;
  assignedAgentId: string | null;
  assignedAiAgentId: string | null;
  queuePosition: number | null;
  estimatedWaitSec: number | null;
  aiFallbackAllowed: boolean;
  lockedHumanSide: boolean;
};

export type ServiceModeChangedEvent = {
  tenantId: string;
  conversationId: string;
  channelId: string;
  channelType: string;
  from: ServiceModeSnapshot | null;
  to: ServiceModeSnapshot;
  aiAgentName: string | null;
  reason: string | null;
  occurredAt: string;
};
