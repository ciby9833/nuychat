import type { Knex } from "knex";

type ProviderName = "openai" | "anthropic" | "gemini" | "ollama";
export type FeatureName =
  | "orchestrator"
  | "copilot"
  | "embedding"
  | "customer_analysis"
  | "skill_planner"
  | "closure_evaluator"
  | "skill_execution"
  | "memory_encoder"
  | "routing_notice";

type PriceCard = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const PRICE_BOOK: Array<{ provider: ProviderName; match: RegExp; price: PriceCard }> = [
  { provider: "openai", match: /^gpt-4o-mini/i, price: { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 } },
  { provider: "openai", match: /^gpt-4\.1-mini/i, price: { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.6 } },
  { provider: "anthropic", match: /^claude-3-5-haiku/i, price: { inputPerMillionUsd: 0.8, outputPerMillionUsd: 4 } },
  { provider: "anthropic", match: /^claude-3-7-sonnet/i, price: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 } },
  { provider: "gemini", match: /^gemini-2\.0-flash/i, price: { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 } },
  { provider: "gemini", match: /^gemini-1\.5-flash/i, price: { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 } },
  { provider: "ollama", match: /.*/, price: { inputPerMillionUsd: 0, outputPerMillionUsd: 0 } }
];

export type TenantAIBudgetPolicy = {
  tenantId: string;
  includedTokens: number;
  monthlyBudgetUsd: number | null;
  softLimitUsd: number | null;
  hardLimitUsd: number | null;
  enforcementMode: "notify" | "throttle" | "block";
  isActive: boolean;
};

export function estimateAIUsageCost(input: {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): { estimatedCostUsd: number; rateCard: PriceCard } {
  const matched = PRICE_BOOK.find((item) => item.provider === input.provider && item.match.test(input.model))
    ?? { provider: input.provider, match: /.*/, price: { inputPerMillionUsd: 0, outputPerMillionUsd: 0 } };

  const estimatedCostUsd =
    (Math.max(0, input.inputTokens) / 1_000_000) * matched.price.inputPerMillionUsd +
    (Math.max(0, input.outputTokens) / 1_000_000) * matched.price.outputPerMillionUsd;

  return {
    estimatedCostUsd: roundMoney(estimatedCostUsd),
    rateCard: matched.price
  };
}

export function estimateEmbeddingTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export async function recordAIUsage(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    provider: ProviderName;
    model: string;
    feature: FeatureName;
    inputTokens: number;
    outputTokens: number;
    requestCount?: number;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }
): Promise<void> {
  const totalTokens = Math.max(0, input.inputTokens) + Math.max(0, input.outputTokens);
  const pricing = estimateAIUsageCost(input);
  const occurredAt = input.occurredAt ?? new Date();

  await db("ai_usage_ledger").insert({
    tenant_id: input.tenantId,
    provider: input.provider,
    model: input.model,
    feature: input.feature,
    request_count: Math.max(1, input.requestCount ?? 1),
    input_tokens: Math.max(0, input.inputTokens),
    output_tokens: Math.max(0, input.outputTokens),
    total_tokens: totalTokens,
    estimated_cost_usd: pricing.estimatedCostUsd,
    currency: "USD",
    metadata: input.metadata ?? {},
    occurred_at: occurredAt
  });

  await db("tenants")
    .where({ tenant_id: input.tenantId })
    .increment("ai_quota_used", totalTokens)
    .update({ updated_at: db.fn.now() });
}

export async function getTenantAIBudgetPolicy(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<TenantAIBudgetPolicy | null> {
  const row = await db("tenant_ai_budget_policies")
    .where({ tenant_id: tenantId })
    .first<{
      tenant_id: string;
      included_tokens: number | string | null;
      monthly_budget_usd: number | string | null;
      soft_limit_usd: number | string | null;
      hard_limit_usd: number | string | null;
      enforcement_mode: "notify" | "throttle" | "block";
      is_active: boolean;
    }>();

  if (!row) return null;

  return {
    tenantId: row.tenant_id,
    includedTokens: Number(row.included_tokens ?? 0),
    monthlyBudgetUsd: toNullableNumber(row.monthly_budget_usd),
    softLimitUsd: toNullableNumber(row.soft_limit_usd),
    hardLimitUsd: toNullableNumber(row.hard_limit_usd),
    enforcementMode: row.enforcement_mode ?? "notify",
    isActive: Boolean(row.is_active)
  };
}

export async function getTenantCurrentAIBudgetState(
  db: Knex | Knex.Transaction,
  tenantId: string,
  now = new Date()
): Promise<{
  policy: TenantAIBudgetPolicy | null;
  monthInputTokens: number;
  monthOutputTokens: number;
  monthTotalTokens: number;
  monthEstimatedCostUsd: number;
  isHardLimited: boolean;
}> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const [policy, usage] = await Promise.all([
    getTenantAIBudgetPolicy(db, tenantId),
    db("ai_usage_ledger")
      .where({ tenant_id: tenantId })
      .andWhere("occurred_at", ">=", monthStart.toISOString())
      .sum<{ input_tokens: string; output_tokens: string; total_tokens: string; estimated_cost_usd: string }>({
        input_tokens: "input_tokens",
        output_tokens: "output_tokens",
        total_tokens: "total_tokens",
        estimated_cost_usd: "estimated_cost_usd"
      })
      .first()
  ]);

  const monthEstimatedCostUsd = Number(usage?.estimated_cost_usd ?? 0);
  const isHardLimited = Boolean(
    policy?.isActive
    && policy.hardLimitUsd !== null
    && monthEstimatedCostUsd >= policy.hardLimitUsd
  );

  return {
    policy,
    monthInputTokens: Number(usage?.input_tokens ?? 0),
    monthOutputTokens: Number(usage?.output_tokens ?? 0),
    monthTotalTokens: Number(usage?.total_tokens ?? 0),
    monthEstimatedCostUsd: roundMoney(monthEstimatedCostUsd),
    isHardLimited
  };
}

export async function assertTenantAIBudgetAllowsUsage(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<{ allowed: boolean; reason?: "ai_budget_blocked" }> {
  const state = await getTenantCurrentAIBudgetState(db, tenantId);
  if (state.isHardLimited && state.policy?.enforcementMode === "block") {
    return { allowed: false, reason: "ai_budget_blocked" };
  }
  return { allowed: true };
}

function roundMoney(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
