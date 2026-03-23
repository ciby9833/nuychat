import type { Knex } from "knex";

type Strategy = "round_robin" | "least_busy" | "sticky";
type ExecutionMode = "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";

export async function up(knex: Knex): Promise<void> {
  const rows = await knex("routing_rules").select("rule_id", "actions");

  for (const row of rows) {
    const actions = parseRecord(row.actions);
    const humanTarget = parseRecord(actions.humanTarget);
    const aiTarget = parseRecord(actions.aiTarget);
    const fallbackTarget = parseNullableRecord(actions.fallbackTarget);

    const normalized = {
      ...(parseExecutionMode(actions.executionMode) ? { executionMode: parseExecutionMode(actions.executionMode) } : {}),
      humanTarget: {
        ...(coalesceString(humanTarget.departmentId, actions.targetDepartmentId)
          ? { departmentId: coalesceString(humanTarget.departmentId, actions.targetDepartmentId) }
          : {}),
        ...(coalesceString(humanTarget.departmentCode, actions.targetDepartmentCode)
          ? { departmentCode: coalesceString(humanTarget.departmentCode, actions.targetDepartmentCode) }
          : {}),
        ...(coalesceString(humanTarget.teamId, actions.targetTeamId) ? { teamId: coalesceString(humanTarget.teamId, actions.targetTeamId) } : {}),
        ...(coalesceString(humanTarget.teamCode, actions.targetTeamCode)
          ? { teamCode: coalesceString(humanTarget.teamCode, actions.targetTeamCode) }
          : {}),
        ...(coalesceString(humanTarget.skillGroupCode, actions.targetSkillGroupCode)
          ? { skillGroupCode: coalesceString(humanTarget.skillGroupCode, actions.targetSkillGroupCode) }
          : {}),
        ...(coalesceStrategy(humanTarget.assignmentStrategy, actions.assignmentStrategy)
          ? { assignmentStrategy: coalesceStrategy(humanTarget.assignmentStrategy, actions.assignmentStrategy) }
          : {})
      },
      aiTarget: {
        ...(coalesceString(aiTarget.aiAgentId, actions.aiAgentId) ? { aiAgentId: coalesceString(aiTarget.aiAgentId, actions.aiAgentId) } : {})
      },
      ...(fallbackTarget
        ? {
            fallbackTarget: {
              ...(asString(fallbackTarget.departmentId) ? { departmentId: asString(fallbackTarget.departmentId) } : {}),
              ...(asString(fallbackTarget.teamId) ? { teamId: asString(fallbackTarget.teamId) } : {}),
              ...(asString(fallbackTarget.skillGroupCode) ? { skillGroupCode: asString(fallbackTarget.skillGroupCode) } : {}),
              ...(parseStrategy(fallbackTarget.assignmentStrategy)
                ? { assignmentStrategy: parseStrategy(fallbackTarget.assignmentStrategy) }
                : {})
            }
          }
        : {})
    };

    await knex("routing_rules").where({ rule_id: row.rule_id }).update({
      actions: knex.raw("?::jsonb", [JSON.stringify(normalized)])
    });
  }
}

export async function down(): Promise<void> {
  // Keep structured actions on rollback.
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
  if (value === null || value === undefined || value === "null") return null;
  const parsed = parseRecord(value);
  return Object.keys(parsed).length ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStrategy(value: unknown): Strategy | null {
  if (value === "least_busy" || value === "round_robin" || value === "sticky") return value;
  return null;
}

function parseExecutionMode(value: unknown): ExecutionMode | null {
  if (value === "ai_first" || value === "human_first" || value === "ai_only" || value === "human_only" || value === "hybrid") {
    return value;
  }
  return null;
}

function coalesceString(primary: unknown, legacy: unknown): string | null {
  return asString(primary) ?? asString(legacy);
}

function coalesceStrategy(primary: unknown, legacy: unknown): Strategy | null {
  return parseStrategy(primary) ?? parseStrategy(legacy);
}
