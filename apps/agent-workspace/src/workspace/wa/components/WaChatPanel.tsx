/**
 * 功能名称: WA 聊天主面板
 * 菜单路径: 工作台 / WA工作台 / 中间聊天区
 * 文件职责: 展示消息流、引用回复、附件与发送区。
 * 交互页面:
 * - ./WaWorkspace.tsx: 提供会话详情与发送动作。
 */

import { type ChangeEvent, useEffect, useRef } from "react";

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

  const title =
    detail?.conversation.displayName ||
    detail?.conversation.subject ||
    detail?.conversation.contactJid ||
    detail?.conversation.chatJid ||
    "选择会话";
  const currentReplier = detail?.conversation.currentReplierName || "未接管";
  const headerMeta = detail?.conversation.conversationType === "group"
    ? `${detail.members.length} 位成员`
    : detail?.conversation.contactPhoneE164 || detail?.conversation.contactJid || "单聊";

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    onUploadFiles(event.target.files);
    event.target.value = "";
  };

  const formatMessageTime = (message: WaMessageItem) =>
    new Date(message.providerTs || message.createdAt).toLocaleString();

  const renderDeliveryMeta = (message: WaMessageItem) => {
    if (message.direction !== "outbound") return null;
    if (message.receiptSummary?.latestStatus === "read" || message.deliveryStatus === "read") return "已读";
    if (message.receiptSummary?.latestStatus === "delivered" || message.deliveryStatus === "delivered") return "已送达";
    if (message.deliveryStatus === "failed") return "失败";
    if (message.deliveryStatus === "pending") return "发送中";
    return null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#efeae2]">
      <div className="border-b border-[#d7dbdf] bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-sm font-semibold text-[#005c4b]">
              {title.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-[#111b21]">{title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[#667781]">
                <span>{headerMeta}</span>
                <span>·</span>
                <span>{currentReplier}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTakeover}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full border border-[#d1d7db] bg-white px-3 text-xs font-medium text-[#111b21] disabled:opacity-50"
            >
              {actionLoading === "takeover" ? "接管中..." : "接管"}
            </button>
            <button
              type="button"
              onClick={onRelease}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full bg-[#111b21] px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              {actionLoading === "release" ? "释放中..." : "释放"}
            </button>
          </div>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto px-6 py-5"
        style={{
          backgroundImage: "radial-gradient(rgba(17,27,33,0.03) 1px, transparent 1px)",
          backgroundSize: "18px 18px"
        }}
      >
        {detailLoading ? <div className="text-sm text-[#8696a0]">会话加载中...</div> : null}
        <div className="space-y-4">
          {detail?.messages.map((message) => {
            const mine = message.direction === "outbound";
            const preview = message.bodyText || message.attachments[0]?.fileName || message.messageType;
            const quotedTarget = message.quotedMessageId
              ? detail.messages.find((item) => item.providerMessageId === message.quotedMessageId || item.waMessageId === message.quotedMessageId) ?? null
              : null;
            const senderLabel = mine
              ? null
              : detail.conversation.conversationType === "group"
                ? (message.senderDisplayName || quotedTarget?.senderDisplayName || quotedTarget?.senderJid || message.participantJid || message.senderJid || null)
                : null;
            const deliveryMeta = renderDeliveryMeta(message);
            return (
              <div key={message.waMessageId} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[72%] rounded-[14px] px-3 py-2 shadow-sm ${mine ? "bg-[#d9fdd3] text-[#111b21]" : "bg-white text-[#111b21]"}`}>
                  {senderLabel ? <div className="text-[11px] text-[#667781]">{senderLabel}</div> : null}
                  {message.quotedMessageId ? (
                    <div className={`mt-2 rounded-xl border-l-4 px-3 py-2 text-xs ${mine ? "border-[#53bdeb] bg-white/50" : "border-[#00a884] bg-[#f0f2f5]"}`}>
                      <div className="text-[11px] font-medium text-[#667781]">回复了一条消息</div>
                      <div className="mt-1 truncate text-[#111b21]">
                        {quotedTarget?.bodyText || quotedTarget?.attachments[0]?.fileName || "引用消息"}
                      </div>
                    </div>
                  ) : null}
                  {message.bodyText ? <div className="mt-2 whitespace-pre-wrap text-sm">{message.bodyText}</div> : null}
                  {message.attachments.map((attachment) => (
                    <a
                      key={attachment.attachmentId}
                      href={attachment.storageUrl || attachment.previewUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block rounded-xl border border-[#d1d7db] bg-white/80 px-3 py-2 text-xs underline-offset-2 hover:underline"
                    >
                      {attachment.fileName || attachment.attachmentType}
                    </a>
                  ))}
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[#667781]">
                    <span>{formatMessageTime(message)}</span>
                    <span>{deliveryMeta}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#667781] opacity-70">
                    <button type="button" className="rounded-full px-2 py-1 hover:bg-black/5" onClick={() => onReplyToMessage(message.providerMessageId || message.waMessageId, preview)}>↩</button>
                    <button type="button" className="rounded-full px-2 py-1 hover:bg-black/5" onClick={() => onSendReaction(message, "👍")}>👍</button>
                    <button type="button" className="rounded-full px-2 py-1 hover:bg-black/5" onClick={() => onSendReaction(message, "✅")}>✅</button>
                  </div>
                </div>
              </div>
            );
          })}
          {!detailLoading && !detail?.messages.length ? (
            <div className="mx-auto mt-8 max-w-md rounded-2xl bg-white/80 px-5 py-4 text-center text-sm text-[#667781] shadow-sm">
              当前会话还没有消息
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-[#d7dbdf] bg-[#f0f2f5] px-4 py-3">
        {quotedMessage ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-[#b7e4dc] bg-[#e7fce8] px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#005c4b]">引用回复</div>
              <div className="truncate text-xs text-[#111b21]">{quotedMessage.bodyText || quotedMessage.messageType}</div>
            </div>
            <button type="button" className="text-xs text-[#005c4b]" onClick={onClearQuoted}>清除</button>
          </div>
        ) : null}

        {uploadingAttachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadingAttachments.map((attachment) => (
              <div key={attachment.localId} className="flex items-center gap-2 rounded-full border border-[#d1d7db] bg-white px-3 py-1 text-xs text-[#54656f]">
                <span>{attachment.fileName}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.localId)}>移除</button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-3">
          <label className="flex h-10 cursor-pointer items-center rounded-full border border-[#d1d7db] bg-white px-4 text-xs text-[#54656f]">
            附件
            <input type="file" multiple className="hidden" onChange={handleFileInput} />
          </label>
          <textarea
            value={composerText}
            onChange={(event) => onComposerTextChange(event.target.value)}
            placeholder="输入消息内容"
            className="min-h-[58px] max-h-[140px] flex-1 rounded-[18px] border border-[#d1d7db] bg-white px-4 py-3 text-sm text-[#111b21] outline-none ring-0"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!detail?.permissions.canReply || actionLoading !== null}
            className="h-11 rounded-full bg-[#00a884] px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            {actionLoading === "send" ? "发送中..." : "发送"}
          </button>
        </div>
        {detail && !detail.permissions.canReply ? (
          <div className="mt-2 text-xs text-[#c05621]">当前由其他成员接管</div>
        ) : null}
      </div>
    </div>
  );
}
