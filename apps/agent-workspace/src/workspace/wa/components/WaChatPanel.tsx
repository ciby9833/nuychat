/**
 * 功能名称: WA 聊天主面板
 * 菜单路径: 工作台 / WA工作台 / 中间聊天区
 * 文件职责: 展示消息流、引用回复、附件与发送区。
 * 交互页面:
 * - ./WaWorkspace.tsx: 提供会话详情与发送动作。
 */

import type { ChangeEvent } from "react";

import type { WaConversationDetail, WaMessageItem } from "../types";

type WaChatPanelProps = {
  detail: WaConversationDetail | null;
  detailLoading: boolean;
  composerText: string;
  onComposerTextChange: (value: string) => void;
  quotedMessage: WaMessageItem | null;
  onClearQuoted: () => void;
  uploadingAttachments: Array<{ localId: string; fileName: string; mimeType: string; url: string }>;
  onRemoveAttachment: (localId: string) => void;
  onUploadFiles: (files: FileList | null) => void;
  onTakeover: () => void;
  onRelease: () => void;
  onReplyToMessage: (providerMessageId: string | null, preview: string) => void;
  onSendReaction: (message: WaMessageItem, emoji: string) => void;
  onSend: () => void;
  actionLoading: string | null;
};

export function WaChatPanel(props: WaChatPanelProps) {
  const {
    detail,
    detailLoading,
    composerText,
    onComposerTextChange,
    quotedMessage,
    onClearQuoted,
    uploadingAttachments,
    onRemoveAttachment,
    onUploadFiles,
    onTakeover,
    onRelease,
    onReplyToMessage,
    onSendReaction,
    onSend,
    actionLoading
  } = props;

  const title = detail?.conversation.subject || detail?.conversation.contactJid || detail?.conversation.chatJid || "选择会话";

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    onUploadFiles(event.target.files);
    event.target.value = "";
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {detail?.conversation.currentReplierName ? `当前谁在回: ${detail.conversation.currentReplierName}` : "当前谁在回: 未接管"}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTakeover}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              {actionLoading === "takeover" ? "接管中..." : "接管"}
            </button>
            <button
              type="button"
              onClick={onRelease}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              {actionLoading === "release" ? "释放中..." : "释放"}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {detailLoading ? <div className="text-sm text-slate-400">会话加载中...</div> : null}
        <div className="space-y-4">
          {detail?.messages.map((message) => {
            const mine = message.direction === "outbound";
            const preview = message.bodyText || message.attachments[0]?.fileName || message.messageType;
            return (
              <div key={message.waMessageId} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[72%] rounded-3xl px-4 py-3 ${mine ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                  <div className="text-[11px] opacity-75">
                    {mine ? "员工回复" : message.participantJid || message.senderJid || "客户/群成员"}
                  </div>
                  {message.quotedMessageId ? (
                    <div className={`mt-2 rounded-2xl border px-3 py-2 text-xs ${mine ? "border-emerald-300/50 bg-emerald-500/40" : "border-slate-200 bg-white/70"}`}>
                      引用消息ID: {message.quotedMessageId}
                    </div>
                  ) : null}
                  {message.bodyText ? <div className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText}</div> : null}
                  {message.attachments.map((attachment) => (
                    <a
                      key={attachment.attachmentId}
                      href={attachment.storageUrl || attachment.previewUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-2 block rounded-2xl border px-3 py-2 text-xs underline-offset-2 hover:underline ${mine ? "border-emerald-300/50" : "border-slate-200 bg-white/70"}`}
                    >
                      {attachment.fileName || attachment.attachmentType}
                    </a>
                  ))}
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] opacity-75">
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                    <span>{message.deliveryStatus}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="text-[11px]" onClick={() => onReplyToMessage(message.providerMessageId || message.waMessageId, preview)}>引用</button>
                    <button type="button" className="text-[11px]" onClick={() => onSendReaction(message, "👍")}>👍</button>
                    <button type="button" className="text-[11px]" onClick={() => onSendReaction(message, "✅")}>✅</button>
                  </div>
                </div>
              </div>
            );
          })}
          {!detailLoading && !detail?.messages.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              当前会话暂无消息
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        {quotedMessage ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-emerald-700">引用回复</div>
              <div className="truncate text-xs text-emerald-900">{quotedMessage.bodyText || quotedMessage.messageType}</div>
            </div>
            <button type="button" className="text-xs text-emerald-700" onClick={onClearQuoted}>清除</button>
          </div>
        ) : null}

        {uploadingAttachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadingAttachments.map((attachment) => (
              <div key={attachment.localId} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                <span>{attachment.fileName}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.localId)}>移除</button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-3">
          <label className="flex h-10 cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-600">
            附件
            <input type="file" multiple className="hidden" onChange={handleFileInput} />
          </label>
          <textarea
            value={composerText}
            onChange={(event) => onComposerTextChange(event.target.value)}
            placeholder="输入消息内容"
            className="min-h-[84px] flex-1 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!detail?.permissions.canReply || actionLoading !== null}
            className="h-11 rounded-2xl bg-emerald-600 px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            {actionLoading === "send" ? "发送中..." : "发送"}
          </button>
        </div>
        {detail && !detail.permissions.canReply ? (
          <div className="mt-2 text-xs text-amber-600">当前由其他成员接管，你只能查看或提示。</div>
        ) : null}
      </div>
    </div>
  );
}
