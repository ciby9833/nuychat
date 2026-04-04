import { readOptionalEnv } from "../../infra/env.js";
import type { Knex } from "knex";
import {
  createProvider,
  type AIProvider,
  type ProviderName
} from "../../../../../packages/ai-sdk/src/index.js";
import { getTenantAIRuntimePolicy, type AIModelScene } from "./runtime-policy.service.js";

type AIConfigRow = {
  config_id: string;
  provider: string | null;
  model: string | null;
  encrypted_api_key: string | null;
  quotas: unknown;
  is_default: boolean | null;
  is_active: boolean | null;
  updated_at: string | null;
};

type TenantAIRow = {
  ai_model_access_mode: string | null;
};

type JsonObject = Record<string, unknown>;

export interface TenantAISettings {
  configId?: string | null;
  providerName: ProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  provider: AIProvider;
}

/**
 * Resolve tenant-specific AI provider settings with env fallbacks.
 */
export async function resolveTenantAISettings(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<TenantAISettings | null> {
  const tenant = await db<TenantAIRow>("tenants")
    .where({ tenant_id: tenantId } as any)
    .select("ai_model_access_mode")
    .first();

  const cfg = await db<AIConfigRow>("ai_configs")
    .where({ tenant_id: tenantId } as any)
    .andWhere({ is_active: true } as any)
    .select("config_id", "provider", "model", "encrypted_api_key", "quotas", "is_default", "is_active", "updated_at")
    .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
    .first();

  const accessMode = tenant?.ai_model_access_mode ?? "platform_managed";
  if (!cfg && accessMode === "tenant_managed") {
    return null;
  }

  return buildTenantAISettings(cfg);
}

export async function resolveTenantAISettingsForScene(
  db: Knex | Knex.Transaction,
  tenantId: string,
  scene: AIModelScene
): Promise<TenantAISettings | null> {
  const policy = await getTenantAIRuntimePolicy(db, tenantId);
  const sceneConfigId = scene === "ai_seat"
    ? policy.modelSceneConfig.aiSeatConfigId
    : scene === "agent_assist"
      ? policy.modelSceneConfig.agentAssistConfigId
      : scene === "qa_review"
        ? policy.modelSceneConfig.qaReviewConfigId
        : policy.modelSceneConfig.toolDefaultConfigId;

  if (sceneConfigId) {
    const sceneSettings = await resolveTenantAISettingsByConfigId(db, tenantId, sceneConfigId);
    if (sceneSettings) {
      return sceneSettings;
    }
  }

  return await resolveTenantAISettings(db, tenantId);
}

export async function resolveTenantAISettingsByConfigId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  configId: string
): Promise<TenantAISettings | null> {
  const cfg = await db<AIConfigRow>("ai_configs")
    .where({ tenant_id: tenantId, config_id: configId } as any)
    .andWhere({ is_active: true } as any)
    .select("config_id", "provider", "model", "encrypted_api_key", "quotas", "is_default", "is_active", "updated_at")
    .first();

  if (!cfg) return null;
  return buildTenantAISettings(cfg);
}

function buildTenantAISettings(cfg: AIConfigRow | undefined): TenantAISettings | null {
  const providerKey = normalizeProviderKey(cfg?.provider);
  const providerName = mapProviderKeyToRuntimeProvider(providerKey);
  const quotas = parseJsonObject(cfg?.quotas);
  const integrations = parseJsonObject(quotas.integrations);
  const providerBlock = {
    ...parseJsonObject(integrations[providerName]),
    ...parseJsonObject(integrations[providerKey])
  };
  const defaultModel = providerDefaultModel(providerKey);
  const model = (cfg?.model ?? providerBlock.model ?? defaultModel) as string;
  const temperature = toNumber(quotas.temperature, 0.4);
  const maxTokens = Math.max(100, Math.min(4000, toNumber(quotas.maxTokens, 500)));

  const keyBag = parseEncryptedKeyBag(cfg?.encrypted_api_key);
  const apiKey = resolveApiKey(providerName, keyBag, providerBlock);
  const baseUrl = resolveBaseUrl(providerName, providerBlock);

  try {
    const provider = providerName === "openai"
      ? createProvider("openai", {
          apiKey: apiKey ?? "",
          baseUrl,
          defaultModel: model
        })
      : providerName === "anthropic"
        ? createProvider("anthropic", {
            apiKey: apiKey ?? "",
            baseUrl,
            defaultModel: model
          })
        : providerName === "gemini"
          ? createProvider("gemini", {
              apiKey: apiKey ?? "",
              baseUrl,
              defaultModel: model
            })
        : createProvider("ollama", {
            baseUrl,
            defaultModel: model
          });

    return {
      configId: cfg?.config_id ?? null,
      providerName,
      model,
      temperature,
      maxTokens,
      provider
    };
  } catch {
    return null;
  }
}

function normalizeProviderKey(raw: unknown): "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private" {
  if (raw === "claude" || raw === "anthropic") return "claude";
  if (raw === "gemini") return "gemini";
  if (raw === "deepseek") return "deepseek";
  if (raw === "llama" || raw === "ollama") return "llama";
  if (raw === "kimi" || raw === "kim") return "kimi";
  if (raw === "qwen") return "qwen";
  if (raw === "private" || raw === "private_model") return "private";
  return "openai";
}

function mapProviderKeyToRuntimeProvider(
  provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private"
): ProviderName {
  if (provider === "claude") return "anthropic";
  if (provider === "gemini") return "gemini";
  if (provider === "llama") return "ollama";
  return "openai";
}

function providerDefaultModel(provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private"): string {
  if (provider === "claude") return "claude-3-5-haiku-latest";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "llama") return "llama3.1:8b";
  if (provider === "kimi") return "moonshot-v1-8k";
  if (provider === "qwen") return "qwen-plus";
  if (provider === "private") return "private-model";
  return "gpt-4o-mini";
}

function resolveApiKey(
  provider: ProviderName,
  keyBag: JsonObject,
  providerBlock: JsonObject
): string | undefined {
  if (provider === "openai") {
    return (
      pickString(keyBag.openaiApiKey) ??
      pickString(keyBag.apiKey) ??
      pickString(providerBlock.apiKey) ??
      process.env.OPENAI_API_KEY
    );
  }
  if (provider === "anthropic") {
    return (
      pickString(keyBag.anthropicApiKey) ??
      pickString(keyBag.apiKey) ??
      pickString(providerBlock.apiKey) ??
      process.env.ANTHROPIC_API_KEY
    );
  }
  if (provider === "gemini") {
    return (
      pickString(keyBag.geminiApiKey) ??
      pickString(keyBag.apiKey) ??
      pickString(providerBlock.apiKey) ??
      process.env.GEMINI_API_KEY
    );
  }
  return undefined;
}

function resolveBaseUrl(provider: ProviderName, providerBlock: JsonObject): string | undefined {
  if (provider === "openai") {
    return pickString(providerBlock.baseUrl) ?? readOptionalEnv("OPENAI_BASE_URL");
  }
  if (provider === "anthropic") {
    return pickString(providerBlock.baseUrl) ?? readOptionalEnv("ANTHROPIC_BASE_URL");
  }
  if (provider === "gemini") {
    return pickString(providerBlock.baseUrl) ?? readOptionalEnv("GEMINI_BASE_URL");
  }
  return pickString(providerBlock.baseUrl) ?? readOptionalEnv("OLLAMA_BASE_URL");
}

function parseEncryptedKeyBag(raw: unknown): JsonObject {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseJsonObject(parsed);
  } catch {
    return { apiKey: raw };
  }
}

function parseJsonObject(input: unknown): JsonObject {
  if (typeof input === "string" && input.trim() !== "") {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parseJsonObject(parsed);
    } catch {
      return {};
    }
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as JsonObject;
  }
  return {};
}

function pickString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
