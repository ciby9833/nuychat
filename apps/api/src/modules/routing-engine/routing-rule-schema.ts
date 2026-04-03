import type { AIRoutingAssignmentStrategy, HumanRoutingAssignmentStrategy, RoutingPlanMode } from "./types.js";

export type NormalizedRoutingRuleActions = {
  executionMode: RoutingPlanMode | null;
  serviceTarget: {
    departmentId: string | null;
    departmentCode: string | null;
    teamId: string | null;
    teamCode: string | null;
    skillGroupCode: string | null;
  };
  humanStrategy: HumanRoutingAssignmentStrategy | null;
  aiStrategy: AIRoutingAssignmentStrategy | null;
};

export function normalizeRoutingRuleActions(value: unknown): NormalizedRoutingRuleActions {
  const actions = parseRecord(value);
  const serviceTargetRaw = parseRecord(actions.serviceTarget);

  return {
    executionMode: parseExecutionMode(actions.executionMode),
    serviceTarget: {
      departmentId: asString(serviceTargetRaw.departmentId),
      departmentCode: asString(serviceTargetRaw.departmentCode),
      teamId: asString(serviceTargetRaw.teamId),
      teamCode: asString(serviceTargetRaw.teamCode),
      skillGroupCode: asString(serviceTargetRaw.skillGroupCode)
    },
    humanStrategy: parseHumanAssignmentStrategy(actions.humanStrategy),
    aiStrategy: parseAIAssignmentStrategy(actions.aiStrategy)
  };
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseExecutionMode(value: unknown): NormalizedRoutingRuleActions["executionMode"] {
  if (value === "ai_first" || value === "human_first" || value === "ai_only" || value === "human_only" || value === "hybrid") {
    return value;
  }
  return null;
}

function parseHumanAssignmentStrategy(value: unknown): HumanRoutingAssignmentStrategy | null {
  if (value === "least_busy" || value === "balanced_new_case" || value === "sticky" || value === "round_robin") return value;
  return null;
}

function parseAIAssignmentStrategy(value: unknown): AIRoutingAssignmentStrategy | null {
  if (value === "least_busy" || value === "sticky" || value === "round_robin") return value;
  return null;
}
