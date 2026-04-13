/**
 * 作用：为动作执行轨道提供偏好绑定选择，帮助 capability/hydration 优先加载需要的检查型技能。
 * 上游：orchestrator.service.ts
 * 下游：当前由 orchestrator 在 skill planning / hydration 前消费；后续将继续前移到能力装载层。
 * 协作对象：runtime-policy.service.ts、pre-reply-checks.ts、agent-skills/contracts.ts
 * 不负责：不做轨道判定，不做知识检索，不直接执行工具，不在最终回复阶段二次拦截答案。
 * 变更注意：非 action_track 应绕过本服务；本阶段已移除 reply gate，避免形成双阶段重复判断。
 */

import type { Knex } from "knex";
import type { TenantSkillDefinition } from "../agent-skills/contracts.js";

import { inferConversationIntent } from "./ai-runtime-contract.js";
import { resolveCheckBindingKeys, type PreReplyCheckRef } from "./pre-reply-checks.js";
import { getTenantAIRuntimePolicy } from "./runtime-policy.service.js";

export type PreReplyPolicyEvaluation = {
  enabled: boolean;
  intent: string;
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
  const requiredChecks = new Set<PreReplyCheckRef>();
  const requiredBindingKeysByCheck: Record<string, string[]> = {};

  if (!policy.enabled) {
    return {
      enabled: false,
      intent,
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
    requiredChecks: [...requiredChecks],
    requiredBindingKeysByCheck,
    preferredBindingKeys: [...preferred]
  };
}

function normalizeBindingKeys(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}
