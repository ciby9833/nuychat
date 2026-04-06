/**
 * AICallContext — Unified AI Call Context
 *
 * Every module that calls an LLM provider should build an AICallContext first.
 * This ensures:
 *   1. Consistent parameter shapes (no more 4-arg vs object vs inline)
 *   2. Automatic usage metering via `trackedComplete`
 *   3. Budget checks happen at a single point
 *   4. Feature attribution is always present for cost analytics
 *
 * For sub-calls that don't need the full context (reviser, sandbox),
 * use `LLMParams` — the compact provider+model+temp+max subset.
 */

import type { Knex } from "knex";
import type {
  AIProvider,
  AIMessage,
  AIToolDefinition,
  ProviderName
} from "../../../../../packages/ai-sdk/src/index.js";
import { recordAIUsage, type FeatureName } from "./usage-meter.service.js";
import type { TenantAISettings } from "./provider-config.service.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Full AI call context — carries everything needed for a metered LLM call. */
export interface AICallContext {
  /** Tenant identifier (required for metering + RLS) */
  tenantId: string;
  /** Conversation identifier (optional, for trace metadata) */
  conversationId?: string | null;

  /** LLM provider instance */
  provider: AIProvider;
  /** Provider name for cost lookup */
  providerName: ProviderName;
  /** Model identifier */
  model: string;
  /** Default temperature */
  temperature: number;
  /** Default max tokens */
  maxTokens: number;

  /** Feature tag for usage breakdown (orchestrator, copilot, etc.) */
  feature: FeatureName;
  /** DB handle for usage recording */
  db: Knex | Knex.Transaction;
}

/**
 * Compact LLM params — for sub-calls that receive provider config
 * but don't own the metering responsibility (reviser, sandbox, etc.).
 * Tokens flow back to the caller who records usage.
 */
export type LLMParams = Pick<AICallContext, "provider" | "model" | "temperature" | "maxTokens">;

// ─── Factory ────────────────────────────────────────────────────────────────

/** Build an AICallContext from resolved TenantAISettings + identifiers. */
export function buildCallContext(
  db: Knex | Knex.Transaction,
  settings: TenantAISettings,
  ids: { tenantId: string; conversationId?: string | null },
  feature: FeatureName
): AICallContext {
  return {
    tenantId: ids.tenantId,
    conversationId: ids.conversationId,
    provider: settings.provider,
    providerName: settings.providerName,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    feature,
    db
  };
}

/** Extract LLMParams from a full AICallContext. */
export function toLLMParams(ctx: AICallContext): LLMParams {
  return {
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens
  };
}

// ─── Tracked LLM Call ───────────────────────────────────────────────────────

/**
 * Make a single LLM call and automatically record usage.
 *
 * Use this for one-shot calls (copilot, closure evaluator, skill formatter).
 * Do NOT use this inside the orchestrator main loop — it accumulates tokens
 * across iterations and records once at the end.
 */
export async function trackedComplete(
  ctx: AICallContext,
  params: {
    messages: AIMessage[];
    tools?: AIToolDefinition[];
    toolChoice?: "auto" | "none";
    responseFormat?: "text" | "json_object";
    maxTokens?: number;
    temperature?: number;
  },
  metadata?: Record<string, unknown>
) {
  const result = await ctx.provider.complete({
    model: ctx.model,
    messages: params.messages,
    tools: params.tools,
    toolChoice: params.toolChoice ?? (params.tools?.length ? "auto" : "none"),
    temperature: params.temperature ?? ctx.temperature,
    maxTokens: params.maxTokens ?? ctx.maxTokens,
    responseFormat: params.responseFormat ?? "text"
  });

  await recordAIUsage(ctx.db, {
    tenantId: ctx.tenantId,
    provider: ctx.providerName,
    model: ctx.model,
    feature: ctx.feature,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    metadata: {
      conversationId: ctx.conversationId ?? null,
      ...metadata
    }
  });

  return result;
}
