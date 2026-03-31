import type { TenantSkillDefinition } from "./contracts.js";

export type PlannedSkillStep = {
  stepKey: string;
  scriptKey: string;
  dependsOn: string[];
};

export type ScheduledSkillTask = {
  stepKey: string;
  scriptKey: string;
  taskType: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  dependsOn: string[];
};

export function defaultPlannedSkillSteps(scriptKey: string): PlannedSkillStep[] {
  return [{ stepKey: scriptKey, scriptKey, dependsOn: [] }];
}

export function buildScheduledSkillTasks(
  steps: PlannedSkillStep[],
  args: Record<string, unknown>,
  selectedSkill: Pick<TenantSkillDefinition, "capabilityId" | "slug" | "name" | "description" | "scripts"> | null
): ScheduledSkillTask[] {
  if (!selectedSkill) return [];
  const scriptMap = new Map(
    selectedSkill.scripts
      .filter((script) => script.enabled)
      .map((script) => [script.scriptKey, script])
  );

  return steps
    .map((step, index): ScheduledSkillTask | null => {
      const script = scriptMap.get(step.scriptKey);
      if (!script) return null;
      return {
        stepKey: step.stepKey || `${step.scriptKey}_${index + 1}`,
        scriptKey: step.scriptKey,
        taskType: "capability_script_execution",
        title: script.name || `${selectedSkill.name} script`,
        message: `${selectedSkill.name} 已开始执行。`,
        payload: {
          capability: {
            capabilityId: selectedSkill.capabilityId,
            slug: selectedSkill.slug,
            name: selectedSkill.name,
            description: selectedSkill.description
          },
          script: {
            scriptKey: script.scriptKey,
            name: script.name,
            fileName: script.fileName,
            language: script.language,
            sourceCode: script.sourceCode,
            requirements: script.requirements,
            envRefs: script.envRefs,
            envBindings: script.envBindings
          },
          args
        },
        dependsOn: step.dependsOn
      };
    })
    .filter((item): item is ScheduledSkillTask => item !== null);
}
