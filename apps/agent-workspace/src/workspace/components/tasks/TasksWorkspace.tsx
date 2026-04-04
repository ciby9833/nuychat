/**
 * 功能名称: 任务工作台
 * 菜单路径: 座席工作台 / 任务
 * 文件职责: 组织任务列表、任务详情与关联会话预览弹窗，形成独立于消息界面的任务处理工作区。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 任务路由入口。
 * - ./TaskListPanel.tsx: 左侧任务卡片列表。
 * - ./TaskDetailPanel.tsx: 中间任务详情与处理动作。
 * - ./TaskConversationPreviewModal.tsx: 关联会话上下文预览弹窗。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { addConversationTaskComment, getConversationPreview, getConversationTaskDetail, patchTicket } from "../../api";
import type { WorkspaceDashboardVM } from "../../hooks/useWorkspaceDashboard";
import type { ConversationPreviewDetail, MyTaskListItem, TicketDetail } from "../../types";
import { TaskActionPanel } from "./TaskActionPanel";
import { TaskConversationPreviewModal } from "./TaskConversationPreviewModal";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskListPanel } from "./TaskListPanel";

type TasksWorkspaceProps = {
  vm: WorkspaceDashboardVM;
};

export function TasksWorkspace({ vm }: TasksWorkspaceProps) {
  const { t } = useTranslation();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailById, setTaskDetailById] = useState<Record<string, TicketDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDetail, setPreviewDetail] = useState<ConversationPreviewDetail | null>(null);

  const visibleTasks = vm.filteredMyTasks;
  const selectedTask = useMemo(
    () => visibleTasks.find((task) => task.ticketId === selectedTaskId) ?? null,
    [selectedTaskId, visibleTasks]
  );

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleTasks.some((task) => task.ticketId === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0]?.ticketId ?? null);
    }
  }, [selectedTaskId, visibleTasks]);

  useEffect(() => {
    if (!vm.session || !selectedTask?.conversationId) return;
    if (taskDetailById[selectedTask.ticketId]) return;

    setDetailLoadingId(selectedTask.ticketId);
    void getConversationTaskDetail(selectedTask.conversationId, selectedTask.ticketId, vm.session)
      .then((detail) => {
        setTaskDetailById((current) => ({ ...current, [selectedTask.ticketId]: detail }));
      })
      .finally(() => {
        setDetailLoadingId((current) => (current === selectedTask.ticketId ? null : current));
      });
  }, [selectedTask, taskDetailById, vm.session]);

  const refreshTask = async (task: MyTaskListItem) => {
    if (!vm.session || !task.conversationId) return;
    const detail = await getConversationTaskDetail(task.conversationId, task.ticketId, vm.session);
    setTaskDetailById((current) => ({ ...current, [task.ticketId]: detail }));
    await vm.loadMyTasks();
  };

  const handlePatchTask = async (
    task: MyTaskListItem,
    input: {
      status?: string;
      requiresCustomerReply?: boolean;
      customerReplyStatus?: "pending" | "sent" | "waived" | null;
      sendCustomerReply?: boolean;
      customerReplyBody?: string | null;
    }
  ) => {
    if (!vm.session || !task.conversationId) return;
    setActingTaskId(task.ticketId);
    try {
      const nextTask = await patchTicket(task.ticketId, { conversationId: task.conversationId, ...input }, vm.session);
      setTaskDetailById((current) => {
        const existing = current[task.ticketId];
        if (!existing) return current;
        return {
          ...current,
          [task.ticketId]: {
            ...existing,
            task: nextTask
          }
        };
      });
      await refreshTask(task);
    } finally {
      setActingTaskId(null);
    }
  };

  const handleAddComment = async (task: MyTaskListItem, body: string) => {
    if (!vm.session || !task.conversationId) return;
    setActingTaskId(task.ticketId);
    try {
      await addConversationTaskComment(task.conversationId, task.ticketId, body, vm.session);
      await refreshTask(task);
    } finally {
      setActingTaskId(null);
    }
  };

  const handleOpenPreview = async (task: MyTaskListItem) => {
    if (!vm.session || !task.conversationId) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const detail = await getConversationPreview(task.conversationId, vm.session);
      setPreviewDetail(detail);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <section className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,#f8fbff_0%,#f1f5f9_42%,#eef2ff_100%)]">
        <div className="shrink-0 border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur">
          <div className="text-base font-semibold text-slate-950">{t("tasksWorkspace.pageTitle")}</div>
        </div>

        <div className="min-h-0 flex-1 p-4">
          <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)_340px] gap-4">
            <TaskListPanel
              tasks={visibleTasks}
              loading={vm.myTasksLoading}
              selectedTaskId={selectedTaskId}
              filters={{
                statuses: vm.taskStatusFilter,
                taskQuery: vm.taskSearchText,
                customerQuery: vm.taskCustomerSearchText,
                recentDays: vm.taskRecentDays
              }}
              onStatusToggle={(status) => {
                vm.setTaskStatusFilter((current: Array<"open" | "in_progress" | "done" | "cancelled">) => {
                  const exists = current.includes(status);
                  if (exists) {
                    const next = current.filter((item) => item !== status);
                    return next.length > 0 ? next : current;
                  }
                  return [...current, status];
                });
              }}
              onTaskQueryChange={vm.setTaskSearchText}
              onCustomerQueryChange={vm.setTaskCustomerSearchText}
              onRecentDaysChange={vm.setTaskRecentDays}
              onSelectTask={setSelectedTaskId}
            />

            <TaskDetailPanel
              task={selectedTask}
              detail={selectedTask ? taskDetailById[selectedTask.ticketId] ?? null : null}
              loading={detailLoadingId === selectedTask?.ticketId}
            />

            <TaskActionPanel
              task={selectedTask}
              detail={selectedTask ? taskDetailById[selectedTask.ticketId] ?? null : null}
              acting={actingTaskId === selectedTask?.ticketId}
              onOpenPreview={handleOpenPreview}
              onPatchTask={handlePatchTask}
              onAddComment={handleAddComment}
            />
          </div>
        </div>
      </section>

      <TaskConversationPreviewModal
        open={previewOpen}
        loading={previewLoading}
        detail={previewDetail}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDetail(null);
        }}
      />
    </>
  );
}
