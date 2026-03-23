import { message } from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  createModule,
  createRoutingRule,
  createSkillGroup,
  deleteModule,
  deleteRoutingRule,
  deleteSkillGroup,
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
import type { DepartmentItem, ModuleItem, RoutingRule, SkillGroup, TeamItem, TenantAIAgent } from "../../../types";
import { buildRulePayload } from "../helpers";
import type { ModuleFormValues, RuleFormValues, SkillGroupFormValues } from "../types";

export function useRoutingData() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [groups, setGroups] = useState<SkillGroup[]>([]);
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
      const [moduleRows, ruleRows, groupRows, departmentRows, teamRows, aiAgentRows] = await Promise.all([
        listModules(),
        listRoutingRules(),
        listSkillGroups(),
        listDepartments(),
        listTeams(),
        listTenantAIAgents()
      ]);
      setModules(moduleRows);
      setRules(ruleRows);
      setGroups(groupRows);
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
        message.success("调度规则已更新");
      } else {
        await createRoutingRule(payload);
        message.success("调度规则已创建");
      }
      await load();
      return true;
    } catch (err) {
      const errorMessage = (err as Error).message;
      if (editingRule && /404|not found|不存在/i.test(errorMessage)) {
        await load();
        message.error("当前规则不存在或已不属于，列表已刷新，请重新选择后再试。");
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
      message.success("调度规则已删除");
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
        message.success("模块已更新");
      } else {
        await createModule(values);
        message.success("模块已创建");
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
      message.success("模块已删除");
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
        message.success("技能组已更新");
      } else {
        await createSkillGroup(values);
        message.success("技能组已创建");
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
      message.success("技能组已删除");
      await load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return {
    modules, rules, groups, departments, teams, aiAgents,
    loading, saving, error,
    load, submitRule, removeRule,
    submitModule, removeModule,
    submitSkillGroup, removeSkillGroup
  };
}
