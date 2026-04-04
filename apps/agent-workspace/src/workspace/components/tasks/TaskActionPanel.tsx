/**
 * 功能名称: 任务操作面板
 * 菜单路径: 座席工作台 / 任务 / 右侧操作区
 * 文件职责: 承载任务状态变更、会话预览入口和处理回复输入，所有状态变更都要求二次确认。
 * 交互页面:
 * - ./TasksWorkspace.tsx: 任务工作台主容器，负责传入任务详情和动作回调。
 * - ./TaskConversationPreviewModal.tsx: 从这里触发关联会话预览。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import type { MyTaskListItem, TicketDetail } from "../../types";
import { shortTime } from "../../utils";

type CompletionDraft = {
  sendToCustomer: boolean;
  customerReplyBody: string;
};

type TaskActionPanelProps = {
  task: MyTaskListItem | null;
  detail: TicketDetail | null;
  acting: boolean;
  onOpenPreview: (task: MyTaskListItem) => void;
  onPatchTask: (
    task: MyTaskListItem,
    input: {
      status?: string;
      requiresCustomerReply?: boolean;
      customerReplyStatus?: "pending" | "sent" | "waived" | null;
      sendCustomerReply?: boolean;
      customerReplyBody?: string | null;
    }
  ) => Promise<void>;
  onAddComment: (task: MyTaskListItem, body: string) => Promise<void>;
};

export function TaskActionPanel(props: TaskActionPanelProps) {
  const { t } = useTranslation();
  const { task, detail, acting, onOpenPreview, onPatchTask, onAddComment } = props;
  const [replyDraft, setReplyDraft] = useState("");
  const [completionDraft, setCompletionDraft] = useState<CompletionDraft>({
    sendToCustomer: false,
    customerReplyBody: ""
  });

  const effectiveTask = detail?.task ?? task;

  const confirmAction = async (message: string, action: () => Promise<void>) => {
    if (!window.confirm(message)) return;
    await action();
  };

  useEffect(() => {
    setReplyDraft("");
    setCompletionDraft({
      sendToCustomer: Boolean(effectiveTask?.requiresCustomerReply && effectiveTask.customerReplyStatus !== "sent"),
      customerReplyBody: ""
    });
  }, [effectiveTask?.ticketId, effectiveTask?.requiresCustomerReply, effectiveTask?.customerReplyStatus]);

  if (!task || !effectiveTask) {
    return (
      <section className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 text-center">
        <div className="text-sm text-slate-400">{t("tasksWorkspace.detail.empty")}</div>
      </section>
    );
  }

  const needsReply = Boolean(effectiveTask.requiresCustomerReply && effectiveTask.customerReplyStatus !== "sent");

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <Card className="border-slate-200/80 bg-white/90 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.actions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={effectiveTask.status === "in_progress" ? "info" : effectiveTask.status === "done" ? "success" : "outline"}
              className="px-2.5 py-1 text-[11px]"
            >
              {t(`tasksWorkspace.status.${effectiveTask.status}`)}
            </Badge>
            <Badge variant="info" className="px-2.5 py-1 text-[11px]">
              {t(`tasksWorkspace.priority.${effectiveTask.priority}`)}
            </Badge>
            {effectiveTask.requiresCustomerReply ? (
              <Badge variant="warning" className="px-2.5 py-1 text-[11px]">
                {effectiveTask.customerReplyStatus
                  ? t(`tasksWorkspace.replyStatus.${effectiveTask.customerReplyStatus}`)
                  : t("tasksWorkspace.replyStatus.pending")}
              </Badge>
            ) : null}
            {task.slaDeadlineAt ? (
              <Badge variant="outline" className="px-2.5 py-1 text-[11px]">
                {t("tasksWorkspace.detail.dueAt", { time: shortTime(task.slaDeadlineAt) })}
              </Badge>
            ) : null}
          </div>

          <Button variant="outline" size="sm" onClick={() => onOpenPreview(task)} disabled={!task.conversationId}>
            {t("tasksWorkspace.detail.previewConversation")}
          </Button>

          <div className="flex flex-col gap-2">
            {effectiveTask.status === "open" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={acting}
                onClick={() => void confirmAction(t("tasksWorkspace.detail.confirmStart"), () => onPatchTask(task, { status: "in_progress" }))}
              >
                {t("tasksWorkspace.detail.start")}
              </Button>
            ) : null}

            {effectiveTask.status === "in_progress" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={acting}
                onClick={() => void confirmAction(t("tasksWorkspace.detail.confirmReset"), () => onPatchTask(task, { status: "open" }))}
              >
                {t("tasksWorkspace.detail.resetToOpen")}
              </Button>
            ) : null}

            {effectiveTask.status !== "done" && effectiveTask.status !== "cancelled" ? (
              <Button
                variant="primary"
                size="sm"
                disabled={acting || (completionDraft.sendToCustomer && !completionDraft.customerReplyBody.trim())}
                onClick={() =>
                  void confirmAction(
                    needsReply ? t("tasksWorkspace.detail.confirmDoneWithReply") : t("tasksWorkspace.detail.confirmDoneOnly"),
                    () => onPatchTask(task, {
                      status: "done",
                      requiresCustomerReply: effectiveTask.requiresCustomerReply || completionDraft.sendToCustomer,
                      customerReplyStatus: completionDraft.sendToCustomer
                        ? "pending"
                        : effectiveTask.requiresCustomerReply && effectiveTask.customerReplyStatus !== "sent"
                          ? "waived"
                          : effectiveTask.customerReplyStatus,
                      sendCustomerReply: completionDraft.sendToCustomer,
                      customerReplyBody: completionDraft.sendToCustomer ? completionDraft.customerReplyBody.trim() : null
                    })
                  )
                }
              >
                {needsReply ? t("tasksWorkspace.detail.doneWithReply") : t("tasksWorkspace.detail.done")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {needsReply ? (
        <Card className="border-blue-200 bg-blue-50/80 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.sendResultToCustomer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={completionDraft.sendToCustomer}
                onChange={(e) => setCompletionDraft((current) => ({ ...current, sendToCustomer: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
              />
              <span>{t("tasksWorkspace.detail.sendResultToCustomer")}</span>
            </label>
            {completionDraft.sendToCustomer ? (
              <Textarea
                value={completionDraft.customerReplyBody}
                onChange={(e) => setCompletionDraft((current) => ({ ...current, customerReplyBody: e.target.value }))}
                placeholder={t("tasksWorkspace.detail.customerReplyPlaceholder")}
                className="min-h-[112px] resize-none bg-white"
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {effectiveTask.status !== "cancelled" ? (
        <Card className="border-slate-200/80 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wide text-slate-400">{t("tasksWorkspace.detail.addRecord")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder={t("tasksWorkspace.detail.addRecordPlaceholder")}
              className="min-h-[132px] resize-none"
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={acting || !replyDraft.trim()}
                onClick={() => void onAddComment(task, replyDraft.trim()).then(() => setReplyDraft(""))}
              >
                {t("tasksWorkspace.detail.addRecordAction")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
