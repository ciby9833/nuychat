/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 提供路由规则读写、摘要展示与接口提交 payload 拼装能力。
 * 主要交互文件:
 * - ./components/RuleTable.tsx
 * - ./hooks/useRoutingData.ts
 * - ./modals/RuleEditorDrawer.tsx
 * - ./types.ts
 */

import type { ChannelConfig, DepartmentItem, RoutingRule, TeamItem } from "../../types";
import i18next from "i18next";
import type { RuleFormValues } from "./types";
import { STRATEGY_OPTIONS } from "./types";

function formatChannelInstanceLabel(channel: ChannelConfig): string {
  if (channel.channel_type === "whatsapp") {
    return channel.label?.trim()
      || channel.display_phone_number?.trim()
      || channel.phone_number_id?.trim()
      || channel.channel_id;
  }

  if (channel.channel_type === "web") {
    return channel.widget_name?.trim()
      || channel.public_channel_key?.trim()
      || channel.channel_id;
  }

  if (channel.channel_type === "webhook") {
    return channel.channel_id;
  }

  return channel.channel_id;
}

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

export function buildRuleSummary(
  rule: RoutingRule,
  departments: DepartmentItem[],
  teams: TeamItem[],
  channels: ChannelConfig[] = []
) {
  const humanTarget = readHumanTarget(rule);
  const department = departments.find((item) => item.departmentId === humanTarget.targetDepartmentId);
  const team = teams.find((item) => item.teamId === humanTarget.targetTeamId);
  const fallback = readFallbackTarget(rule);
  const matchedChannel = rule.conditions.channelId
    ? channels.find((item) => item.channel_id === rule.conditions.channelId)
    : undefined;
  const channelTypeLabel = matchedChannel?.channel_type ?? rule.conditions.channelType ?? i18next.t("routing.summary.any");
  const channelInstanceLabel = matchedChannel
    ? formatChannelInstanceLabel(matchedChannel)
    : (rule.conditions.channelId ?? null);

  return {
    executionMode: readExecutionMode(rule),
    channel: channelTypeLabel,
    channelInstance: channelInstanceLabel,
    language: rule.conditions.customerLanguage ? i18next.t(`routing.options.language.${rule.conditions.customerLanguage}`, { defaultValue: rule.conditions.customerLanguage }) : i18next.t("routing.summary.any"),
    tier: rule.conditions.customerTier ?? i18next.t("routing.summary.any"),
    departmentName: team?.departmentName ?? department?.name ?? i18next.t("routing.summary.anyDepartment"),
    teamName: team?.name ?? i18next.t("routing.summary.autoTeam"),
    skillGroupCode: humanTarget.targetSkillGroupCode ?? "-",
    aiAgentId: readAiAgentId(rule) ?? null,
    aiStrategy: i18next.t(`routing.options.strategy.${readAiAssignmentStrategy(rule)}`, { defaultValue: STRATEGY_OPTIONS.find((item) => item.value === readAiAssignmentStrategy(rule))?.labelKey ?? readAiAssignmentStrategy(rule) }),
    strategy: i18next.t(`routing.options.strategy.${humanTarget.assignmentStrategy}`, { defaultValue: STRATEGY_OPTIONS.find((item) => item.value === humanTarget.assignmentStrategy)?.labelKey ?? humanTarget.assignmentStrategy }),
    fallbackSkillGroupCode: fallback.fallbackSkillGroupCode ?? i18next.t("routing.summary.reuseHumanTarget"),
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
      ...(values.channelId ? { channelId: values.channelId } : {}),
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
