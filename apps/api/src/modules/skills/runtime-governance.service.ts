/**
 * 作用：提供运行时技能执行治理，包括作用域内 policy 装载、执行准入判断与调用审计。
 * 上游：orchestrator.service.ts、conversation.routes.ts
 * 下游：tool execution gate、skill_invocations 审计日志
 * 协作对象：agent-skills/skill-definition.service.ts、agent-skills/contracts.ts
 * 不负责：不做 capability 规划，不做 LLM prompt 注入，不承担 planner 侧候选过滤。
 * 变更注意：运行时 gate 只保留一层准入职责；若已按 hydrated skills 收缩 policy，不要再叠加重复 scope guard。
 */

import type { Knex } from "knex";

import { listTenantSkillsForPlanning } from "../agent-skills/skill-definition.service.js";
import type { TenantSkillDefinition } from "../agent-skills/contracts.js";

type RuntimeActorType = "ai" | "agent" | "workflow";

type RuntimeBindingInput = {
  tenantId: string;
  capabilityScope?: string | null;
  actorType: RuntimeActorType;
  conversationId?: string;
};

export type RuntimeSkillPolicy = {
  capabilityId: string;
  scriptKey: string;
  rateLimitPerMinute: number;
  aiWhitelisted: boolean;
};

export type SkillExecutionGateResult =
  | { action: "allow" }
  | { action: "deny"; reason: "not_installed" | "permission_denied" | "rate_limited"; detail: string };

export async function getBoundRuntimePolicies(
  db: Knex | Knex.Transaction,
  input: RuntimeBindingInput
): Promise<Map<string, RuntimeSkillPolicy>> {
  const channelType = input.conversationId
    ? await db("conversations")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .select("channel_type")
      .first<{ channel_type: string | null }>()
      .then((row) => row?.channel_type ?? null)
    : null;
  const tenantSkills = await listTenantSkillsForPlanning(db, {
    tenantId: input.tenantId,
    channelType: channelType ?? "",
    actorRole: input.actorType,
    capabilityScope: input.capabilityScope ?? null,
    ownerMode: input.actorType
  });

  const policies = new Map<string, RuntimeSkillPolicy>();
  for (const skill of tenantSkills) {
    const skillPolicy = parseObject(skill.policyConfig);
    for (const script of skill.scripts) {
      if (!script.enabled || !script.scriptKey.trim()) continue;
      policies.set(script.scriptKey, {
        capabilityId: skill.capabilityId,
        scriptKey: script.scriptKey,
        rateLimitPerMinute: resolveRateLimit(skillPolicy.rateLimitPerMinute),
        aiWhitelisted: Boolean(skillPolicy.aiWhitelisted ?? true)
      });
    }
  }

  return policies;
}

export function filterRuntimePoliciesForSkills(
  policyMap: Map<string, RuntimeSkillPolicy>,
  skills: TenantSkillDefinition[]
): Map<string, RuntimeSkillPolicy> {
  if (skills.length === 0) return new Map();

  const allowedScriptKeys = new Set(
    skills.flatMap((skill) =>
      skill.scripts
        .filter((script) => script.enabled)
        .map((script) => script.scriptKey)
    )
  );

  return new Map(
    [...policyMap.entries()].filter(([scriptKey]) => allowedScriptKeys.has(scriptKey))
  );
}

export async function evaluateSkillExecutionGate(
  db: Knex | Knex.Transaction,
  input: RuntimeBindingInput & {
    policyMap: Map<string, RuntimeSkillPolicy>;
    skillName: string;
    args: Record<string, unknown>;
    requesterId?: string | null;
  }
): Promise<SkillExecutionGateResult> {
  const policy = input.policyMap.get(input.skillName);
  if (!policy) {
    return { action: "deny", reason: "not_installed", detail: `Skill ${input.skillName} is not installed for current scope` };
  }

  if (input.actorType === "ai" && !policy.aiWhitelisted) {
    return { action: "deny", reason: "permission_denied", detail: `Skill ${input.skillName} is not in AI whitelist` };
  }

  return { action: "allow" };
}

export async function recordSkillInvocation(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId?: string | null;
    skillName: string;
    actorType: RuntimeActorType;
    args?: Record<string, unknown>;
    decision: "allowed" | "blocked" | "error";
    denyReason?: string | null;
    durationMs?: number | null;
    result?: Record<string, unknown>;
    policyMap?: Map<string, RuntimeSkillPolicy>;
  }
) {
  await db("skill_invocations").insert({
    tenant_id: input.tenantId,
    conversation_id: input.conversationId ?? null,
    install_id: null,
    // Legacy trace table still points to old tenant_skills.
    // Keep runtime audit, but stop writing capability ids into the old FK column.
    skill_id: null,
    skill_name: input.skillName,
    actor_type: input.actorType,
    decision: input.decision,
    deny_reason: input.denyReason ?? null,
    duration_ms: input.durationMs ?? null,
    args: input.args ?? {},
    result: input.result ?? {},
    invoked_at: new Date()
  });
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function resolveRateLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(1, Math.round(parsed));
}
