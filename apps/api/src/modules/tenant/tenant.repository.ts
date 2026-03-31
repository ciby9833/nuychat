import { db } from "../../infra/db/client.js";

type TenantRow = {
  tenant_id: string;
  slug: string;
  operating_mode: string;
  ai_quota_used: number;
  licensed_ai_seats: number | null;
  ai_model_access_mode: string | null;
};

type AIConfigRow = {
  source: string;
  provider: string;
  model: string;
  quotas: Record<string, unknown> | null;
};

export type TenantContext = {
  tenantId: string;
  slug: string;
  operatingMode: string;
  aiConfig: {
    source: "platform" | "own";
    provider: string;
    model: string;
    accessMode: "platform_managed" | "tenant_managed";
  };
  quotas: {
    aiTokenLimit: number | null;
    aiQuotaUsed: number;
  };
  aiLicensing: {
    licensedAiSeats: number;
  };
};

export async function getTenantContextById(tenantId: string) {
  const tenant = await db<TenantRow>("tenants")
    .select("tenant_id", "slug", "operating_mode", "ai_quota_used", "licensed_ai_seats", "ai_model_access_mode")
    .where({ tenant_id: tenantId } as any)
    .first();

  if (!tenant) {
    return null;
  }

  const aiConfig = await db<AIConfigRow>("ai_configs")
    .select("source", "provider", "model", "quotas")
    .where({ tenant_id: tenantId } as any)
    .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
    .first();

  const quotas = aiConfig?.quotas ?? {};
  const aiTokenLimit =
    typeof quotas.monthlyTokenLimit === "number"
      ? quotas.monthlyTokenLimit
      : typeof quotas.aiTokenQuotaMonthly === "number"
        ? quotas.aiTokenQuotaMonthly
        : null;

  return {
    tenantId: tenant.tenant_id,
    slug: tenant.slug,
    operatingMode: tenant.operating_mode,
    aiConfig: {
      source: aiConfig?.source === "own" ? "own" : "platform",
      provider: aiConfig?.provider ?? "openai",
      model: aiConfig?.model ?? "gpt-4o-mini",
      accessMode: tenant.ai_model_access_mode === "tenant_managed" ? "tenant_managed" : "platform_managed"
    },
    quotas: {
      aiTokenLimit,
      aiQuotaUsed: tenant.ai_quota_used
    },
    aiLicensing: {
      licensedAiSeats: Number(tenant.licensed_ai_seats ?? 0)
    }
  } satisfies TenantContext;
}

export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const tenant = await db<{ tenant_id: string }>("tenants")
    .select("tenant_id")
    .where({ slug } as any)
    .first();

  return tenant?.tenant_id ?? null;
}
