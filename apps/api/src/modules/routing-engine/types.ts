export type RoutingPlanMode = "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";
export type HumanRoutingAssignmentStrategy = "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
export type AIRoutingAssignmentStrategy = "round_robin" | "least_busy" | "sticky";
export type RoutingAssignmentStrategy = HumanRoutingAssignmentStrategy | AIRoutingAssignmentStrategy;
export type RoutingOwnerSide = "ai" | "human";
export type RoutingPlanAction =
  | "preserve_existing_owner"
  | "assign_specific_owner"
  | "enqueue_for_human"
  | "assign_ai_owner";

export type RoutingPlan = {
  planId?: string;
  tenantId: string;
  conversationId: string;
  customerId: string | null;
  caseId: string | null;
  segmentId: string | null;
  parentPlanId?: string | null;
  triggerType:
    | "inbound_message"
    | "reopen"
    | "ai_handoff"
    | "agent_handoff"
    | "manual_assign"
    | "manual_transfer"
    | "supervisor_transfer"
    | "assignment_accept_timeout"
    | "subsequent_response_timeout";
  mode: RoutingPlanMode;
  action: RoutingPlanAction;
  currentOwner: {
    ownerType: "system" | "ai" | "agent";
    ownerId: string | null;
  };
  target: {
    departmentId: string | null;
    teamId: string | null;
    agentId: string | null;
    aiAgentId: string | null;
    aiAgentName: string | null;
    strategy: HumanRoutingAssignmentStrategy;
    priority: number;
  };
  fallback: {
    departmentId: string | null;
    teamId: string | null;
    agentId: string | null;
    strategy: HumanRoutingAssignmentStrategy | null;
    priority: number | null;
  } | null;
  statusPlan: {
    conversationStatus: "open" | "queued" | "bot_active" | "human_active" | "resolved";
    queueStatus: "pending" | "assigned" | "resolved";
    handoffRequired: boolean;
    selectedOwnerType: RoutingOwnerSide;
  };
  trace: {
    issueSummary: {
      lastMessagePreview: string | null;
      latestSummary: string | null;
      lastIntent: string | null;
      lastSentiment: string | null;
      customerTags: string[];
    };
    decision: {
      routingRuleId: string | null;
      routingRuleName: string | null;
      planAction: RoutingPlanAction;
      matchedConditions: Record<string, unknown>;
      selectedOwnerType: RoutingOwnerSide;
      reason: string;
      overrideReason: string | null;
      capacity: {
        humanLoadPct: number | null;
        humanAvailableAgents: number;
        aiLoadPct: number | null;
        aiAvailableAgents: number;
      };
    };
    humanDispatch: {
      routingRuleId: string | null;
      routingRuleName: string | null;
      matchedConditions: Record<string, unknown>;
      reason: string;
      candidates: Array<{
        candidateType: "agent" | "team";
        candidateId: string;
        candidateLabel: string;
        stage: string;
        accepted: boolean;
        rejectReason: string | null;
        details: Record<string, unknown>;
      }>;
    };
    aiSelection: {
      routingRuleId: string | null;
      routingRuleName: string | null;
      matchedConditions: Record<string, unknown>;
      reason: string;
      selectionMode: "rule" | "fallback" | "none";
      strategy: "round_robin" | "least_busy" | "sticky" | null;
      candidates: Array<{
        candidateType: "ai_agent";
        candidateId: string;
        candidateLabel: string;
        stage: string;
        accepted: boolean;
        rejectReason: string | null;
        details: Record<string, unknown>;
      }>;
    };
  };
};

export type RoutingContext = {
  tenantId: string;
  conversationId: string;
  customerId: string;
  caseId: string;
  segmentId: string | null;
  channelType: string;
  channelId: string;
  operatingMode: string;
  customerLanguage: string | null;
  customerTier: string | null;
  issueSummary: {
    caseType: string | null;
    caseStatus: string | null;
    caseTitle: string | null;
    lastMessagePreview: string | null;
    latestSummary: string | null;
    lastIntent: string | null;
    lastSentiment: string | null;
    customerTags: string[];
  };
  conversationStatus: string;
  caseStatus: string;
  currentHandlerType: string | null;
  currentHandlerId: string | null;
  assignedAgentId: string | null;
  preserveHumanOwner: boolean;
  excludedAgentIds?: string[];
  existingAssignment: {
    departmentId: string | null;
    teamId: string | null;
    assignedAgentId: string | null;
    assignmentStrategy: HumanRoutingAssignmentStrategy | null;
    priority: number | null;
    status: string | null;
  } | null;
};
