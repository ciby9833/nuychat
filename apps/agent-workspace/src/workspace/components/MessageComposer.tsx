import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { resolveApiUrl } from "../api";
import type { ChannelCapability } from "../constants";
import { ComposerAssistBar } from "./ComposerAssistBar";
import { EmojiPicker } from "./EmojiPicker";
import { SkillAssistCard } from "./SkillAssistCard";
import type { ComposerSkillAssist, MessageAttachment, MessageItem } from "../types";
import { cn } from "../../lib/utils";

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
  composerSkillAssist: ComposerSkillAssist | null;
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

export function MessageComposer(props: MessageComposerProps) {
  const {
    detailOpen,
    capability,
    reply,
    pendingAttachments,
    composerSkillAssist,
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

  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    const maxH = 260;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      onReplyChange(reply + emoji);
      return;
    }
    const start = el.selectionStart ?? reply.length;
    const end = el.selectionEnd ?? reply.length;
    const next = reply.slice(0, start) + emoji + reply.slice(end);
    onReplyChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
    });
  };

  const insertSkillAssist = (value: string) => {
    if (!value) return;
    const next = reply.trim()
      ? `${reply.trim()}\n\n${value}`
      : value;
    onReplyChange(next);
  };

  useEffect(() => { resizeTextarea(); }, [reply]);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);
    if (files.length === 0) return;
    event.preventDefault();
    onSelectFiles(files, "attachment");
  };

  const placeholder = isLockedByAnotherAgent
    ? t("composer.placeholderLocked")
    : isResolved
      ? t("composer.placeholderResolved")
      : isAssignedToMe
        ? t("composer.placeholderOwned")
        : t("composer.placeholderNotOwned");

  return (
    <div className="flex flex-col border-t border-slate-200 bg-white">
      <ComposerAssistBar
        detailOpen={detailOpen}
        aiSuggestions={aiSuggestions}
        isAssignedToMe={isAssignedToMe}
        reply={reply}
        onReplyChange={onReplyChange}
      />

      {/* Drag-over wrapper */}
      <div
        className={cn("flex flex-col gap-0 transition-colors", dragOver && "bg-blue-50/60")}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onSelectFiles(Array.from(event.dataTransfer.files), "attachment");
        }}
      >
        {/* Reply target */}
        {replyTarget && (
          <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 shrink-0">
              <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            <span className="text-xs text-blue-700 truncate flex-1">
              {t("composer.replyPrefix")} {messagePreview(replyTarget)}
            </span>
            <button
              type="button"
              onClick={() => onSetReplyTarget(null)}
              className="text-blue-400 hover:text-blue-600 text-sm leading-none"
              title={t("composer.cancelReply")}
            >
              ✕
            </button>
          </div>
        )}

        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mx-3 mt-2">
            {pendingAttachments.map((attachment, index) => (
              <div key={`${attachment.fileName}-${index}`} className="flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-700 max-w-[160px]">
                {attachment.mimeType.startsWith("image/")
                  ? <img src={resolveApiUrl(attachment.url)} alt={attachment.fileName} className="attach-thumb" />
                  : <span className="text-base leading-none">{fileIcon(attachment.fileName)}</span>}
                <span className="truncate">{attachment.fileName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(index)}
                  className="ml-1 text-slate-400 hover:text-slate-700 leading-none shrink-0"
                  title={t("composer.removeAttachment")}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onClearAttachments}
              className="h-7 px-2 rounded-md text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={t("composer.clearAttachments")}
            >
              {t("composer.clear")}
            </button>
          </div>
        )}

        {/* Upload progress items */}
        {uploadItems.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mx-3 mt-2">
            {uploadItems.map((item) => (
              <div key={item.key} className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-600 max-w-[180px]">
                <span className="truncate">
                  {item.file.name} {item.status === "uploading"
                    ? `${item.progress}%`
                    : t("composer.uploadFailed", { error: item.error ?? "" })}
                </span>
                {item.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => onRetryUpload(item.key)}
                    className="text-blue-600 hover:text-blue-700 shrink-0"
                    title={t("composer.retryUpload")}
                  >
                    {t("composer.retry")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {composerError ? (
          <div className="mx-3 mt-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-100 text-xs text-red-600">
            {composerError}
          </div>
        ) : null}

        {composerSkillAssist ? (
          <SkillAssistCard
            assist={composerSkillAssist}
            disabled={isLockedByAnotherAgent}
            onInsert={insertSkillAssist}
          />
        ) : null}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={reply}
          onChange={(event) => {
            onReplyChange(event.target.value);
            resizeTextarea();
          }}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={isLockedByAnotherAgent}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          className="mx-3 mt-2 min-h-[80px] resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Hidden file inputs */}
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

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Left tools */}
        <div className="flex items-center gap-0.5">
          {/* Emoji button */}
          <div className="relative">
            <button
              type="button"
              title={t("composer.emoji")}
              disabled={isLockedByAnotherAgent}
              onClick={() => setShowEmoji((v) => !v)}
              className={cn(
                "h-8 w-8 flex items-center justify-center rounded-md transition-colors text-slate-500",
                showEmoji ? "bg-blue-50 text-blue-600" : "hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </button>
            {showEmoji && (
              <EmojiPicker
                onSelect={(emoji) => { insertEmoji(emoji); }}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>

          {/* Attachment button */}
          <button
            type="button"
            title={t("composer.addAttachment")}
            onClick={() => fileInputRef.current?.click()}
            disabled={isLockedByAnotherAgent || uploading || !capability.supportsAttachments}
            className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          {/* Sticker button */}
          {capability.supportsSticker ? (
            <button
              type="button"
              title={t("composer.sticker")}
              onClick={() => stickerInputRef.current?.click()}
              disabled={isLockedByAnotherAgent || uploading}
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10H2V12A10 10 0 0 1 12 2z"/>
                <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72"/>
                <path d="M10.71 2a16 16 0 0 1 8.29 9.3"/>
              </svg>
            </button>
          ) : null}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          <span className={cn("text-[11px]", reply.length > 500 ? "text-amber-600 font-medium" : "text-slate-400")}>
            {reply.length > 0 ? t("composer.charCount", { count: reply.length }) : t("composer.enterToSend")}
          </span>
          <button
            type="button"
            onClick={onClearComposerState}
            disabled={!reply && pendingAttachments.length === 0 && !replyTarget && uploadItems.length === 0}
            className="h-7 px-2.5 rounded-md text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("composer.clear")}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="h-8 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-blue-500/20"
          >
            {t("composer.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
