import type { Knex } from "knex";
import type { TenantSkillDefinition } from "../agent-skills/contracts.js";

import { inferConversationIntent } from "./ai-runtime-contract.js";
import { resolveCheckBindingKeys, type PreReplyCheckRef } from "./pre-reply-checks.js";
import { getTenantAIRuntimePolicy, type PreReplyPolicyAction } from "./runtime-policy.service.js";

export type PreReplyPolicyMatch = {
  ruleId: string;
  name: string;
  requiredChecks: PreReplyCheckRef[];
  requiredBindingKeysByCheck: Record<string, string[]>;
  onMissing: PreReplyPolicyAction;
  reason: string | null;
};

export type PreReplyPolicyEvaluation = {
  enabled: boolean;
  intent: string;
  matchedRules: PreReplyPolicyMatch[];
  requiredChecks: PreReplyCheckRef[];
  requiredBindingKeysByCheck: Record<string, string[]>;
  preferredBindingKeys: string[];
};

export async function evaluatePreReplyPolicy(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    preferredSkillNames?: string[];
    availableSkills: TenantSkillDefinition[];
  }
): Promise<PreReplyPolicyEvaluation> {
  const runtimePolicy = await getTenantAIRuntimePolicy(db, input.tenantId);
  const policy = runtimePolicy.preReplyPolicies;
  const intent = inferConversationIntent(input.chatHistory);
  const text = input.chatHistory
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");
  const preferred = new Set(normalizeBindingKeys(input.preferredSkillNames ?? []));
  const matchedRules: PreReplyPolicyMatch[] = [];
  const requiredChecks = new Set<PreReplyCheckRef>();
  const requiredBindingKeysByCheck: Record<string, string[]> = {};

  if (!policy.enabled) {
    return {
      enabled: false,
      intent,
      matchedRules: [],
      requiredChecks: [],
      requiredBindingKeysByCheck: {},
      preferredBindingKeys: [...preferred]
    };
  }

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;
    const matchesIntent = rule.intents.length > 0 && rule.intents.includes(intent);
    const matchesKeyword = rule.keywords.length > 0 && rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    if (!matchesIntent && !matchesKeyword) continue;

    const ruleBindingsByCheck: Record<string, string[]> = {};
    matchedRules.push({
      ruleId: rule.ruleId,
      name: rule.name,
      requiredChecks: [...rule.requiredChecks],
      requiredBindingKeysByCheck: ruleBindingsByCheck,
      onMissing: rule.onMissing,
      reason: rule.reason
    });

    for (const checkName of rule.requiredChecks) {
      requiredChecks.add(checkName);
      const bindingKeys = resolveCheckBindingKeys(checkName, input.availableSkills);
      ruleBindingsByCheck[checkName] = bindingKeys;
      requiredBindingKeysByCheck[checkName] = bindingKeys;
      if (rule.augmentPreferredChecks) {
        for (const bindingKey of bindingKeys) {
          preferred.add(bindingKey);
        }
      }
    }
  }

  return {
    enabled: true,
    intent,
    matchedRules,
    requiredChecks: [...requiredChecks],
    requiredBindingKeysByCheck,
    preferredBindingKeys: [...preferred]
  };
}

export function enforcePreReplyPolicy(input: {
  policy: PreReplyPolicyEvaluation;
  invokedBindings: string[];
  proposedAction: "reply" | "handoff" | "defer";
  currentHandoffReason?: string | null;
}) {
  if (!input.policy.enabled || input.policy.requiredChecks.length === 0) {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingChecks: [] as PreReplyCheckRef[]
    };
  }

  if (input.proposedAction !== "reply") {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingChecks: [] as PreReplyCheckRef[]
    };
  }

  const invoked = new Set(normalizeBindingKeys(input.invokedBindings));
  const missingChecks = input.policy.requiredChecks.filter((checkName) => {
    const bindingKeys = input.policy.requiredBindingKeysByCheck[checkName] ?? [];
    if (bindingKeys.length === 0) return true;
    return !bindingKeys.some((bindingKey) => invoked.has(bindingKey));
  });
  if (missingChecks.length === 0) {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingChecks
    };
  }

  const matchedRule = input.policy.matchedRules.find((rule) =>
    rule.requiredChecks.some((checkName) => missingChecks.includes(checkName))
  );
  const action = matchedRule?.onMissing ?? "handoff";
  const handoffReason = matchedRule?.reason ?? `pre_reply_policy_missing_${missingChecks.join("_")}`;

  return {
    blocked: true,
    action,
    handoffReason,
    missingChecks
  };
}

function normalizeBindingKeys(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}
