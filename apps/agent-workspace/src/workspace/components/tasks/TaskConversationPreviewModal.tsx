/**
 * 功能名称: 任务关联会话预览弹窗
 * 菜单路径: 座席工作台 / 任务 / 会话上下文预览
 * 文件职责: 在任务页内预览关联会话的客户信息、case 摘要和消息上下文，不跳转到消息界面。
 * 交互页面:
 * - ./TasksWorkspace.tsx: 控制弹窗打开、关闭和数据拉取。
 * - ../StructuredMessageContent.tsx: 负责结构化消息内容展示。
 */

import type { ConversationPreviewDetail } from "../../types";
import { useTranslation } from "react-i18next";
import { StructuredMessageContent } from "../StructuredMessageContent";

type TaskConversationPreviewModalProps = {
  open: boolean;
  loading: boolean;
  detail: ConversationPreviewDetail | null;
  onClose: () => void;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function TaskConversationPreviewModal(props: TaskConversationPreviewModalProps) {
  const { t } = useTranslation();
  const { open, loading, detail, onClose } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-6 py-8" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(1080px,100%)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-950">
              {detail?.conversation.caseTitle ?? detail?.conversation.customerName ?? detail?.conversation.customerRef ?? t("tasksWorkspace.preview.titleFallback")}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              {detail?.conversation.channelType ? <span>{detail.conversation.channelType.toUpperCase()}</span> : null}
              {detail?.conversation.caseStatus ? <span>· {detail.conversation.caseStatus}</span> : null}
              {detail?.conversation.currentOwnerName ? <span>· {t("tasksWorkspace.preview.currentOwner", { name: detail.conversation.currentOwnerName })}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-slate-100 text-lg text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? <div className="py-20 text-center text-sm text-slate-400">{t("tasksWorkspace.preview.loading")}</div> : null}
          {!loading && !detail ? <div className="py-20 text-center text-sm text-slate-400">{t("tasksWorkspace.preview.empty")}</div> : null}

          {detail ? (
            <div className="flex flex-col gap-5">
              {detail.conversation.caseSummary ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  {detail.conversation.caseSummary}
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {detail.messages.map((message) => (
                  <div
                    key={message.messageId}
                    className={message.direction === "outbound" ? "ml-auto max-w-[82%]" : "max-w-[82%]"}
                  >
                    <div
                      className={
                        message.direction === "outbound"
                          ? "rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3"
                          : "rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      }
                    >
                      <div className="mb-2 text-[11px] text-slate-400">
                        {message.senderName || message.senderType || t("tasksWorkspace.preview.unknownSender")} · {formatTime(message.createdAt)}
                      </div>
                      {message.replyToPreview ? (
                        <div className="mb-3 rounded-r-lg border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          {message.replyToPreview}
                        </div>
                      ) : null}
                      <div className="text-sm leading-6 text-slate-700">
                        <StructuredMessageContent
                          structured={message.content?.structured}
                          fallbackText={message.preview}
                          attachments={message.content?.attachments}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
