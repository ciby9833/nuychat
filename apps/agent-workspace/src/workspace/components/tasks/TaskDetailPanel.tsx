/**
 * 功能名称: 任务详情与处理面板
 * 菜单路径: 座席工作台 / 任务 / 中间任务详情
 * 文件职责: 展示任务说明、来源消息和处理协作记录，作为任务工作台的中间信息列。
 * 交互页面:
 * - ./TasksWorkspace.tsx: 任务工作台主容器，提供数据加载和动作回写。
 */

import { useTranslation } from "react-i18next";

import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { MyTaskListItem, TicketDetail } from "../../types";
import { shortTime } from "../../utils";

type TaskDetailPanelProps = {
  task: MyTaskListItem | null;
  detail: TicketDetail | null;
  loading: boolean;
};

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const { t } = useTranslation();
  const { task, detail, loading } = props;

  const effectiveTask = detail?.task ?? task;

  if (!task) {
    return (
      <section className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 text-center text-sm text-slate-400">
        {t("tasksWorkspace.detail.empty")}
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
      <div className="shrink-0 border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,#eff6ff_0%,#ffffff_38%)] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-950">{effectiveTask?.title}</div>
            <div className="mt-1 text-sm text-slate-500">
              {task.customerName ?? task.customerRef ?? t("tasksWorkspace.detail.unknownCustomer")}
              {task.caseTitle ? ` · ${task.caseTitle}` : ""}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge
            variant={effectiveTask?.status === "in_progress" ? "info" : effectiveTask?.status === "done" ? "success" : "outline"}
            className="px-2.5 py-1 text-[11px]"
          >
            {t(`tasksWorkspace.status.${effectiveTask?.status ?? task.status}`)}
          </Badge>
          <Badge variant="info" className="px-2.5 py-1 text-[11px]">
            {t(`tasksWorkspace.priority.${effectiveTask?.priority ?? task.priority}`)}
          </Badge>
          {effectiveTask?.requiresCustomerReply ? (
            <Badge variant="warning" className="px-2.5 py-1 text-[11px]">
              {effectiveTask.customerReplyStatus
                ? t(`tasksWorkspace.replyStatus.${effectiveTask.customerReplyStatus}`)
                : t("tasksWorkspace.replyStatus.pending")}
            </Badge>
          ) : null}
          {task.assigneeName ? (
            <Badge variant="outline" className="px-2.5 py-1 text-[11px]">
              {t("tasksWorkspace.detail.assignee", {
                name: `${task.assigneeName}${task.assigneeEmployeeNo ? ` #${task.assigneeEmployeeNo}` : ""}`
              })}
            </Badge>
          ) : null}
          {task.slaDeadlineAt ? (
            <Badge variant="outline" className="px-2.5 py-1 text-[11px]">
              {t("tasksWorkspace.detail.dueAt", { time: shortTime(task.slaDeadlineAt) })}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="text-sm text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500 align-[-2px]" />
            <span className="ml-2">{t("tasksWorkspace.detail.loading")}</span>
          </div>
        ) : null}

        {effectiveTask?.description ? (
          <Card className="border-slate-200/80 bg-slate-50/70 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.taskDescription")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-slate-700">
              {effectiveTask.description}
            </CardContent>
          </Card>
        ) : null}

        {effectiveTask?.sourceMessagePreview ? (
          <Card className="border-blue-100 bg-blue-50/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.sourceMessage")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-slate-700">
              {effectiveTask.sourceMessagePreview}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200/80 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.collaboration")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
          <div className="flex flex-col gap-2">
            {(detail?.comments ?? []).map((comment) => (
              <div key={comment.noteId} className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">
                    {comment.authorName || comment.authorType}
                    {comment.authorEmployeeNo ? ` #${comment.authorEmployeeNo}` : ""}
                  </div>
                  <div className="text-[11px] text-slate-400">{shortTime(comment.createdAt)}</div>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{comment.body}</div>
              </div>
            ))}
            {(detail?.comments?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                {t("tasksWorkspace.detail.collaborationEmpty")}
              </div>
            ) : null}
          </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
