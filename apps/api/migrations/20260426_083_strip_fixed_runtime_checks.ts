import type { Knex } from "knex";

type PolicyRow = {
  policy_id: string;
  pre_reply_policies: unknown;
};

type PolicyRule = {
  requiredChecks?: unknown;
  [key: string]: unknown;
};

type PolicySet = {
  enabled?: unknown;
  rules?: unknown;
};

/**
 * 作用：移除 AI 运行策略里遗留的固定检查项，只保留真实维护的工作流引用。
 * 影响范围：tenant_ai_runtime_policies.pre_reply_policies。
 */
export async function up(knex: Knex): Promise<void> {
  const rows = await knex<PolicyRow>("tenant_ai_runtime_policies").select("policy_id", "pre_reply_policies");

  for (const row of rows) {
    const policy = parsePolicy(row.pre_reply_policies);
    const nextRules = policy.rules
      .map((rule) => normalizeRule(rule))
      .filter((rule): rule is PolicyRule => Boolean(rule));

    await knex("tenant_ai_runtime_policies")
      .where({ policy_id: row.policy_id })
      .update({
        pre_reply_policies: JSON.stringify({
          enabled: policy.enabled,
          rules: nextRules
        }),
        updated_at: knex.fn.now()
      });
  }
}

export async function down(): Promise<void> {
  // No-op: removed fixed checks were intentionally deleted.
}

function parsePolicy(value: unknown): { enabled: boolean; rules: PolicyRule[] } {
  const parsed = asRecord(value);
  return {
    enabled: parsed.enabled === undefined ? true : Boolean(parsed.enabled),
    rules: Array.isArray(parsed.rules) ? (parsed.rules as PolicyRule[]) : []
  };
}

function normalizeRule(value: PolicyRule): PolicyRule | null {
  const requiredChecks = Array.isArray(value.requiredChecks)
    ? value.requiredChecks
        .map((item) => String(item).trim())
        .filter((item) => item.startsWith("workflow:"))
    : [];
  if (requiredChecks.length === 0) return null;
  return {
    ...value,
    requiredChecks
  };
}

function asRecord(value: unknown): PolicySet {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as PolicySet;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as PolicySet;
    } catch {
      return {};
    }
  }
  return {};
}
