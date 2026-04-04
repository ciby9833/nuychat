import type { Knex } from "knex";
import type { PreReplyCheckRef } from "./pre-reply-checks.js";

export type PreReplyPolicyAction = "handoff" | "defer";
export type AIModelScene = "ai_seat" | "agent_assist" | "tool_default" | "qa_review";

export type AIModelSceneConfig = {
  aiSeatConfigId: string | null;
  agentAssistConfigId: string | null;
  toolDefaultConfigId: string | null;
  qaReviewConfigId: string | null;
};

export type PreReplyPolicyRule = {
  ruleId: string;
  name: string;
  enabled: boolean;
  requiredChecks: PreReplyCheckRef[];
  intents: string[];
  keywords: string[];
  onMissing: PreReplyPolicyAction;
  reason: string | null;
  augmentPreferredChecks: boolean;
};

export type PreReplyPolicySet = {
  enabled: boolean;
  rules: PreReplyPolicyRule[];
};

export type AIRuntimePolicy = {
  policyId: string | null;
  tenantId: string;
  preReplyPolicies: PreReplyPolicySet;
  modelSceneConfig: AIModelSceneConfig;
  createdAt: string | null;
  updatedAt: string | null;
};

const DEFAULT_PRE_REPLY_POLICY: PreReplyPolicySet = {
  enabled: false,
  rules: []
};

const DEFAULT_MODEL_SCENE_CONFIG: AIModelSceneConfig = {
  aiSeatConfigId: null,
  agentAssistConfigId: null,
  toolDefaultConfigId: null,
  qaReviewConfigId: null
};

export async function getTenantAIRuntimePolicy(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<AIRuntimePolicy> {
  const row = await db("tenant_ai_runtime_policies")
    .where({ tenant_id: tenantId })
    .select("policy_id", "tenant_id", "pre_reply_policies", "model_scene_config", "created_at", "updated_at")
    .first<{
      policy_id: string;
      tenant_id: string;
      pre_reply_policies: unknown;
      model_scene_config: unknown;
      created_at: string | null;
      updated_at: string | null;
    } | undefined>();

  if (!row) {
    return {
      policyId: null,
      tenantId,
      preReplyPolicies: DEFAULT_PRE_REPLY_POLICY,
      modelSceneConfig: DEFAULT_MODEL_SCENE_CONFIG,
      createdAt: null,
      updatedAt: null
    };
  }

  return {
    policyId: row.policy_id,
    tenantId: row.tenant_id,
    preReplyPolicies: serializePreReplyPolicy(row.pre_reply_policies),
    modelSceneConfig: serializeModelSceneConfig(row.model_scene_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function upsertTenantAIRuntimePolicy(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    preReplyPolicies?: unknown;
    modelSceneConfig?: unknown;
  }
): Promise<AIRuntimePolicy> {
  const payload = {
    tenant_id: input.tenantId,
    pre_reply_policies: JSON.stringify(serializePreReplyPolicy(input.preReplyPolicies)),
    model_scene_config: JSON.stringify(serializeModelSceneConfig(input.modelSceneConfig))
  };

  const [row] = await db("tenant_ai_runtime_policies")
    .insert(payload)
    .onConflict("tenant_id")
    .merge({
      pre_reply_policies: payload.pre_reply_policies,
      model_scene_config: payload.model_scene_config,
      updated_at: db.fn.now()
    })
    .returning(["policy_id", "tenant_id", "pre_reply_policies", "model_scene_config", "created_at", "updated_at"]);

  return {
    policyId: row.policy_id,
    tenantId: row.tenant_id,
    preReplyPolicies: serializePreReplyPolicy(row.pre_reply_policies),
    modelSceneConfig: serializeModelSceneConfig(row.model_scene_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializePreReplyPolicy(raw: unknown): PreReplyPolicySet {
  return normalizePreReplyPolicy(raw);
}

export function serializeModelSceneConfig(raw: unknown): AIModelSceneConfig {
  const parsed = parseRecord(raw);
  return {
    aiSeatConfigId: asNonEmptyString(parsed.aiSeatConfigId),
    agentAssistConfigId: asNonEmptyString(parsed.agentAssistConfigId),
    toolDefaultConfigId: asNonEmptyString(parsed.toolDefaultConfigId),
    qaReviewConfigId: asNonEmptyString(parsed.qaReviewConfigId)
  };
}

function normalizePreReplyPolicy(raw: unknown): PreReplyPolicySet {
  // Trigger-level pre-reply rules have been retired. Runtime policy now stays at
  // the constitutional layer and no longer participates in skill/capability
  // selection. Knowledge lookup and other capabilities are selected from the
  // capability package itself instead of a second rule system here.
  void raw;
  return DEFAULT_PRE_REPLY_POLICY;
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
