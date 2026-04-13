/**
 * 作用：提供 planner 阶段的候选能力校验与 skill run 记录，防止无效建议进入执行链。
 * 上游：orchestrator.service.ts、conversation.routes.ts
 * 下游：skill_runs 记录、后续 hydration / execution
 * 协作对象：agent-skills/contracts.ts、skill_runs 表
 * 不负责：不做运行时 tool 准入，不做权限校验，不记录 tool invocation 审计。
 * 变更注意：本层只保留 planner 侧职责；运行时 scope 校验应由 runtime-governance 单层承担。
 */

import type { Knex } from "knex";

import type { CapabilitySuggestionResult, TenantSkillDefinition } from "./contracts.js";

function normalizeScore(value: unknown, fallback: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(1, score));
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
