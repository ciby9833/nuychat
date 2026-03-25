import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { parseJsonObject, toNumber } from "../tenant/tenant-admin.shared.js";

export type AIProvider = "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";

export async function pickTenantAIConfig(
  trx: Knex.Transaction,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const row = await trx("ai_configs")
    .select(
      "config_id",
      "name",
      "provider",
      "model",
      "encrypted_api_key",
      "quotas",
      "is_default",
      "is_active",
      "created_at",
      "updated_at"
    )
    .where({ tenant_id: tenantId })
    .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
    .first();
  return row ?? null;
}

export function serializeAIConfigRow(cfg: Record<string, unknown>) {
  const quotas = parseJsonObject(cfg.quotas);
  const provider = String(cfg.provider ?? "openai");
  const keyBag = parseAIConfigKeyBag(cfg.encrypted_api_key);
  return {
    config_id: String(cfg.config_id),
    name: String(cfg.name ?? "AI Config"),
    provider,
    model_name: String(cfg.model ?? "gpt-4o-mini"),
    temperature: toNumber(quotas.temperature, 0.4),
    max_tokens: toNumber(quotas.maxTokens, 500),
    system_prompt_override: typeof quotas.systemPromptOverride === "string" ? quotas.systemPromptOverride : null,
    integrations: (quotas.integrations as Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>) ?? {},
    has_api_key: Boolean(readAIProviderApiKey(keyBag, normalizeProvider(provider))),
    base_url: readAIProviderBaseUrl(quotas, normalizeProvider(provider)),
    is_default: Boolean(cfg.is_default),
    is_active: Boolean(cfg.is_active),
    created_at: cfg.created_at,
    updated_at: cfg.updated_at
  };
}

export function normalizeProvider(value: unknown): AIProvider {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    provider === "openai" ||
    provider === "claude" ||
    provider === "anthropic" ||
    provider === "gemini" ||
    provider === "deepseek" ||
    provider === "llama" ||
    provider === "ollama" ||
    provider === "kimi" ||
    provider === "kim" ||
    provider === "qwen" ||
    provider === "private" ||
    provider === "private_model"
  ) {
    if (provider === "anthropic") return "claude";
    if (provider === "ollama") return "llama";
    if (provider === "kim") return "kimi";
    if (provider === "private_model") return "private";
    return provider;
  }
  return "openai";
}

export function defaultModelForProvider(provider: AIProvider): string {
  if (provider === "claude") return "claude-3-5-haiku-latest";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "llama") return "llama3.1:8b";
  if (provider === "kimi") return "moonshot-v1-8k";
  if (provider === "qwen") return "qwen-plus";
  if (provider === "private") return "private-model";
  return "gpt-4o-mini";
}

export function parseAIConfigKeyBag(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { apiKey: raw };
  } catch {
    return { apiKey: raw };
  }
}

export function readAIProviderApiKey(keyBag: Record<string, unknown>, provider: AIProvider): string | null {
  const aliases = provider === "claude"
    ? ["anthropicApiKey", "claudeApiKey", "apiKey"]
    : provider === "llama"
      ? ["ollamaApiKey", "llamaApiKey", "apiKey"]
      : [`${provider}ApiKey`, "apiKey"];
  for (const key of aliases) {
    const value = keyBag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function setAIProviderApiKey(keyBag: Record<string, unknown>, provider: AIProvider, apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) return;
  const field = provider === "claude" ? "anthropicApiKey" : provider === "llama" ? "ollamaApiKey" : `${provider}ApiKey`;
  keyBag[field] = normalized;
  keyBag.apiKey = normalized;
}

export function readAIProviderBaseUrl(quotas: Record<string, unknown>, provider: AIProvider): string | null {
  const integrations = quotas.integrations && typeof quotas.integrations === "object" && !Array.isArray(quotas.integrations)
    ? (quotas.integrations as Record<string, unknown>)
    : {};
  const key = provider === "claude" ? "anthropic" : provider === "llama" ? "ollama" : provider;
  const block = integrations[key];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const baseUrl = (block as Record<string, unknown>).baseUrl;
  return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
}

export function setAIProviderBaseUrl(quotas: Record<string, unknown>, provider: AIProvider, baseUrl: string | null) {
  const integrations = quotas.integrations && typeof quotas.integrations === "object" && !Array.isArray(quotas.integrations)
    ? { ...(quotas.integrations as Record<string, unknown>) }
    : {};
  const key = provider === "claude" ? "anthropic" : provider === "llama" ? "ollama" : provider;
  const existing = integrations[key];
  const block = existing && typeof existing === "object" && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};

  if (baseUrl && baseUrl.trim()) {
    block.baseUrl = baseUrl.trim();
    integrations[key] = block;
  } else {
    delete block.baseUrl;
    if (Object.keys(block).length > 0) integrations[key] = block;
    else delete integrations[key];
  }

  quotas.integrations = integrations;
}

export async function assertTenantCanManageAIConfig(app: FastifyInstance, tenantId: string) {
  return withTenantTransaction(tenantId, async (trx) => {
    const tenant = await trx("tenants")
      .select("ai_model_access_mode")
      .where({ tenant_id: tenantId })
      .first<{ ai_model_access_mode: string } | undefined>();

    if (!tenant) throw app.httpErrors.notFound("Tenant not found");
    if (tenant.ai_model_access_mode !== "tenant_managed") {
      throw app.httpErrors.forbidden("AI model configuration is managed by platform");
    }
  });
}

export async function assertAISeatAvailable(
  app: FastifyInstance,
  trx: Knex.Transaction,
  tenantId: string,
  ignoreAiAgentId?: string
) {
  const tenant = await trx("tenants")
    .select("licensed_ai_seats")
    .where({ tenant_id: tenantId })
    .first<{ licensed_ai_seats: number | null } | undefined>();

  if (!tenant) throw app.httpErrors.notFound("Tenant not found");

  const licensed = Number(tenant.licensed_ai_seats ?? 0);
  const row = await trx("tenant_ai_agents")
    .where({ tenant_id: tenantId, status: "active" })
    .modify((query) => {
      if (ignoreAiAgentId) query.whereNot({ ai_agent_id: ignoreAiAgentId });
    })
    .count<{ cnt: string }>("ai_agent_id as cnt")
    .first();

  const used = Number(row?.cnt ?? 0);
  if (used >= licensed) {
    throw app.httpErrors.conflict("Licensed AI seat limit reached");
  }
}

export function serializeAiAgentRow(row: Record<string, unknown>) {
  return {
    aiAgentId: row.ai_agent_id,
    name: row.name,
    roleLabel: row.role_label ?? null,
    personality: row.personality ?? null,
    scenePrompt: row.scene_prompt ?? null,
    systemPrompt: row.system_prompt ?? null,
    description: row.description ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
