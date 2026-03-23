import type { Knex } from "knex";

import { redisConnection } from "../../infra/redis/client.js";

type RuntimeActorType = "ai" | "agent" | "workflow";

type RuntimeBindingInput = {
  tenantId: string;
  moduleId?: string | null;
  skillGroupId?: string | null;
  actorType: RuntimeActorType;
  conversationId?: string;
};

type InstallGovernanceRow = {
  install_id: string;
  skill_id: string;
  manifest: unknown;
  status: string;
  enabled_modules: unknown;
  enabled_skill_groups: unknown;
  enabled_for_ai: boolean;
  enabled_for_agent: boolean;
  rate_limit_per_minute: number;
  ai_whitelisted: boolean;
};

export type RuntimeSkillPolicy = {
  installId: string;
  skillId: string;
  skillName: string;
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
  const installs = await db("marketplace_skill_installs as mi")
    .join("marketplace_skills as s", "s.skill_id", "mi.skill_id")
    .join("marketplace_skill_releases as r", "r.release_id", "mi.release_id")
    .select(
      "mi.install_id",
      "mi.skill_id",
      "r.manifest",
      "mi.status",
      "mi.enabled_modules",
      "mi.enabled_skill_groups",
      "mi.enabled_for_ai",
      "mi.enabled_for_agent",
      "mi.rate_limit_per_minute",
      "mi.ai_whitelisted"
    )
    .where({ "mi.tenant_id": input.tenantId, "mi.status": "active" });

  const policies = new Map<string, RuntimeSkillPolicy>();
  for (const row of installs as InstallGovernanceRow[]) {
    if (!isInstallEnabledForScope(row, input)) continue;
    const skillName = resolveRuntimeSkillName(row);
    if (!skillName) continue;
    policies.set(skillName, {
      installId: row.install_id,
      skillId: row.skill_id,
      skillName,
      rateLimitPerMinute: Math.max(1, Number(row.rate_limit_per_minute ?? 60)),
      aiWhitelisted: Boolean((row as { ai_whitelisted?: unknown }).ai_whitelisted ?? true)
    });
  }

  return policies;
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

  const rateOk = await consumeRateLimit(input.tenantId, policy.installId, policy.rateLimitPerMinute);
  if (!rateOk) {
    return { action: "deny", reason: "rate_limited", detail: `Skill ${input.skillName} exceeded rate limit` };
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
  const policy = input.policyMap?.get(input.skillName);

  await db("skill_invocations").insert({
    tenant_id: input.tenantId,
    conversation_id: input.conversationId ?? null,
    install_id: policy?.installId ?? null,
    skill_id: policy?.skillId ?? null,
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

function isInstallEnabledForScope(row: InstallGovernanceRow, input: RuntimeBindingInput): boolean {
  if (row.status !== "active") return false;
  if (input.actorType === "ai" && !row.enabled_for_ai) return false;
  if (input.actorType === "agent" && !row.enabled_for_agent) return false;

  const enabledModules = parseStringArray(row.enabled_modules);
  if (enabledModules.length > 0) {
    if (!input.moduleId || !enabledModules.includes(input.moduleId)) return false;
  }

  const enabledSkillGroups = parseStringArray(row.enabled_skill_groups);
  if (enabledSkillGroups.length > 0) {
    if (!input.skillGroupId || !enabledSkillGroups.includes(input.skillGroupId)) return false;
  }

  return true;
}

function resolveRuntimeSkillName(row: InstallGovernanceRow): string | null {
  const rawManifest = parseManifest(row.manifest);
  const toolName = typeof rawManifest.toolName === "string" ? rawManifest.toolName.trim() : "";
  if (!toolName) return null;
  return toolName;
}

function parseManifest(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

async function consumeRateLimit(tenantId: string, installId: string, limitPerMinute: number): Promise<boolean> {
  if (limitPerMinute <= 0) return false;
  const window = Math.floor(Date.now() / 60000);
  const key = `skill-rate:${tenantId}:${installId}:${window}`;
  try {
    const count = await redisConnection.incr(key);
    if (count === 1) {
      await redisConnection.expire(key, 120);
    }
    return count <= limitPerMinute;
  } catch {
    // Fail-open in local development if redis is unavailable.
    return true;
  }
}
