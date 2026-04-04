/**
 * 功能名称: 任务列表面板
 * 菜单路径: 座席工作台 / 任务 / 左侧任务列表
 * 文件职责: 按状态分组展示任务卡片，突出客户、优先级、对客回复状态和最近更新时间。
 * 交互页面:
 * - ./TasksWorkspace.tsx: 任务工作台主容器，传入任务数据和选中状态。
 * - ./TaskDetailPanel.tsx: 点击任务卡片后在中间面板处理任务。
 */

import type { MyTaskListItem } from "../../types";
import { shortTime } from "../../utils";
import { cn } from "../../../lib/utils";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { TASK_STATUS_GROUPS } from "./task-utils";

type TaskListPanelProps = {
  tasks: MyTaskListItem[];
  loading: boolean;
  selectedTaskId: string | null;
  filters: {
    statuses: string[];
    taskQuery: string;
    customerQuery: string;
    recentDays: number;
  };
  onStatusToggle: (value: "open" | "in_progress" | "done" | "cancelled") => void;
  onTaskQueryChange: (value: string) => void;
  onCustomerQueryChange: (value: string) => void;
  onRecentDaysChange: (value: number) => void;
  onSelectTask: (taskId: string) => void;
};

export function TaskListPanel(props: TaskListPanelProps) {
  const { t } = useTranslation();
  const {
    tasks,
    loading,
    selectedTaskId,
    filters,
    onStatusToggle,
    onTaskQueryChange,
    onCustomerQueryChange,
    onRecentDaysChange,
    onSelectTask
  } = props;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3">
      <Card className="overflow-hidden border-slate-200/80 bg-white/90 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle>{t("tasksWorkspace.listTitle")}</CardTitle>
          <CardDescription className="mt-1">{t("tasksWorkspace.listSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
          <select
            value={filters.recentDays}
            onChange={(e) => onRecentDaysChange(Number(e.target.value))}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/20"
          >
            <option value={3}>{t("tasksWorkspace.filters.recent3Days")}</option>
            <option value={7}>{t("tasksWorkspace.filters.recent7Days")}</option>
            <option value={30}>{t("tasksWorkspace.filters.recent30Days")}</option>
            <option value={9999}>{t("tasksWorkspace.filters.allTime")}</option>
          </select>
          <Input
            value={filters.taskQuery}
            onChange={(e) => onTaskQueryChange(e.target.value)}
            placeholder={t("tasksWorkspace.filters.taskPlaceholder")}
          />
          <Input
            value={filters.customerQuery}
            onChange={(e) => onCustomerQueryChange(e.target.value)}
            placeholder={t("tasksWorkspace.filters.customerPlaceholder")}
          />
          </div>
          <div className="flex flex-wrap gap-2">
          {TASK_STATUS_GROUPS.map((group) => {
            const active = filters.statuses.includes(group.key);
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onStatusToggle(group.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-700"
                )}
              >
                {t(`tasksWorkspace.status.${group.key}`)}
              </button>
            );
          })}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="min-h-0 flex-1 overflow-y-auto bg-transparent px-3 py-3">
        {loading ? (
          <div className="px-2 py-6 text-sm text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500 align-[-2px]" />
            <span className="ml-2">{t("tasksWorkspace.loading")}</span>
          </div>
        ) : null}
        {!loading && tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
            {t("tasksWorkspace.empty")}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {TASK_STATUS_GROUPS.map((group) => {
            const groupedTasks = tasks.filter((task) => task.status === group.key);
            if (groupedTasks.length === 0) return null;

            return (
              <section key={group.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(`tasksWorkspace.status.${group.key}`)}</div>
                  <Badge variant="outline" className="px-2 py-1 text-[11px]">{groupedTasks.length}</Badge>
                </div>

                <div className="flex flex-col gap-2">
                  {groupedTasks.map((task) => {
                    const selected = task.ticketId === selectedTaskId;
                    const replyStatus = task.requiresCustomerReply && task.customerReplyStatus
                      ? t(`tasksWorkspace.replyStatus.${task.customerReplyStatus}`)
                      : null;
                    return (
                      <button
                        key={task.ticketId}
                        type="button"
                        onClick={() => onSelectTask(task.ticketId)}
                        className={cn(
                          "rounded-[24px] border px-4 py-4 text-left shadow-sm transition-all",
                          group.tone,
                          selected ? "border-blue-300 ring-2 ring-blue-500/10 shadow-blue-100" : "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {task.customerName ?? task.customerRef ?? t("tasksWorkspace.detail.unknownCustomer")}
                              {task.caseTitle ? ` · ${task.caseTitle}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-[11px] text-slate-400">{shortTime(task.updatedAt)}</div>
                        </div>

                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                          {task.description ?? task.conversationLastMessagePreview ?? task.sourceMessagePreview ?? t("tasksWorkspace.detail.collaborationEmpty")}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge variant="info" className="px-2 py-1 text-[10px]">
                            {t(`tasksWorkspace.priority.${task.priority}`)}
                          </Badge>
                          {replyStatus ? (
                            <Badge variant="warning" className="px-2 py-1 text-[10px]">
                              {replyStatus}
                            </Badge>
                          ) : null}
                          {task.channelType ? (
                            <Badge variant="outline" className="px-2 py-1 text-[10px]">
                              {task.channelType.toUpperCase()}
                            </Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      </Card>
    </aside>
  );
}
