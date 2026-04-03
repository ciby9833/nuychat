/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 提供第一阶段智能调度规则的读写与摘要能力。
 */

import type { ChannelConfig, DepartmentItem, RoutingRule, TeamItem } from "../../types";
import i18next from "i18next";
import type { RuleFormValues } from "./types";
import { AI_STRATEGY_OPTIONS, EXECUTION_MODE_OPTIONS, STRATEGY_OPTIONS } from "./types";

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

  return channel.channel_id;
}

export function readServiceTarget(rule: RoutingRule) {
  return {
    targetDepartmentId: rule.actions.serviceTarget?.departmentId,
    targetTeamId: rule.actions.serviceTarget?.teamId
  };
}

export function readExecutionMode(rule: RoutingRule): RuleFormValues["executionMode"] {
  if (rule.actions.executionMode === "human_first" || rule.actions.executionMode === "ai_first" || rule.actions.executionMode === "hybrid") {
    return rule.actions.executionMode;
  }
  return "hybrid";
}

export function readHumanStrategy(rule: RoutingRule): RuleFormValues["assignmentStrategy"] {
  return rule.actions.humanStrategy ?? "balanced_new_case";
}

export function readAiStrategy(rule: RoutingRule): RuleFormValues["aiAssignmentStrategy"] {
  return rule.actions.aiStrategy ?? "least_busy";
}

export function buildRuleSummary(
  rule: RoutingRule,
  departments: DepartmentItem[],
  teams: TeamItem[],
  channels: ChannelConfig[] = []
) {
  const serviceTarget = readServiceTarget(rule);
  const department = departments.find((item) => item.departmentId === serviceTarget.targetDepartmentId);
  const team = teams.find((item) => item.teamId === serviceTarget.targetTeamId);
  const matchedChannel = rule.conditions.channelId
    ? channels.find((item) => item.channel_id === rule.conditions.channelId)
    : undefined;
  const channelTypeLabel = matchedChannel?.channel_type ?? rule.conditions.channelType ?? i18next.t("routing.summary.any");
  const channelInstanceLabel = matchedChannel ? formatChannelInstanceLabel(matchedChannel) : (rule.conditions.channelId ?? null);

  return {
    executionMode: readExecutionMode(rule),
    channel: channelTypeLabel,
    channelInstance: channelInstanceLabel,
    language: rule.conditions.customerLanguage
      ? i18next.t(`routing.options.language.${rule.conditions.customerLanguage}`, { defaultValue: rule.conditions.customerLanguage })
      : i18next.t("routing.summary.any"),
    tier: rule.conditions.customerTier ?? i18next.t("routing.summary.any"),
    departmentName: team?.departmentName ?? department?.name ?? i18next.t("routing.summary.anyDepartment"),
    teamName: team?.name ?? i18next.t("routing.summary.autoTeam"),
    humanStrategy: i18next.t(`routing.options.strategy.${readHumanStrategy(rule)}`, {
      defaultValue: STRATEGY_OPTIONS.find((item) => item.value === readHumanStrategy(rule))?.labelKey ?? readHumanStrategy(rule)
    }),
    aiStrategy: i18next.t(`routing.options.strategy.${readAiStrategy(rule)}`, {
      defaultValue: AI_STRATEGY_OPTIONS.find((item) => item.value === readAiStrategy(rule))?.labelKey ?? readAiStrategy(rule)
    })
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
      serviceTarget: {
        ...(values.targetDepartmentId ? { departmentId: values.targetDepartmentId } : {}),
        ...(values.targetTeamId ? { teamId: values.targetTeamId } : {})
      },
      humanStrategy: values.assignmentStrategy,
      aiStrategy: values.aiAssignmentStrategy
    },
    isActive: values.isActive
  };
}

export function getExecutionModeLabel(mode: RuleFormValues["executionMode"]) {
  const option = EXECUTION_MODE_OPTIONS.find((item) => item.value === mode);
  if (!option) return mode;
  if (mode === "hybrid") return i18next.t("routing.options.executionMode.hybrid_smart");
  if (mode === "human_first") return i18next.t("routing.options.executionMode.human_preferred");
  if (mode === "ai_first") return i18next.t("routing.options.executionMode.ai_preferred");
  return option.labelKey;
}
