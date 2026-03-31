/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理
 * 文件职责: 负责 SLA 定义、触发策略、违约数据加载，以及创建/编辑/启停/状态更新操作。
 * 主要交互文件:
 * - ../SlaTab.tsx: 消费模块主数据与各类操作。
 * - ../modals/SlaDefinitionModal.tsx: 消费 SLA 定义表单和保存动作。
 * - ../modals/SlaTriggerPolicyModal.tsx: 消费触发策略表单和保存动作。
 * - ../../../api.ts: 提供 SLA 定义、触发策略、违约记录相关接口能力。
 */

import { Form, message } from "antd";
import dayjs from "dayjs";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createSlaDefinition,
  createSlaTriggerPolicy,
  listSlaBreaches,
  listSlaDefinitions,
  listSlaTriggerPolicies,
  patchSlaBreachStatus,
  patchSlaDefinition,
  patchSlaTriggerPolicy
} from "../../../api";
import type {
  BreachFilter,
  SlaBreachItem,
  SlaBreachListResponse,
  SlaDefinitionFormValues,
  SlaDefinitionItem,
  SlaTriggerPolicyFormValues,
  SlaTriggerPolicyItem
} from "../types";

export function useSlaData() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [definitions, setDefinitions] = useState<SlaDefinitionItem[]>([]);
  const [triggerPolicies, setTriggerPolicies] = useState<SlaTriggerPolicyItem[]>([]);
  const [breaches, setBreaches] = useState<SlaBreachListResponse | null>(null);
  const [filters, setFilters] = useState<BreachFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<SlaDefinitionItem | null>(null);
  const [editingTriggerPolicy, setEditingTriggerPolicy] = useState<SlaTriggerPolicyItem | null>(null);
  const [definitionForm] = Form.useForm<SlaDefinitionFormValues>();
  const [triggerForm] = Form.useForm<SlaTriggerPolicyFormValues>();

  const load = useCallback(async (nextFilters: BreachFilter = filters) => {
    setLoading(true);
    try {
      const [nextDefinitions, nextTriggerPolicies, nextBreaches] = await Promise.all([
        listSlaDefinitions(),
        listSlaTriggerPolicies(),
        listSlaBreaches({ ...nextFilters, page: 1, pageSize: 20 })
      ]);
      setDefinitions(nextDefinitions);
      setTriggerPolicies(nextTriggerPolicies);
      setBreaches(nextBreaches);
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.loadFailed", { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => breaches?.summary ?? { total: 0, open: 0, acknowledged: 0, resolved: 0, avgBreachSec: 0 },
    [breaches]
  );

  const openCreateDefinition = () => {
    setEditingDefinition(null);
    definitionForm.setFieldsValue({
      name: "",
      priority: "standard",
      firstResponseTargetSec: 300,
      assignmentAcceptTargetSec: 300,
      followUpTargetSec: 1800,
      resolutionTargetSec: 7200
    });
    setDefinitionOpen(true);
  };

  const openEditDefinition = (item: SlaDefinitionItem) => {
    setEditingDefinition(item);
    definitionForm.setFieldsValue({
      name: item.name,
      priority: item.priority,
      firstResponseTargetSec: item.firstResponseTargetSec,
      assignmentAcceptTargetSec: item.assignmentAcceptTargetSec,
      followUpTargetSec: item.followUpTargetSec,
      resolutionTargetSec: item.resolutionTargetSec
    });
    setDefinitionOpen(true);
  };

  const openCreateTriggerPolicy = () => {
    setEditingTriggerPolicy(null);
    triggerForm.setFieldsValue({
      name: "",
      priority: "standard",
      firstResponseActions: [{ type: "alert" }],
      assignmentAcceptActions: [{ type: "alert" }, { type: "reassign" }],
      followUpActions: [{ type: "alert" }],
      resolutionActions: [{ type: "alert" }]
    });
    setTriggerOpen(true);
  };

  const openEditTriggerPolicy = (item: SlaTriggerPolicyItem) => {
    setEditingTriggerPolicy(item);
    triggerForm.setFieldsValue({
      name: item.name,
      priority: item.priority,
      firstResponseActions: item.firstResponseActions,
      assignmentAcceptActions: item.assignmentAcceptActions,
      followUpActions: item.followUpActions,
      resolutionActions: item.resolutionActions
    });
    setTriggerOpen(true);
  };

  const onSaveDefinition = async () => {
    const values = await definitionForm.validateFields();
    setSaving(true);
    try {
      if (editingDefinition) {
        await patchSlaDefinition(editingDefinition.definitionId, values);
        void message.success(i18next.t("slaModule.messages.definitionUpdated"));
      } else {
        await createSlaDefinition(values);
        void message.success(i18next.t("slaModule.messages.definitionCreated"));
      }
      setDefinitionOpen(false);
      setEditingDefinition(null);
      await load();
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.saveFailed", { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const onSaveTriggerPolicy = async () => {
    const values = await triggerForm.validateFields();
    setSaving(true);
    try {
      if (editingTriggerPolicy) {
        await patchSlaTriggerPolicy(editingTriggerPolicy.triggerPolicyId, values);
        void message.success(i18next.t("slaModule.messages.triggerUpdated"));
      } else {
        await createSlaTriggerPolicy(values);
        void message.success(i18next.t("slaModule.messages.triggerCreated"));
      }
      setTriggerOpen(false);
      setEditingTriggerPolicy(null);
      await load();
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.saveFailed", { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const onToggleDefinition = async (item: SlaDefinitionItem) => {
    setSaving(true);
    try {
      await patchSlaDefinition(item.definitionId, { isActive: !item.isActive });
      await load();
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.updateFailed", { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const onToggleTriggerPolicy = async (item: SlaTriggerPolicyItem) => {
    setSaving(true);
    try {
      await patchSlaTriggerPolicy(item.triggerPolicyId, { isActive: !item.isActive });
      await load();
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.updateFailed", { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const onUpdateBreachStatus = async (item: SlaBreachItem, status: "open" | "acknowledged" | "resolved") => {
    try {
      await patchSlaBreachStatus(item.breachId, status);
      await load(filters);
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.breachStatusFailed", { message: (error as Error).message }));
    }
  };

  const loadBreachPage = async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const data = await listSlaBreaches({ ...filters, page, pageSize });
      setBreaches(data);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    saving,
    definitions,
    triggerPolicies,
    breaches,
    filters,
    summary,
    definitionOpen,
    triggerOpen,
    editingDefinition,
    editingTriggerPolicy,
    definitionForm,
    triggerForm,
    setFilters,
    setDefinitionOpen,
    setTriggerOpen,
    setEditingDefinition,
    setEditingTriggerPolicy,
    load,
    openCreateDefinition,
    openEditDefinition,
    openCreateTriggerPolicy,
    openEditTriggerPolicy,
    onSaveDefinition,
    onSaveTriggerPolicy,
    onToggleDefinition,
    onToggleTriggerPolicy,
    onUpdateBreachStatus,
    loadBreachPage
  };
}
