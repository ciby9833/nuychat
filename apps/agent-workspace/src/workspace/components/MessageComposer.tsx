import { useEffect, useRef, useState, type ClipboardEvent } from "react";

import { resolveApiUrl } from "../api";
import type { ChannelCapability } from "../constants";
import { ComposerAssistBar } from "./ComposerAssistBar";
import type { MessageAttachment, MessageItem } from "../types";

type UploadItem = {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
  mode: "attachment" | "sticker";
};

type MessageComposerProps = {
  detailOpen: boolean;
  capability: ChannelCapability;
  reply: string;
  pendingAttachments: MessageAttachment[];
  replyTarget: MessageItem | null;
  aiSuggestions: string[];
  isAssignedToMe: boolean;
  isResolved: boolean;
  isLockedByAnotherAgent: boolean;
  canSend: boolean;
  uploading: boolean;
  uploadItems: UploadItem[];
  composerError: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  onSelectFiles: (files: File[], mode: "attachment" | "sticker") => void;
  onRetryUpload: (key: string) => void;
  onClearAttachments: () => void;
  onRemoveAttachment: (index: number) => void;
  onSetReplyTarget: (messageId: string | null) => void;
  onClearComposerState: () => void;
  messagePreview: (message: MessageItem | null | undefined) => string;
};

function fileIcon(fileName: string | undefined): string {
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["ppt", "pptx"].includes(ext)) return "📽️";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "📦";
  return "📎";
}

function resolveAttachmentUrl(url: string) {
  return resolveApiUrl(url);
}

export function MessageComposer(props: MessageComposerProps) {
  const {
    detailOpen,
    capability,
    reply,
    pendingAttachments,
    replyTarget,
    aiSuggestions,
    isAssignedToMe,
    isResolved,
    isLockedByAnotherAgent,
    canSend,
    uploading,
    uploadItems,
    composerError,
    onReplyChange,
    onSend,
    onSelectFiles,
    onRetryUpload,
    onClearAttachments,
    onRemoveAttachment,
    onSetReplyTarget,
    onClearComposerState,
    messagePreview
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    const maxH = 220;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  };

  useEffect(() => {
    resizeTextarea();
  }, [reply]);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);

    if (files.length === 0) return;
    event.preventDefault();
    onSelectFiles(files, "attachment");
  };

  return (
    <div className="composer">
      <ComposerAssistBar
        detailOpen={detailOpen}
        aiSuggestions={aiSuggestions}
        isAssignedToMe={isAssignedToMe}
        reply={reply}
        onReplyChange={onReplyChange}
      />

      <div
        className={`composer-box${dragOver ? " drag-over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onSelectFiles(Array.from(event.dataTransfer.files), "attachment");
        }}
      >
        {replyTarget && (
          <div className="attachment-preview">
            <span className="attach-file-icon">回复: {messagePreview(replyTarget)}</span>
            <button type="button" onClick={() => onSetReplyTarget(null)} className="attach-remove" title="取消回复">✕</button>
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="attachment-preview">
            {pendingAttachments.map((attachment, index) => (
              <div key={`${attachment.fileName}-${index}`} className="attach-chip">
                {attachment.mimeType.startsWith("image/")
                  ? <img src={resolveAttachmentUrl(attachment.url)} alt={attachment.fileName} className="attach-thumb" />
                  : <span className="attach-file-icon">{fileIcon(attachment.fileName)} {attachment.fileName}</span>}
                <button type="button" onClick={() => onRemoveAttachment(index)} className="attach-remove" title="移除此附件">✕</button>
              </div>
            ))}
            <button type="button" onClick={onClearAttachments} className="attach-remove" title="清空附件">清空</button>
          </div>
        )}
        {uploadItems.length > 0 && (
          <div className="attachment-preview">
            {uploadItems.map((item) => (
              <div key={item.key} className="attach-chip">
                <span className="attach-file-icon">
                  {item.file.name} {item.status === "uploading" ? `${item.progress}%` : `失败: ${item.error ?? ""}`}
                </span>
                {item.status === "failed" ? (
                  <button type="button" onClick={() => onRetryUpload(item.key)} className="attach-remove" title="重试上传">重试</button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {composerError ? <div className="composer-error">{composerError}</div> : null}
        <textarea
          ref={textareaRef}
          value={reply}
          onChange={(event) => {
            onReplyChange(event.target.value);
            resizeTextarea();
          }}
          onPaste={handlePaste}
          placeholder={
            isLockedByAnotherAgent
              ? "该会话已分配给其他客服，无法回复"
              : isResolved
                ? "输入消息继续跟进此客户…"
                : isAssignedToMe
                  ? "输入消息…"
                  : "请先接管会话后再回复"
          }
          disabled={isLockedByAnotherAgent}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          multiple
          accept={capability.accepts}
          onChange={(event) => {
            onSelectFiles(Array.from(event.target.files ?? []), "attachment");
            event.target.value = "";
          }}
        />
      </div>

      <div className="composer-actions">
        <span className={`char-count${reply.length > 500 ? " warn" : ""}`}>{reply.length} · Enter 发送</span>
        <div className="right-actions">
          <button
            type="button"
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLockedByAnotherAgent || uploading || !capability.supportsAttachments}
            title="添加附件"
          >
            📎
          </button>
          {capability.supportsSticker ? (
            <button
              type="button"
              className="attach-btn"
              onClick={() => stickerInputRef.current?.click()}
              disabled={isLockedByAnotherAgent || uploading}
              title="发送贴纸"
            >
              🟩
            </button>
          ) : null}
          <button
            type="button"
            className="subtle-btn"
            onClick={onClearComposerState}
            disabled={!reply && pendingAttachments.length === 0 && !replyTarget && uploadItems.length === 0}
          >
            清空
          </button>
          <button type="button" className="send-btn" onClick={onSend} disabled={!canSend}>
            发送
          </button>
        </div>
      </div>
      <input
        ref={stickerInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".webp,image/webp"
        onChange={(event) => {
          onSelectFiles(Array.from(event.target.files ?? []), "sticker");
          event.target.value = "";
        }}
      />
    </div>
  );
}
