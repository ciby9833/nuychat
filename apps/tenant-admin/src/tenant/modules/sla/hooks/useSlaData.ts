import { Form, message } from "antd";
import dayjs from "dayjs";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getSlaDefaultConfig, listSlaBreaches, patchSlaBreachStatus, updateSlaDefaultConfig } from "../../../api";
import type { BreachFilter, SlaBreachItem, SlaBreachListResponse, SlaDefaultConfig, SlaDefaultConfigFormValues } from "../types";

export function useSlaData() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultConfig, setDefaultConfig] = useState<SlaDefaultConfig | null>(null);
  const [breaches, setBreaches] = useState<SlaBreachListResponse | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [filters, setFilters] = useState<BreachFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [configForm] = Form.useForm<SlaDefaultConfigFormValues>();

  const syncForm = useCallback((config: SlaDefaultConfig) => {
    configForm.setFieldsValue({
      firstResponseTargetSec: config.firstResponseTargetSec,
      assignmentAcceptTargetSec: config.assignmentAcceptTargetSec,
      subsequentResponseTargetSec: config.subsequentResponseTargetSec,
      subsequentResponseReassignWhen: config.subsequentResponseReassignWhen,
      followUpTargetSec: config.followUpTargetSec,
      followUpCloseMode: config.followUpCloseMode
    });
  }, [configForm]);

  const load = useCallback(async (nextFilters: BreachFilter = filters) => {
    setLoading(true);
    try {
      const [nextConfig, nextBreaches] = await Promise.all([
        getSlaDefaultConfig(),
        listSlaBreaches({ ...nextFilters, page: 1, pageSize: 20 })
      ]);
      setDefaultConfig(nextConfig);
      syncForm(nextConfig);
      setBreaches(nextBreaches);
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.loadFailed", { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [filters, syncForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => breaches?.summary ?? { total: 0, open: 0, acknowledged: 0, resolved: 0, avgBreachSec: 0 },
    [breaches]
  );

  const onSaveConfig = async () => {
    const values = await configForm.validateFields();
    if (!defaultConfig) return;
    setSaving(true);
    try {
      const saved = await updateSlaDefaultConfig({
        firstResponseTargetSec: values.firstResponseTargetSec,
        assignmentAcceptTargetSec: values.assignmentAcceptTargetSec,
        subsequentResponseTargetSec: values.subsequentResponseTargetSec,
        subsequentResponseReassignWhen: values.subsequentResponseReassignWhen,
        followUpTargetSec: values.followUpTargetSec,
        resolutionTargetSec: defaultConfig.resolutionTargetSec,
        firstResponseAction: defaultConfig.firstResponseAction,
        assignmentAcceptAction: defaultConfig.assignmentAcceptAction,
        followUpAction: defaultConfig.followUpAction,
        followUpCloseMode: values.followUpCloseMode,
        resolutionAction: defaultConfig.resolutionAction
      });
      setDefaultConfig(saved);
      syncForm(saved);
      setEditorOpen(false);
      void message.success(i18next.t("slaModule.messages.configUpdated"));
    } catch (error) {
      void message.error(i18next.t("slaModule.messages.saveFailed", { message: (error as Error).message }));
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
    defaultConfig,
    breaches,
    filters,
    summary,
    editorOpen,
    configForm,
    setEditorOpen,
    setFilters,
    load,
    onSaveConfig,
    onUpdateBreachStatus,
    loadBreachPage
  };
}
