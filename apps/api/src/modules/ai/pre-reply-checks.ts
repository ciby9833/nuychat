/**
 * 作用：统一定义 AI 运行策略里的“回复前检查”引用格式，并解析到能力脚本。
 * 功能归属：AI 运行策略 / Orchestrator 回复前检查。
 */
import type { TenantSkillDefinition } from "../agent-skills/contracts.js";

export type PreReplyCheckRef = string;

export function normalizePreReplyChecks(input: string[]): PreReplyCheckRef[] {
  return Array.from(
    new Set(
      input
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => item.startsWith("capability:"))
    )
  );
}

export function resolveCheckBindingKeys(check: PreReplyCheckRef, availableSkills: TenantSkillDefinition[]): string[] {
  if (!check.startsWith("capability:")) return [];
  const code = check.slice("capability:".length);
  if (!code) return [];
  const skill = availableSkills.find((item) => item.slug === code);
  if (!skill) return [];
  return Array.from(
    new Set(skill.scripts.filter((script) => script.enabled).map((script) => script.scriptKey).filter(Boolean))
  );
}
