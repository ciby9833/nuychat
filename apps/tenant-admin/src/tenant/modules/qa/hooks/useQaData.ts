/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理
 * 文件职责: 负责质检记录、评分规则、候选会话、坐席列表加载，以及新建/发布/规则更新动作。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../modals/QaCreateModal.tsx
 * - ../modals/QaRulesModal.tsx
 * - ../../../api
 */

import { Form, message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createQaReview,
  listAgents,
  listQaConversations,
  listQaReviews,
  listQaScoringRules,
  patchQaReview,
  updateQaScoringRules
} from "../../../api";
import type {
  AgentProfile,
  QaConversationOption,
  QaCreateFormValues,
  QaReviewListResponse,
  QaReviewItem,
  QaRulesFormValues,
  QaScoringRuleItem,
  ReviewFilter
} from "../types";

export function useQaData() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviews, setReviews] = useState<QaReviewListResponse | null>(null);
  const [rules, setRules] = useState<QaScoringRuleItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [conversations, setConversations] = useState<QaConversationOption[]>([]);
  const [filters, setFilters] = useState<ReviewFilter>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [createForm] = Form.useForm<QaCreateFormValues>();
  const [rulesForm] = Form.useForm<QaRulesFormValues>();

  const load = useCallback(async (nextFilters: ReviewFilter = filters) => {
    setLoading(true);
    try {
      const [qaReviews, qaRules, qaConversations, agentList] = await Promise.all([
        listQaReviews({ ...nextFilters, page: 1, pageSize: 20 }),
        listQaScoringRules(),
        listQaConversations({ limit: 50 }),
        listAgents()
      ]);
      setReviews(qaReviews);
      setRules(qaRules);
      setConversations(qaConversations);
      setAgents(agentList);
    } catch (err) {
      void message.error(i18next.t("qaModule.messages.loadFailed", { message: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const averageScore = useMemo(() => {
    const items = reviews?.items ?? [];
    if (items.length === 0) return 0;
    return Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  }, [reviews]);

  const openCreate = useCallback(() => {
    const firstAvailable = conversations.find((item) => !item.reviewed);
    createForm.setFieldsValue({
      conversationId: firstAvailable?.conversationId,
      caseId: firstAvailable?.caseId,
      score: 80,
      tags: "",
      note: "",
      status: "published"
    });
    setCreateOpen(true);
  }, [conversations, createForm]);

  const submitCreate = useCallback(async () => {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await createQaReview({
        conversationId: values.conversationId,
        caseId: values.caseId,
        score: values.score,
        tags: values.tags ? values.tags.split(",").map((value) => value.trim()).filter(Boolean) : [],
        note: values.note,
        status: values.status
      });
      void message.success(i18next.t("qaModule.messages.reviewSaved"));
      setCreateOpen(false);
      await load(filters);
    } catch (err) {
      void message.error(i18next.t("qaModule.messages.saveFailed", { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  }, [createForm, filters, load]);

  const openRules = useCallback(() => {
    rulesForm.setFieldsValue({
      rules: rules.map((rule) => ({ code: rule.code, name: rule.name, weight: rule.weight, isActive: rule.isActive }))
    });
    setRulesOpen(true);
  }, [rules, rulesForm]);

  const submitRules = useCallback(async () => {
    const values = await rulesForm.validateFields();
    setSaving(true);
    try {
      await updateQaScoringRules(
        values.rules.map((item, index) => ({
          code: item.code.trim().toLowerCase(),
          name: item.name.trim(),
          weight: Number(item.weight),
          isActive: item.isActive,
          sortOrder: (index + 1) * 10
        }))
      );
      void message.success(i18next.t("qaModule.messages.rulesUpdated"));
      setRulesOpen(false);
      await load(filters);
    } catch (err) {
      void message.error(i18next.t("qaModule.messages.updateFailed", { message: (err as Error).message }));
    } finally {
      setSaving(false);
    }
  }, [filters, load, rulesForm]);

  const toggleStatus = useCallback(async (row: QaReviewItem) => {
    try {
      await patchQaReview(row.reviewId, { status: row.status === "draft" ? "published" : "draft" });
      await load(filters);
    } catch (err) {
      void message.error(i18next.t("qaModule.messages.statusUpdateFailed", { message: (err as Error).message }));
    }
  }, [filters, load]);

  const loadReviewPage = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const next = await listQaReviews({ ...filters, page, pageSize });
      setReviews(next);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  return {
    loading,
    saving,
    reviews,
    rules,
    agents,
    conversations,
    filters,
    createOpen,
    rulesOpen,
    createForm,
    rulesForm,
    averageScore,
    setFilters,
    setCreateOpen,
    setRulesOpen,
    load,
    openCreate,
    submitCreate,
    openRules,
    submitRules,
    toggleStatus,
    loadReviewPage
  };
}
