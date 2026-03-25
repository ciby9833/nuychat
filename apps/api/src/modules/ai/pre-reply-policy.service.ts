import type { Knex } from "knex";

import { inferConversationIntent } from "./ai-runtime-contract.js";
import { getTenantAIRuntimePolicy, type PreReplyPolicyAction } from "./runtime-policy.service.js";

export type PreReplyPolicyMatch = {
  ruleId: string;
  name: string;
  requiredSkills: string[];
  onMissing: PreReplyPolicyAction;
  reason: string | null;
};

export type PreReplyPolicyEvaluation = {
  enabled: boolean;
  intent: string;
  matchedRules: PreReplyPolicyMatch[];
  requiredSkills: string[];
  preferredSkills: string[];
};

export async function evaluatePreReplyPolicy(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    preferredSkillNames?: string[];
  }
): Promise<PreReplyPolicyEvaluation> {
  const runtimePolicy = await getTenantAIRuntimePolicy(db, input.tenantId);
  const policy = runtimePolicy.preReplyPolicies;
  const intent = inferConversationIntent(input.chatHistory);
  const text = input.chatHistory
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");
  const preferred = new Set(normalizeSkillNames(input.preferredSkillNames ?? []));
  const matchedRules: PreReplyPolicyMatch[] = [];
  const requiredSkills = new Set<string>();

  if (!policy.enabled) {
    return {
      enabled: false,
      intent,
      matchedRules: [],
      requiredSkills: [],
      preferredSkills: [...preferred]
    };
  }

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;
    const matchesIntent = rule.intents.length > 0 && rule.intents.includes(intent);
    const matchesKeyword = rule.keywords.length > 0 && rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    if (!matchesIntent && !matchesKeyword) continue;

    matchedRules.push({
      ruleId: rule.ruleId,
      name: rule.name,
      requiredSkills: [...rule.requiredSkills],
      onMissing: rule.onMissing,
      reason: rule.reason
    });

    for (const skillName of rule.requiredSkills) {
      requiredSkills.add(skillName);
      if (rule.augmentPreferredSkills) {
        preferred.add(skillName);
      }
    }
  }

  return {
    enabled: true,
    intent,
    matchedRules,
    requiredSkills: [...requiredSkills],
    preferredSkills: [...preferred]
  };
}

export function enforcePreReplyPolicy(input: {
  policy: PreReplyPolicyEvaluation;
  invokedSkills: string[];
  proposedAction: "reply" | "handoff" | "defer";
  currentHandoffReason?: string | null;
}) {
  if (!input.policy.enabled || input.policy.requiredSkills.length === 0) {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingSkills: [] as string[]
    };
  }

  if (input.proposedAction !== "reply") {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingSkills: [] as string[]
    };
  }

  const invoked = new Set(normalizeSkillNames(input.invokedSkills));
  const missingSkills = input.policy.requiredSkills.filter((skillName) => !invoked.has(skillName));
  if (missingSkills.length === 0) {
    return {
      blocked: false,
      action: input.proposedAction,
      handoffReason: input.currentHandoffReason ?? null,
      missingSkills
    };
  }

  const matchedRule = input.policy.matchedRules.find((rule) =>
    rule.requiredSkills.some((skillName) => missingSkills.includes(skillName))
  );
  const action = matchedRule?.onMissing ?? "handoff";
  const handoffReason = matchedRule?.reason ?? `pre_reply_policy_missing_${missingSkills.join("_")}`;

  return {
    blocked: true,
    action,
    handoffReason,
    missingSkills
  };
}

function normalizeSkillNames(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}
