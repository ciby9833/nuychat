/**
 * 作用：根据当前 action track 的候选技能，收缩为本轮真正暴露给模型的最小技能集合。
 * 上游：orchestrator.service.ts
 * 下游：buildRuntimeTools()、prompt-assembler.ts、planner-guard.service.ts
 * 协作对象：skill-planner.service.ts、runtime-governance.service.ts
 * 不负责：不做轨道判定，不执行脚本，不做最终权限校验。
 * 变更注意：第一阶段先做最小集合裁剪；后续可升级为按动作域/槽位动态装载。
 */

import type { TenantSkillDefinition } from "./contracts.js";

export function hydrateSkillsForTurn(input: {
  candidateSkills: TenantSkillDefinition[];
  selectedSkill: TenantSkillDefinition | null;
  preferredScriptKeys: string[];
  maxSkills?: number;
}): TenantSkillDefinition[] {
  if (input.candidateSkills.length === 0) return [];

  const maxSkills = Math.max(1, input.maxSkills ?? 2);
  const selectedCapabilityId = input.selectedSkill?.capabilityId ?? null;
  const preferredSet = new Set(input.preferredScriptKeys.map((item) => item.trim()).filter(Boolean));

  const scored = input.candidateSkills.map((skill, index) => ({
    skill,
    score: scoreSkill(skill, {
      selectedCapabilityId,
      preferredScriptKeys: preferredSet,
      originalIndex: index
    })
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills)
    .map((item) => item.skill);
}

function scoreSkill(
  skill: TenantSkillDefinition,
  input: {
    selectedCapabilityId: string | null;
    preferredScriptKeys: Set<string>;
    originalIndex: number;
  }
) {
  let score = 0;
  if (skill.capabilityId === input.selectedCapabilityId) score += 100;
  if (skill.scripts.some((script) => input.preferredScriptKeys.has(script.scriptKey))) score += 15;
  score += Math.max(0, 10 - input.originalIndex);
  return score;
}
