import { App } from "antd";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getQaCaseDetail,
  getQaDashboardWithFilters,
  getQaGuideline,
  listAgents,
  listQaTasks,
  submitQaCaseReview,
  updateQaGuideline
} from "../../../api";
import type { AgentProfile, QaCaseDetail, QaDashboardData, QaGuideline, QaQueueFilters, QaReviewFormValues, QaTaskItem } from "../types";

export function useQaWorkbench() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guidelineSaving, setGuidelineSaving] = useState(false);
  const [dashboard, setDashboard] = useState<QaDashboardData | null>(null);
  const [guideline, setGuideline] = useState<QaGuideline | null>(null);
  const [tasks, setTasks] = useState<QaTaskItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [filters, setFilters] = useState<QaQueueFilters>({
    search: "",
    queueType: "risk",
    agentIds: [],
    dateRange: [null, null]
  });
  const [selectedTask, setSelectedTask] = useState<QaTaskItem | null>(null);
  const [detail, setDetail] = useState<QaCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [guidelineOpen, setGuidelineOpen] = useState(false);

  const load = useCallback(async (nextFilters: QaQueueFilters) => {
    const dateFrom = nextFilters.dateRange[0]?.format("YYYY-MM-DD");
    const dateTo = nextFilters.dateRange[1]?.format("YYYY-MM-DD");
    setDashboardLoading(true);
    setQueueLoading(true);
    try {
      const [dashboardData, guidelineData, taskData, agentList] = await Promise.all([
        getQaDashboardWithFilters({
          dateFrom,
          dateTo,
          agentIds: nextFilters.agentIds
        }),
        getQaGuideline(),
        listQaTasks({
          search: nextFilters.search.trim() || undefined,
          limit: 200,
          dateFrom,
          dateTo,
          agentIds: nextFilters.agentIds
        }),
        listAgents()
      ]);
      setDashboard(dashboardData);
      setGuideline(guidelineData);
      setTasks(taskData.items);
      setAgents(agentList);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setDashboardLoading(false);
      setQueueLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load(filters);
    // initial load only; queue tab switching stays local and does not refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCase = useCallback(async (task: QaTaskItem) => {
    setSelectedTask(task);
    setDetailLoading(true);
    try {
      const nextDetail = await getQaCaseDetail(task.caseId);
      setDetail(nextDetail);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  const closeCase = useCallback(() => {
    setSelectedTask(null);
    setDetail(null);
  }, []);

  const submitReview = useCallback(async (values: QaReviewFormValues) => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await submitQaCaseReview(selectedTask.caseId, {
        action: values.action,
        totalScore: values.totalScore,
        verdict: values.verdict,
        tags: values.tags?.split(",").map((item) => item.trim()).filter(Boolean) ?? [],
        summary: values.summary?.trim() || null
      });
      message.success(t("qaModule.messages.reviewSaved"));
      await Promise.all([
        load(filters),
        openCase(selectedTask)
      ]);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [filters, load, message, openCase, selectedTask, t]);

  const saveGuideline = useCallback(async (contentMd: string, name?: string) => {
    setGuidelineSaving(true);
    try {
      const next = await updateQaGuideline({
        name: name?.trim() || guideline?.name || t("qaModule.guideline.defaultName"),
        contentMd
      });
      setGuideline(next);
      setGuidelineOpen(false);
      message.success(t("qaModule.messages.guidelineSaved"));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setGuidelineSaving(false);
    }
  }, [guideline?.name, message, t]);

  const queueCounts = useMemo(() => ({
    risk: dashboard?.riskCaseCount ?? 0,
    sample: dashboard?.sampleCaseCount ?? 0,
    auto_pass: Math.max(0, (dashboard?.todayQaCount ?? 0) - (dashboard?.riskCaseCount ?? 0) - (dashboard?.sampleCaseCount ?? 0)),
    reviewed: tasks.filter((item) => item.humanStatus !== null).length,
    diff: tasks.filter((item) => (item.scoreDiff ?? 0) >= 10).length
  }), [dashboard, tasks]);

  const visibleTasks = useMemo(() => tasks.filter((item) => {
    if (filters.queueType === "reviewed") return item.humanStatus !== null;
    if (filters.queueType === "diff") return (item.scoreDiff ?? 0) >= 10;
    return item.queueType === filters.queueType;
  }), [filters.queueType, tasks]);

  return {
    loading: dashboardLoading || queueLoading,
    dashboardLoading,
    queueLoading,
    saving,
    guidelineSaving,
    dashboard,
    guideline,
    tasks,
    agents,
    filters,
    selectedTask,
    detail,
    detailLoading,
    guidelineOpen,
    queueCounts,
    visibleTasks,
    setFilters,
    setGuidelineOpen,
    load,
    openCase,
    closeCase,
    submitReview,
    saveGuideline
  };
}
