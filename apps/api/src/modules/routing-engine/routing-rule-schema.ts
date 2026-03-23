export type NormalizedRoutingRuleActions = {
  executionMode: "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid" | null;
  humanTarget: {
    departmentId: string | null;
    departmentCode: string | null;
    teamId: string | null;
    teamCode: string | null;
    skillGroupCode: string | null;
    assignmentStrategy: "round_robin" | "least_busy" | "balanced_new_case" | "sticky" | null;
  };
  aiTarget: {
    aiAgentId: string | null;
    assignmentStrategy: "round_robin" | "least_busy" | "sticky" | null;
  };
  overflowPolicy: {
    humanToAiThresholdPct: number | null;
    aiToHumanThresholdPct: number | null;
    aiSoftConcurrencyLimit: number | null;
  };
  hybridPolicy: {
    strategy: "load_balanced" | "prefer_human" | "prefer_ai" | null;
  };
  overrides: {
    customerRequestsHuman: "force_human" | "allow_policy" | null;
    humanRequestKeywords: string[];
    aiUnhandled: "force_human" | "queue_human" | "allow_policy" | null;
  };
  fallbackTarget: {
    departmentId: string | null;
    teamId: string | null;
    skillGroupCode: string | null;
    assignmentStrategy: "round_robin" | "least_busy" | "balanced_new_case" | "sticky" | null;
  } | null;
};

export function normalizeRoutingRuleActions(value: unknown): NormalizedRoutingRuleActions {
  const actions = parseRecord(value);
  const humanTargetRaw = parseRecord(actions.humanTarget);
  const aiTargetRaw = parseRecord(actions.aiTarget);
  const fallbackRaw = parseNullableRecord(actions.fallbackTarget);

  const executionMode = parseExecutionMode(actions.executionMode);

  const humanTarget = {
    departmentId: asString(humanTargetRaw.departmentId),
    departmentCode: asString(humanTargetRaw.departmentCode),
    teamId: asString(humanTargetRaw.teamId),
    teamCode: asString(humanTargetRaw.teamCode),
    skillGroupCode: asString(humanTargetRaw.skillGroupCode),
    assignmentStrategy: parseHumanAssignmentStrategy(humanTargetRaw.assignmentStrategy)
  };

  const aiTarget = {
    aiAgentId: asString(aiTargetRaw.aiAgentId),
    assignmentStrategy: parseAIAssignmentStrategy(aiTargetRaw.assignmentStrategy)
  };
  const overflowRaw = parseRecord(actions.overflowPolicy);
  const hybridRaw = parseRecord(actions.hybridPolicy);
  const overridesRaw = parseRecord(actions.overrides);

  const fallbackTarget = fallbackRaw
    ? {
        departmentId: asString(fallbackRaw.departmentId),
        teamId: asString(fallbackRaw.teamId),
        skillGroupCode: asString(fallbackRaw.skillGroupCode),
        assignmentStrategy: parseHumanAssignmentStrategy(fallbackRaw.assignmentStrategy)
      }
    : null;

  return {
    executionMode,
    humanTarget,
    aiTarget,
    overflowPolicy: {
      humanToAiThresholdPct: parsePercent(overflowRaw.humanToAiThresholdPct),
      aiToHumanThresholdPct: parsePercent(overflowRaw.aiToHumanThresholdPct),
      aiSoftConcurrencyLimit: parsePositiveInteger(overflowRaw.aiSoftConcurrencyLimit)
    },
    hybridPolicy: {
      strategy: parseHybridStrategy(hybridRaw.strategy)
    },
    overrides: {
      customerRequestsHuman: parseOverrideBehavior(overridesRaw.customerRequestsHuman),
      humanRequestKeywords: parseStringArray(overridesRaw.humanRequestKeywords),
      aiUnhandled: parseAiUnhandledBehavior(overridesRaw.aiUnhandled)
    },
    fallbackTarget
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

function parseNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (value === "null") return null;
  const parsed = parseRecord(value);
  return Object.keys(parsed).length ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseHumanAssignmentStrategy(value: unknown): "round_robin" | "least_busy" | "balanced_new_case" | "sticky" | null {
  if (value === "least_busy" || value === "balanced_new_case" || value === "sticky" || value === "round_robin") return value;
  return null;
}

function parseAIAssignmentStrategy(value: unknown): "round_robin" | "least_busy" | "sticky" | null {
  if (value === "least_busy" || value === "sticky" || value === "round_robin") return value;
  return null;
}

function parseExecutionMode(value: unknown): NormalizedRoutingRuleActions["executionMode"] {
  if (value === "ai_first" || value === "human_first" || value === "ai_only" || value === "human_only" || value === "hybrid") {
    return value;
  }
  return null;
}

function parsePercent(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value < 0 || value > 100) return null;
  return Math.round(value);
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value <= 0) return null;
  return Math.round(value);
}

function parseHybridStrategy(value: unknown): NormalizedRoutingRuleActions["hybridPolicy"]["strategy"] {
  if (value === "load_balanced" || value === "prefer_human" || value === "prefer_ai") return value;
  return null;
}

function parseOverrideBehavior(value: unknown): NormalizedRoutingRuleActions["overrides"]["customerRequestsHuman"] {
  if (value === "force_human" || value === "allow_policy") return value;
  return null;
}

function parseAiUnhandledBehavior(value: unknown): NormalizedRoutingRuleActions["overrides"]["aiUnhandled"] {
  if (value === "force_human" || value === "queue_human" || value === "allow_policy") return value;
  return null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
