import type { Knex } from "knex";

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

export function normalizeProvider(
  value: unknown
): "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private" {
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

export function defaultModelForProvider(
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private"
): string {
  if (provider === "claude") return "claude-3-5-haiku-latest";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "llama") return "llama3.1:8b";
  if (provider === "kimi") return "moonshot-v1-8k";
  if (provider === "qwen") return "qwen-plus";
  if (provider === "private") return "private-model";
  return "gpt-4o-mini";
}

export function normalizeNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeStringArray(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

export function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function parseJsonNumberMap(value: unknown): Record<string, number> {
  const parsed = parseJsonObject(value);
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(parsed)) {
    const n = Number(item);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
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

export function readAIProviderApiKey(
  keyBag: Record<string, unknown>,
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private"
): string | null {
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

export function setAIProviderApiKey(
  keyBag: Record<string, unknown>,
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private",
  apiKey: string
) {
  const normalized = apiKey.trim();
  if (!normalized) return;
  const field = provider === "claude" ? "anthropicApiKey" : provider === "llama" ? "ollamaApiKey" : `${provider}ApiKey`;
  keyBag[field] = normalized;
  keyBag.apiKey = normalized;
}

export function readAIProviderBaseUrl(
  quotas: Record<string, unknown>,
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private"
): string | null {
  const integrations = quotas.integrations && typeof quotas.integrations === "object" && !Array.isArray(quotas.integrations)
    ? (quotas.integrations as Record<string, unknown>)
    : {};
  const key = provider === "claude" ? "anthropic" : provider === "llama" ? "ollama" : provider;
  const block = integrations[key];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const baseUrl = (block as Record<string, unknown>).baseUrl;
  return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
}

export function setAIProviderBaseUrl(
  quotas: Record<string, unknown>,
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private",
  baseUrl: string | null
) {
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

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toIsoString(value: unknown): string {
  return new Date(String(value)).toISOString();
}

export function evaluateCustomerSegmentRule(
  customer: {
    tier?: string;
    tags?: Array<{ code: string }>;
    conversationCount?: number;
    ticketCount?: number;
    lastContactAt?: string | null;
    caseCount?: number;
    openCaseCount?: number;
    lastCaseAt?: string | null;
    language?: string;
    channel?: string;
  },
  rule: Record<string, unknown>
): boolean {
  const tags = new Set((customer.tags ?? []).map((tag) => tag.code.toLowerCase()));

  const tagsAny = parseJsonStringArray(rule.tagsAny);
  if (tagsAny.length > 0 && !tagsAny.some((tag) => tags.has(tag.toLowerCase()))) return false;

  const tagsAll = parseJsonStringArray(rule.tagsAll);
  if (tagsAll.length > 0 && !tagsAll.every((tag) => tags.has(tag.toLowerCase()))) return false;

  const tiersAny = parseJsonStringArray(rule.tiersAny);
  if (tiersAny.length > 0 && !tiersAny.includes(String(customer.tier ?? "").toLowerCase())) return false;

  const languagesAny = parseJsonStringArray(rule.languagesAny);
  if (languagesAny.length > 0 && !languagesAny.includes(String(customer.language ?? "").toLowerCase())) return false;

  const channelsAny = parseJsonStringArray(rule.channelsAny);
  if (channelsAny.length > 0 && !channelsAny.includes(String(customer.channel ?? "").toLowerCase())) return false;

  const minConversationCount = Number(rule.minConversationCount ?? 0);
  if (Number.isFinite(minConversationCount) && minConversationCount > 0 && (customer.conversationCount ?? 0) < minConversationCount) {
    return false;
  }

  const minTicketCount = Number(rule.minTicketCount ?? 0);
  if (Number.isFinite(minTicketCount) && minTicketCount > 0 && (customer.ticketCount ?? 0) < minTicketCount) {
    return false;
  }

  const minCaseCount = Number(rule.minCaseCount ?? 0);
  if (Number.isFinite(minCaseCount) && minCaseCount > 0 && (customer.caseCount ?? 0) < minCaseCount) {
    return false;
  }

  const minOpenCaseCount = Number(rule.minOpenCaseCount ?? 0);
  if (Number.isFinite(minOpenCaseCount) && minOpenCaseCount > 0 && (customer.openCaseCount ?? 0) < minOpenCaseCount) {
    return false;
  }

  const daysSinceLastConversationGte = Number(rule.daysSinceLastConversationGte ?? 0);
  if (Number.isFinite(daysSinceLastConversationGte) && daysSinceLastConversationGte > 0) {
    if (!customer.lastContactAt) return true;
    const diffDays = Math.floor((Date.now() - new Date(customer.lastContactAt).getTime()) / 86_400_000);
    if (diffDays < daysSinceLastConversationGte) return false;
  }

  const daysSinceLastCaseActivityGte = Number(rule.daysSinceLastCaseActivityGte ?? 0);
  if (Number.isFinite(daysSinceLastCaseActivityGte) && daysSinceLastCaseActivityGte > 0) {
    if (!customer.lastCaseAt) return true;
    const diffDays = Math.floor((Date.now() - new Date(customer.lastCaseAt).getTime()) / 86_400_000);
    if (diffDays < daysSinceLastCaseActivityGte) return false;
  }

  return true;
}
