/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 负责路由规则、模块、技能组及依赖数据的加载、提交与删除逻辑。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../helpers.ts
 * - ../types.ts
 * - ../../../api
 */

import { message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";

import {
  createModule,
  createRoutingRule,
  createSkillGroup,
  deleteModule,
  deleteRoutingRule,
  deleteSkillGroup,
  listChannelConfigs,
  listDepartments,
  listModules,
  listRoutingRules,
  listSkillGroups,
  listTeams,
  listTenantAIAgents,
  patchModule,
  patchRoutingRule,
  patchSkillGroup
} from "../../../api";
import type { ChannelConfig, DepartmentItem, ModuleItem, RoutingRule, SkillGroup, TeamItem, TenantAIAgent } from "../../../types";
import { buildRulePayload } from "../helpers";
import type { ModuleFormValues, RuleFormValues, SkillGroupFormValues } from "../types";

export function useRoutingData() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [aiAgents, setAIAgents] = useState<TenantAIAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [moduleRows, ruleRows, groupRows, channelRows, departmentRows, teamRows, aiAgentRows] = await Promise.all([
        listModules(),
        listRoutingRules(),
        listSkillGroups(),
        listChannelConfigs(),
        listDepartments(),
        listTeams(),
        listTenantAIAgents()
      ]);
      setModules(moduleRows);
      setRules(ruleRows);
      setGroups(groupRows);
      setChannels(channelRows);
      setDepartments(departmentRows);
      setTeams(teamRows);
      setAIAgents(aiAgentRows.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRule = async (values: RuleFormValues, editingRule: RoutingRule | null) => {
    setSaving(true);
    try {
      const payload = buildRulePayload(values);
      if (editingRule) {
        await patchRoutingRule(editingRule.rule_id, payload);
        message.success(i18next.t("routing.messages.ruleUpdated"));
      } else {
        await createRoutingRule(payload);
        message.success(i18next.t("routing.messages.ruleCreated"));
      }
      await load();
      return true;
    } catch (err) {
      const errorMessage = (err as Error).message;
      if (editingRule && /404|not found|不存在/i.test(errorMessage)) {
        await load();
        message.error(i18next.t("routing.messages.ruleMissing"));
        return true;
      }
      message.error(errorMessage);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    setSaving(true);
    try {
      await deleteRoutingRule(ruleId);
      message.success(i18next.t("routing.messages.ruleDeleted"));
      await load();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submitModule = async (values: ModuleFormValues, editingModule: ModuleItem | null) => {
    setSaving(true);
    try {
      if (editingModule) {
        await patchModule(editingModule.moduleId, values);
        message.success(i18next.t("routing.messages.moduleUpdated"));
      } else {
        await createModule(values);
        message.success(i18next.t("routing.messages.moduleCreated"));
      }
      await load();
      return true;
    } catch (err) {
      message.error((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeModule = async (moduleId: string) => {
    try {
      await deleteModule(moduleId);
      message.success(i18next.t("routing.messages.moduleDeleted"));
      await load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitSkillGroup = async (values: SkillGroupFormValues, editingItem: SkillGroup | null) => {
    setSaving(true);
    try {
      if (editingItem) {
        await patchSkillGroup(editingItem.skill_group_id, values);
        message.success(i18next.t("routing.messages.skillGroupUpdated"));
      } else {
        await createSkillGroup(values);
        message.success(i18next.t("routing.messages.skillGroupCreated"));
      }
      await load();
      return true;
    } catch (err) {
      message.error((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeSkillGroup = async (skillGroupId: string) => {
    try {
      await deleteSkillGroup(skillGroupId);
      message.success(i18next.t("routing.messages.skillGroupDeleted"));
      await load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return {
    modules, rules, groups, channels, departments, teams, aiAgents,
    loading, saving, error,
    load, submitRule, removeRule,
    submitModule, removeModule,
    submitSkillGroup, removeSkillGroup
  };
}
