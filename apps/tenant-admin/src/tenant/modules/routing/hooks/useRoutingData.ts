/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 第一阶段智能调度规则的数据加载与提交逻辑。
 */

import { message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";

import {
  createRoutingRule,
  deleteRoutingRule,
  listChannelConfigs,
  listDepartments,
  listRoutingRules,
  listTeams,
  patchRoutingRule
} from "../../../api";
import type { ChannelConfig, DepartmentItem, RoutingRule, TeamItem } from "../../../types";
import { buildRulePayload } from "../helpers";
import type { RuleFormValues } from "../types";

export function useRoutingData() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ruleRows, channelRows, departmentRows, teamRows] = await Promise.all([
        listRoutingRules(),
        listChannelConfigs(),
        listDepartments(),
        listTeams()
      ]);
      setRules(ruleRows);
      setChannels(channelRows);
      setDepartments(departmentRows);
      setTeams(teamRows);
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

  return {
    rules,
    channels,
    departments,
    teams,
    loading,
    saving,
    error,
    load,
    submitRule,
    removeRule
  };
}
