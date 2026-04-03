import type { Knex } from "knex";

type RoutingMode = "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";
type HumanStrategy = "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
type AIStrategy = "round_robin" | "least_busy" | "sticky";

export async function up(knex: Knex): Promise<void> {
  const rows = await knex("routing_rules").select("rule_id", "actions");

  for (const row of rows) {
    const actions = parseRecord(row.actions);
    const humanTarget = parseRecord(actions.humanTarget);
    const serviceTarget = parseRecord(actions.serviceTarget);
    const aiTarget = parseRecord(actions.aiTarget);

    const nextActions = {
      ...(parseExecutionMode(actions.executionMode) ? { executionMode: normalizeExecutionMode(parseExecutionMode(actions.executionMode)!) } : {}),
      serviceTarget: {
        ...(coalesceString(serviceTarget.departmentId, humanTarget.departmentId, actions.targetDepartmentId)
          ? { departmentId: coalesceString(serviceTarget.departmentId, humanTarget.departmentId, actions.targetDepartmentId) }
          : {}),
        ...(coalesceString(serviceTarget.departmentCode, humanTarget.departmentCode, actions.targetDepartmentCode)
          ? { departmentCode: coalesceString(serviceTarget.departmentCode, humanTarget.departmentCode, actions.targetDepartmentCode) }
          : {}),
        ...(coalesceString(serviceTarget.teamId, humanTarget.teamId, actions.targetTeamId)
          ? { teamId: coalesceString(serviceTarget.teamId, humanTarget.teamId, actions.targetTeamId) }
          : {}),
        ...(coalesceString(serviceTarget.teamCode, humanTarget.teamCode, actions.targetTeamCode)
          ? { teamCode: coalesceString(serviceTarget.teamCode, humanTarget.teamCode, actions.targetTeamCode) }
          : {}),
      },
      ...(coalesceHumanStrategy(actions.humanStrategy, humanTarget.assignmentStrategy, actions.assignmentStrategy)
        ? { humanStrategy: coalesceHumanStrategy(actions.humanStrategy, humanTarget.assignmentStrategy, actions.assignmentStrategy) }
        : {}),
      ...(coalesceAIStrategy(actions.aiStrategy, aiTarget.assignmentStrategy)
        ? { aiStrategy: coalesceAIStrategy(actions.aiStrategy, aiTarget.assignmentStrategy) }
        : {})
    };

    await knex("routing_rules").where({ rule_id: row.rule_id }).update({
      actions: knex.raw("?::jsonb", [JSON.stringify(nextActions)])
    });
  }
}

export async function down(): Promise<void> {
  // Phase 1 rule format intentionally does not restore the removed expert fields.
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

function parseExecutionMode(value: unknown): RoutingMode | null {
  if (value === "ai_first" || value === "human_first" || value === "ai_only" || value === "human_only" || value === "hybrid") {
    return value;
  }
  return null;
}

function normalizeExecutionMode(value: RoutingMode): RoutingMode {
  if (value === "ai_only") return "ai_first";
  if (value === "human_only") return "human_first";
  return value;
}

function parseHumanStrategy(value: unknown): HumanStrategy | null {
  if (value === "least_busy" || value === "balanced_new_case" || value === "sticky" || value === "round_robin") return value;
  return null;
}

function parseAIStrategy(value: unknown): AIStrategy | null {
  if (value === "least_busy" || value === "sticky" || value === "round_robin") return value;
  return null;
}

function coalesceString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) return parsed;
  }
  return null;
}

function coalesceHumanStrategy(...values: unknown[]): HumanStrategy | null {
  for (const value of values) {
    const parsed = parseHumanStrategy(value);
    if (parsed) return parsed;
  }
  return null;
}

function coalesceAIStrategy(...values: unknown[]): AIStrategy | null {
  for (const value of values) {
    const parsed = parseAIStrategy(value);
    if (parsed) return parsed;
  }
  return null;
}
