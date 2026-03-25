import type { Knex } from "knex";

export type PreReplyPolicyAction = "handoff" | "defer";

export type PreReplyPolicyRule = {
  ruleId: string;
  name: string;
  enabled: boolean;
  requiredSkills: string[];
  intents: string[];
  keywords: string[];
  onMissing: PreReplyPolicyAction;
  reason: string | null;
  augmentPreferredSkills: boolean;
};

export type PreReplyPolicySet = {
  enabled: boolean;
  rules: PreReplyPolicyRule[];
};

export type AIRuntimePolicy = {
  policyId: string | null;
  tenantId: string;
  preReplyPolicies: PreReplyPolicySet;
  createdAt: string | null;
  updatedAt: string | null;
};

const DEFAULT_PRE_REPLY_POLICY: PreReplyPolicySet = {
  enabled: true,
  rules: [
    {
      ruleId: "kb_policy_faq",
      name: "Knowledge base before policy answers",
      enabled: true,
      requiredSkills: ["search_knowledge_base"],
      intents: ["refund_request", "cancellation"],
      keywords: ["policy", "faq", "return", "refund", "shipping", "returns", "退货", "退款", "规则"],
      onMissing: "handoff",
      reason: "policy_requires_knowledge_base_check",
      augmentPreferredSkills: true
    },
    {
      ruleId: "order_lookup_before_order_reply",
      name: "Order lookup before order status answers",
      enabled: true,
      requiredSkills: ["lookup_order"],
      intents: ["order_inquiry"],
      keywords: ["order", "pesanan", "purchase", "invoice", "订单", "注文"],
      onMissing: "handoff",
      reason: "order_status_requires_lookup",
      augmentPreferredSkills: true
    },
    {
      ruleId: "shipment_tracking_before_delivery_reply",
      name: "Shipment tracking before delivery answers",
      enabled: true,
      requiredSkills: ["track_shipment"],
      intents: ["delivery_inquiry"],
      keywords: ["shipment", "shipping", "delivery", "tracking", "awb", "resi", "物流", "快递"],
      onMissing: "handoff",
      reason: "shipment_status_requires_tracking",
      augmentPreferredSkills: true
    }
  ]
};

export async function getTenantAIRuntimePolicy(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<AIRuntimePolicy> {
  const row = await db("tenant_ai_runtime_policies")
    .where({ tenant_id: tenantId })
    .select("policy_id", "tenant_id", "pre_reply_policies", "created_at", "updated_at")
    .first<{
      policy_id: string;
      tenant_id: string;
      pre_reply_policies: unknown;
      created_at: string | null;
      updated_at: string | null;
    } | undefined>();

  if (!row) {
    return {
      policyId: null,
      tenantId,
      preReplyPolicies: DEFAULT_PRE_REPLY_POLICY,
      createdAt: null,
      updatedAt: null
    };
  }

  return {
    policyId: row.policy_id,
    tenantId: row.tenant_id,
    preReplyPolicies: serializePreReplyPolicy(row.pre_reply_policies),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function upsertTenantAIRuntimePolicy(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    preReplyPolicies?: unknown;
  }
): Promise<AIRuntimePolicy> {
  const payload = {
    tenant_id: input.tenantId,
    pre_reply_policies: JSON.stringify(serializePreReplyPolicy(input.preReplyPolicies))
  };

  const [row] = await db("tenant_ai_runtime_policies")
    .insert(payload)
    .onConflict("tenant_id")
    .merge({
      pre_reply_policies: payload.pre_reply_policies,
      updated_at: db.fn.now()
    })
    .returning(["policy_id", "tenant_id", "pre_reply_policies", "created_at", "updated_at"]);

  return {
    policyId: row.policy_id,
    tenantId: row.tenant_id,
    preReplyPolicies: serializePreReplyPolicy(row.pre_reply_policies),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializePreReplyPolicy(raw: unknown): PreReplyPolicySet {
  return normalizePreReplyPolicy(raw);
}

function normalizePreReplyPolicy(raw: unknown): PreReplyPolicySet {
  const parsed = parseRecord(raw);
  const rules = Array.isArray(parsed.rules) ? parsed.rules : DEFAULT_PRE_REPLY_POLICY.rules;
  return {
    enabled: parsed.enabled === undefined ? DEFAULT_PRE_REPLY_POLICY.enabled : Boolean(parsed.enabled),
    rules: rules
      .map((rule, index) => normalizeRule(rule, index))
      .filter((rule): rule is PreReplyPolicyRule => rule !== null)
  };
}

function normalizeRule(raw: unknown, index: number): PreReplyPolicyRule | null {
  const parsed = parseRecord(raw);
  const requiredSkills = normalizeSkillNames(asStringArray(parsed.requiredSkills));
  if (requiredSkills.length === 0) return null;
  return {
    ruleId: asNonEmptyString(parsed.ruleId) ?? `rule_${index + 1}`,
    name: asNonEmptyString(parsed.name) ?? `Rule ${index + 1}`,
    enabled: parsed.enabled === undefined ? true : Boolean(parsed.enabled),
    requiredSkills,
    intents: normalizeStringArray(asStringArray(parsed.intents)),
    keywords: normalizeStringArray(asStringArray(parsed.keywords)),
    onMissing: parsed.onMissing === "defer" ? "defer" : "handoff",
    reason: asNonEmptyString(parsed.reason),
    augmentPreferredSkills: parsed.augmentPreferredSkills === undefined ? true : Boolean(parsed.augmentPreferredSkills)
  };
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeSkillNames(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

function normalizeStringArray(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
