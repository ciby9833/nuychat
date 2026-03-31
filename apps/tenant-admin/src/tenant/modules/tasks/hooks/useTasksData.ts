/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理
 * 文件职责: 负责任务列表、任务详情、坐席列表、筛选状态与评论/更新动作的状态管理。
 * 主要交互文件:
 * - ../TasksTab.tsx
 * - ../components/TasksFilterBar.tsx
 * - ../components/TasksTable.tsx
 * - ../components/TaskDetailPanel.tsx
 * - ../../../api
 */

import { useEffect, useMemo, useState } from "react";

import { addAdminTaskComment, getAdminTaskDetail, listAdminTasks, listAgents, patchAdminTask } from "../../../api";
import type { AdminTaskDetail, AdminTaskItem, AgentProfile, TasksFilters } from "../types";

export function useTasksData() {
  const [items, setItems] = useState<AdminTaskItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [filters, setFilters] = useState<TasksFilters>({});

  const selectedTask = useMemo(
    () => items.find((item) => item.taskId === selectedId) ?? detail?.task ?? null,
    [detail?.task, items, selectedId]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [taskRows, agentRows] = await Promise.all([
        listAdminTasks(filters),
        listAgents()
      ]);
      setItems(taskRows.items);
      setAgents(agentRows);
      const nextSelected = selectedId && taskRows.items.some((item) => item.taskId === selectedId)
        ? selectedId
        : taskRows.items[0]?.taskId ?? null;
      setSelectedId(nextSelected);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters.status, filters.ownerAgentId, filters.search]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getAdminTaskDetail(selectedId).then(setDetail);
  }, [selectedId]);

  const handlePatch = async (patch: { status?: string; assigneeAgentId?: string | null; dueAt?: string | null }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const next = await patchAdminTask(selectedId, patch);
      setDetail(next);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async () => {
    if (!selectedId || !comment.trim()) return;
    setSaving(true);
    try {
      const next = await addAdminTaskComment(selectedId, comment.trim());
      setDetail(next);
      setComment("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return {
    items,
    agents,
    selectedId,
    detail,
    loading,
    saving,
    comment,
    filters,
    selectedTask,
    setSelectedId,
    setComment,
    setFilters,
    load,
    handlePatch,
    handleComment
  };
}
