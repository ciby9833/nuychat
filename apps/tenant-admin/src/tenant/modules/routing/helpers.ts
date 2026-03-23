import type { DepartmentItem, RoutingRule, TeamItem } from "../../types";
import type { RuleFormValues } from "./types";
import { STRATEGY_OPTIONS } from "./types";

export function readHumanTarget(rule: RoutingRule) {
  return {
    targetDepartmentId: rule.actions.humanTarget?.departmentId,
    targetTeamId: rule.actions.humanTarget?.teamId,
    targetSkillGroupCode: rule.actions.humanTarget?.skillGroupCode ?? "",
    assignmentStrategy: rule.actions.humanTarget?.assignmentStrategy ?? "least_busy"
  };
}

export function readFallbackTarget(rule: RoutingRule) {
  return {
    fallbackDepartmentId: rule.actions.fallbackTarget?.departmentId,
    fallbackTeamId: rule.actions.fallbackTarget?.teamId,
    fallbackSkillGroupCode: rule.actions.fallbackTarget?.skillGroupCode,
    fallbackAssignmentStrategy: rule.actions.fallbackTarget?.assignmentStrategy
  };
}

export function readExecutionMode(rule: RoutingRule): RuleFormValues["executionMode"] {
  return rule.actions.executionMode ?? "ai_first";
}

export function readAiAgentId(rule: RoutingRule) {
  return rule.actions.aiTarget?.aiAgentId;
}

export function readAiAssignmentStrategy(rule: RoutingRule): RuleFormValues["aiAssignmentStrategy"] {
  return rule.actions.aiTarget?.assignmentStrategy ?? "least_busy";
}

export function readOverflowPolicy(rule: RoutingRule) {
  return {
    humanToAiThresholdPct: rule.actions.overflowPolicy?.humanToAiThresholdPct,
    aiToHumanThresholdPct: rule.actions.overflowPolicy?.aiToHumanThresholdPct,
    aiSoftConcurrencyLimit: rule.actions.overflowPolicy?.aiSoftConcurrencyLimit
  };
}

export function readHybridStrategy(rule: RoutingRule): RuleFormValues["hybridStrategy"] {
  return rule.actions.hybridPolicy?.strategy ?? "load_balanced";
}

export function readOverrides(rule: RoutingRule) {
  return {
    customerRequestsHuman: rule.actions.overrides?.customerRequestsHuman ?? "force_human",
    humanRequestKeywords: (rule.actions.overrides?.humanRequestKeywords ?? []).join("\n"),
    aiUnhandled: rule.actions.overrides?.aiUnhandled ?? "force_human"
  };
}

export function buildRuleSummary(rule: RoutingRule, departments: DepartmentItem[], teams: TeamItem[]) {
  const humanTarget = readHumanTarget(rule);
  const department = departments.find((item) => item.departmentId === humanTarget.targetDepartmentId);
  const team = teams.find((item) => item.teamId === humanTarget.targetTeamId);
  const fallback = readFallbackTarget(rule);

  return {
    executionMode: readExecutionMode(rule),
    channel: rule.conditions.channelType ?? "任意",
    language: rule.conditions.customerLanguage ?? "任意",
    tier: rule.conditions.customerTier ?? "任意",
    departmentName: team?.departmentName ?? department?.name ?? "任意部门",
    teamName: team?.name ?? "自动选团队",
    skillGroupCode: humanTarget.targetSkillGroupCode ?? "-",
    aiAgentId: readAiAgentId(rule) ?? null,
    aiStrategy: STRATEGY_OPTIONS.find((item) => item.value === readAiAssignmentStrategy(rule))?.label ?? "最小负载",
    strategy: STRATEGY_OPTIONS.find((item) => item.value === humanTarget.assignmentStrategy)?.label ?? "轮询",
    fallbackSkillGroupCode: fallback.fallbackSkillGroupCode ?? "沿用人工目标",
    humanToAiThresholdPct: rule.actions.overflowPolicy?.humanToAiThresholdPct ?? null,
    aiToHumanThresholdPct: rule.actions.overflowPolicy?.aiToHumanThresholdPct ?? null,
    hybridStrategy: rule.actions.hybridPolicy?.strategy ?? null
  };
}

export function buildRulePayload(values: RuleFormValues) {
  return {
    name: values.name.trim(),
    priority: values.priority,
    conditions: {
      ...(values.channelType ? { channelType: values.channelType } : {}),
      ...(values.customerLanguage ? { customerLanguage: values.customerLanguage } : {}),
      ...(values.customerTier ? { customerTier: values.customerTier } : {})
    },
    actions: {
      executionMode: values.executionMode,
      humanTarget: {
        ...(values.targetDepartmentId ? { departmentId: values.targetDepartmentId } : {}),
        ...(values.targetTeamId ? { teamId: values.targetTeamId } : {}),
        skillGroupCode: values.targetSkillGroupCode,
        assignmentStrategy: values.assignmentStrategy
      },
      aiTarget: {
        ...(values.aiAgentId ? { aiAgentId: values.aiAgentId } : {}),
        assignmentStrategy: values.aiAssignmentStrategy
      },
      ...((values.humanToAiThresholdPct !== undefined && values.humanToAiThresholdPct !== null) ||
      (values.aiToHumanThresholdPct !== undefined && values.aiToHumanThresholdPct !== null) ||
      (values.aiSoftConcurrencyLimit !== undefined && values.aiSoftConcurrencyLimit !== null)
        ? {
            overflowPolicy: {
              ...(values.humanToAiThresholdPct !== undefined && values.humanToAiThresholdPct !== null
                ? { humanToAiThresholdPct: values.humanToAiThresholdPct }
                : {}),
              ...(values.aiToHumanThresholdPct !== undefined && values.aiToHumanThresholdPct !== null
                ? { aiToHumanThresholdPct: values.aiToHumanThresholdPct }
                : {}),
              ...(values.aiSoftConcurrencyLimit !== undefined && values.aiSoftConcurrencyLimit !== null
                ? { aiSoftConcurrencyLimit: values.aiSoftConcurrencyLimit }
                : {})
            }
          }
        : {}),
      ...(values.hybridStrategy
        ? { hybridPolicy: { strategy: values.hybridStrategy } }
        : {}),
      overrides: {
        customerRequestsHuman: values.customerRequestsHuman,
        ...(values.humanRequestKeywords?.trim()
          ? {
              humanRequestKeywords: values.humanRequestKeywords
                .split(/\r?\n|,/)
                .map((item) => item.trim())
                .filter(Boolean)
            }
          : {}),
        aiUnhandled: values.aiUnhandled
      },
      ...(values.fallbackDepartmentId || values.fallbackTeamId || values.fallbackSkillGroupCode || values.fallbackAssignmentStrategy
        ? {
            fallbackTarget: {
              ...(values.fallbackDepartmentId ? { departmentId: values.fallbackDepartmentId } : {}),
              ...(values.fallbackTeamId ? { teamId: values.fallbackTeamId } : {}),
              ...(values.fallbackSkillGroupCode ? { skillGroupCode: values.fallbackSkillGroupCode } : {}),
              ...(values.fallbackAssignmentStrategy ? { assignmentStrategy: values.fallbackAssignmentStrategy } : {})
            }
          }
        : {})
    },
    isActive: values.isActive
  };
}
