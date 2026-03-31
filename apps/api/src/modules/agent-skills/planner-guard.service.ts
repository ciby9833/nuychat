import type { Knex } from "knex";

import type { CapabilitySuggestionResult, TenantSkillDefinition } from "./contracts.js";

type GuardResult =
  | {
      allowed: true;
      skill: TenantSkillDefinition;
      scriptKey: string;
    }
  | {
      allowed: false;
      reason: string;
      fallbackAction: "clarify" | "handoff" | "defer";
    };

function normalizeScore(value: unknown, fallback: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(1, score));
}

function stringifyArgs(args: Record<string, unknown>) {
  return JSON.stringify(args ?? {});
}

export async function validateCapabilitySuggestions(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    suggestions: CapabilitySuggestionResult;
    availableSkills: TenantSkillDefinition[];
  }
) {
  const valid: Array<{
    skill: TenantSkillDefinition;
    reason: string;
    confidence: number;
  }> = [];

  for (const candidate of input.suggestions.candidates) {
    const skill = input.availableSkills.find((item) => item.slug === candidate.skillSlug);
    if (!skill) continue;
    if (normalizeScore(candidate.confidence, 0) < 0.35) continue;
    if (!skill.scripts.some((item) => item.enabled)) continue;
    const recent = await db("skill_runs")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        capability_id: skill.capabilityId
      })
      .whereIn("status", ["planned", "running", "succeeded"])
      .where("created_at", ">=", db.raw("now() - interval '2 minutes'"))
      .count<{ cnt: string }>("run_id as cnt")
      .first();
    if (Number(recent?.cnt ?? 0) >= 3) continue;
    valid.push({
      skill,
      reason: candidate.reason,
      confidence: candidate.confidence
    });
    if (valid.length >= 5) break;
  }

  return {
    candidates: valid,
    requiresClarification: input.suggestions.requiresClarification,
    clarificationQuestion: input.suggestions.clarificationQuestion
  };
}

export async function validateToolExecutionAgainstCandidates(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    candidateSkills: TenantSkillDefinition[];
    toolName: string;
    args: Record<string, unknown>;
  }
): Promise<GuardResult> {
  const ownerSkill = input.candidateSkills.find((skill) =>
    skill.scripts.some((script) => script.enabled && script.scriptKey === input.toolName)
  );
  if (!ownerSkill) {
    return { allowed: false, reason: "tool_not_in_candidate_scope", fallbackAction: "handoff" };
  }

  const recent = await db("skill_execution_traces as t")
    .join("skill_runs as r", "r.run_id", "t.run_id")
    .where("r.tenant_id", input.tenantId)
    .andWhere("r.conversation_id", input.conversationId)
    .andWhere("r.capability_id", ownerSkill.capabilityId)
    .andWhere("t.phase", "executor")
    .andWhere("t.created_at", ">=", db.raw("now() - interval '2 minutes'"))
    .select("t.payload")
    .orderBy("t.created_at", "desc")
    .limit(5);

  const rawArgs = stringifyArgs(input.args);
  const duplicated = recent.some((row) => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    return stringifyArgs(payload.args as Record<string, unknown>) === rawArgs
      && String(payload.skillName ?? "") === input.toolName;
  });
  if (duplicated) {
    return { allowed: false, reason: "duplicate_execution_guard", fallbackAction: "defer" };
  }

  return { allowed: true, skill: ownerSkill, scriptKey: input.toolName };
}

export async function recordSkillRun(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    capabilityId?: string | null;
    conversationId: string;
    customerId: string;
    caseId?: string | null;
    status: string;
    selectedReason?: string | null;
    confidence?: number;
    plannerTrace?: Record<string, unknown>;
  }
) {
  const [row] = await db("skill_runs")
    .insert({
      tenant_id: input.tenantId,
      capability_id: input.capabilityId ?? null,
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      case_id: input.caseId ?? null,
      status: input.status,
      selected_reason: input.selectedReason ?? null,
      confidence: normalizeScore(input.confidence, 0),
      planner_trace: input.plannerTrace ?? {}
    })
    .returning(["run_id"]);
  return String((row as { run_id: string }).run_id);
}

export async function recordSkillExecutionTrace(
  db: Knex | Knex.Transaction,
  input: {
    runId?: string | null;
    phase: string;
    payload: Record<string, unknown>;
    taskId?: string | null;
  }
) {
  await db("skill_execution_traces").insert({
    run_id: input.runId ?? null,
    task_id: input.taskId ?? null,
    phase: input.phase,
    payload: input.payload
  });
}
