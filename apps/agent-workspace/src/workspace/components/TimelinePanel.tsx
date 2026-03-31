/**
 * 菜单路径与名称: 座席工作台 / 会话详情 / 消息时间线与手动技能处理
 * 文件职责: 负责消息时间线、回复输入、手动技能执行弹窗、图片预览等会话主交互。
 * 主要交互文件:
 * - ./MessageList.tsx: 渲染消息列表与消息菜单。
 * - ./MessageComposer.tsx: 渲染回复输入区与自动技能辅助卡片。
 * - ./SkillAssistCard.tsx: 展示手动技能执行结果。
 * - ../hooks/useWorkspaceDashboard.ts: 提供会话状态、消息和技能辅助动作。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { SkillAssistCard } from "./SkillAssistCard";
import { getChannelCapability, validateUploadForChannel } from "../constants";
import type { AgentColleague, ComposerSkillAssist, ConversationDetail, MessageAttachment, MessageItem, SkillSchema, Ticket } from "../types";
import { cn } from "../../lib/utils";

type TimelinePanelProps = {
  detail: ConversationDetail | null;
  messages: MessageItem[];
  reply: string;
  pendingAttachments: MessageAttachment[];
  replyTargetMessageId: string | null;
  composerSkillAssist: ComposerSkillAssist | null;
  skillSchemas: SkillSchema[];
  viewHint: string;
  aiSuggestions: string[];
  recommendedSkills: string[];
  isAssignedToMe: boolean;
  actionLoading: string | null;
  tickets: Ticket[];
  colleagues: AgentColleague[];
  onReplyChange: (v: string) => void;
  onSendReply: () => Promise<void>;
  onSendReaction: (targetMessageId: string, emoji: string) => Promise<void>;
  onUploadFiles: (
    files: File[],
    options?: {
      onProgress?: (fileKey: string, progress: number) => void;
      onError?: (fileKey: string, error: string) => void;
    }
  ) => Promise<void>;
  onClearAttachments: () => void;
  onRemoveAttachment: (index: number) => void;
  onSetReplyTarget: (messageId: string | null) => void;
  onAssign: () => Promise<void>;
  onHandoff: () => Promise<void>;
  onTransfer: (targetAgentId: string, reason?: string) => Promise<void>;
  onResolve: () => Promise<void>;
  onManualSkillAssist: (messageId: string, skillSlug: string) => Promise<ComposerSkillAssist | null>;
  onAddTaskFromMessage: (messageId: string, preview: string) => void;
};

type UploadItem = {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
  mode: "attachment" | "sticker";
};

type PopoverPlacement = "up" | "down";

function messagePreview(message: MessageItem | null | undefined, t: (key: string) => string): string {
  if (!message) return "";
  if (message.status_deleted_at) return t("timeline.deleted");
  if (message.reaction_emoji) return message.reaction_emoji;
  if (message.content?.text) return message.content.text;
  if (message.content?.structured?.blocks?.length) return "[structured]";
  if (Array.isArray(message.content?.attachments) && message.content.attachments.length > 0) {
    return message.content.attachments[0]?.fileName ?? t("timeline.attachment");
  }
  return t("timeline.message");
}

export function TimelinePanel(props: TimelinePanelProps) {
  const {
    detail,
    messages,
    reply,
    pendingAttachments,
    replyTargetMessageId,
    composerSkillAssist,
    skillSchemas,
    viewHint,
    aiSuggestions,
    recommendedSkills: _recommendedSkills,
    isAssignedToMe,
    actionLoading,
    tickets,
    colleagues,
    onReplyChange,
    onSendReply,
    onSendReaction,
    onUploadFiles,
    onClearAttachments,
    onRemoveAttachment,
    onSetReplyTarget,
    onAssign,
    onHandoff,
    onTransfer,
    onResolve,
    onManualSkillAssist,
    onAddTaskFromMessage
  } = props;

  const { t } = useTranslation();
  const [resolveConfirm, setResolveConfirm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const openTickets = tickets.filter((tk) => !["done", "cancelled"].includes(tk.status));
  const isResolved = detail?.status === "resolved" || detail?.status === "closed";
  const isLockedByAnotherAgent = Boolean(detail && !isAssignedToMe && detail.status === "human_active");
  const canSend = Boolean(
    detail && !isLockedByAnotherAgent && (reply.trim() || pendingAttachments.length > 0) && (isAssignedToMe || isResolved)
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [reactionPlacement, setReactionPlacement] = useState<PopoverPlacement>("up");
  const [menuPlacement, setMenuPlacement] = useState<PopoverPlacement>("up");
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<{ url: string; alt: string } | null>(null);
  const [manualSkillModal, setManualSkillModal] = useState<{
    messageId: string;
    preview: string;
    skillSlug: string;
    loading: boolean;
    assist: ComposerSkillAssist | null;
    error: string;
  } | null>(null);
  const replyTarget = useMemo(
    () => messages.find((message) => message.message_id === replyTargetMessageId) ?? null,
    [messages, replyTargetMessageId]
  );
  const capability = useMemo(() => getChannelCapability(detail?.channelType), [detail?.channelType]);
  const uploading = uploadItems.some((item) => item.status === "uploading");

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 200;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    userScrolledUpRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
    setShowTransfer(false);
    setTransferTargetId("");
    setTransferReason("");
    setUploadItems([]);
    setReactionTargetId(null);
    setMessageMenuId(null);
    setReactionPlacement("up");
    setMenuPlacement("up");
    setHoveredMessageId(null);
    setComposerError("");
    setImagePreview(null);
    setManualSkillModal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.conversationId]);

  useEffect(() => {
    const handlePointerDown = () => {
      // Popups in SideActions use e.stopPropagation() to prevent this from
      // firing when the user clicks inside a reaction picker or more-menu.
      // All other outside-clicks should close any open popup.
      setMessageMenuId(null);
      setReactionTargetId(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const sendNow = () => {
    if (!canSend) return;
    void onSendReply();
  };

  const startUpload = async (files: File[], mode: "attachment" | "sticker") => {
    if (files.length === 0 || uploading) return;
    const uniqueFiles = files
      .filter((file, index, current) => (
        current.findIndex((item) => (
          item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
        )) === index
      ))
      .slice(0, capability.maxAttachmentsPerSend);

    const validFiles: File[] = [];
    for (const file of uniqueFiles) {
      const validationError = validateUploadForChannel(detail?.channelType, file, mode);
      if (validationError) {
        setComposerError(validationError);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    const nextItems = validFiles.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      progress: 0,
      status: "uploading" as const,
      mode
    }));
    setComposerError("");
    setUploadItems((current) => [...current, ...nextItems]);
    const failedKeys = new Set<string>();
    try {
      await onUploadFiles(validFiles, {
        onProgress: (fileKey, progress) => {
          setUploadItems((current) => current.map((item) => (
            item.key === fileKey ? { ...item, progress } : item
          )));
        },
        onError: (fileKey, error) => {
          failedKeys.add(fileKey);
          setUploadItems((current) => current.map((item) => (
            item.key === fileKey ? { ...item, status: "failed", error } : item
          )));
        }
      });
      setUploadItems((current) => current.filter((item) => (
        !nextItems.some((next) => next.key === item.key) || failedKeys.has(item.key)
      )));
    } catch {
      // upload errors are handled per-file via onError callbacks
    }
  };

  const retryUpload = (key: string) => {
    const target = uploadItems.find((item) => item.key === key);
    if (!target) return;
    setUploadItems((current) => current.filter((item) => item.key !== key));
    void startUpload([target.file], target.mode);
  };

  const handleResolveClick = () => {
    if (openTickets.length > 0) {
      setResolveConfirm(true);
    } else {
      void onResolve();
    }
  };

  const handleTransferConfirm = () => {
    if (!transferTargetId) return;
    setShowTransfer(false);
    void onTransfer(transferTargetId, transferReason || undefined);
    setTransferTargetId("");
    setTransferReason("");
  };

  const hintType = viewHint.startsWith("🔴") ? "error" : viewHint.startsWith("⚠️") ? "warning" : "info";

  const sortedColleagues = useMemo(() => {
    return [...colleagues].sort((a, b) => {
      const aOnline = a.status === "online" || a.status === "busy" ? 0 : 1;
      const bOnline = b.status === "online" || b.status === "busy" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });
  }, [colleagues]);

  const resolvePopoverPlacement = (anchor: HTMLElement | null): PopoverPlacement => {
    if (!anchor || !listRef.current) return "up";
    const anchorRect = anchor.getBoundingClientRect();
    const listRect = listRef.current.getBoundingClientRect();
    const spaceAbove = anchorRect.top - listRect.top;
    const spaceBelow = listRect.bottom - anchorRect.bottom;
    return spaceAbove < 120 && spaceBelow > spaceAbove ? "down" : "up";
  };

  const copyMessageContent = async (message: MessageItem) => {
    const text = messagePreview(message, t);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setComposerError(t("timeline.copyFailed"));
    }
  };

  const openManualSkillAssist = (messageId: string, preview: string) => {
    setManualSkillModal({
      messageId,
      preview,
      skillSlug: skillSchemas[0]?.name ?? "",
      loading: false,
      assist: null,
      error: ""
    });
  };

  const runManualSkillAssist = () => {
    if (!manualSkillModal?.messageId || !manualSkillModal.skillSlug) return;
    setManualSkillModal((current) => current ? { ...current, loading: true, error: "", assist: null } : current);
    void onManualSkillAssist(manualSkillModal.messageId, manualSkillModal.skillSlug)
      .then((assist) => {
        setManualSkillModal((current) => current ? {
          ...current,
          loading: false,
          assist,
          error: assist ? "" : t("skillAssist.manual.emptyResult")
        } : current);
      })
      .catch((error) => {
        setManualSkillModal((current) => current ? {
          ...current,
          loading: false,
          assist: null,
          error: (error as Error).message || t("skillAssist.manual.loadFailed")
        } : current);
      });
  };

  return (
    <section
      className="flex flex-col overflow-hidden bg-white"
      style={{ gridColumn: 2, gridRow: 2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        {detail ? (
          <>
            {/* Customer info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {(detail.customerName ?? detail.customerRef ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {detail.customerName ?? detail.customerRef}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {detail.customerRef} · {detail.customerLanguage} · {detail.channelType} · {detail.operatingMode}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isAssignedToMe && detail.status !== "resolved" && (
                <button
                  type="button"
                  onClick={() => void onAssign()}
                  disabled={actionLoading !== null}
                  className="h-7 px-3 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "assign" ? t("timeline.processing") : t("timeline.assign")}
                </button>
              )}
              {isAssignedToMe && detail.status !== "resolved" && (
                <>
                  <button
                    type="button"
                    onClick={() => void onHandoff()}
                    disabled={actionLoading !== null}
                    className="h-7 px-3 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === "handoff" ? t("timeline.processing") : t("timeline.handoff")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTransfer((v) => !v)}
                    disabled={actionLoading !== null}
                    className={cn(
                      "h-7 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                      showTransfer ? "bg-blue-50 text-blue-600 border border-blue-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    )}
                  >
                    {actionLoading === "transfer" ? t("timeline.transferring") : t("timeline.transfer")}
                  </button>
                </>
              )}
              {detail.status !== "resolved" && (
                <button
                  type="button"
                  onClick={handleResolveClick}
                  disabled={actionLoading !== null}
                  className={cn(
                    "h-7 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                    resolveConfirm
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20"
                  )}
                >
                  {actionLoading === "resolve" ? t("timeline.processing") : t("timeline.resolve")}
                </button>
              )}
              {isResolved && (
                <span className="inline-flex items-center gap-1 h-7 px-3 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                  ✓ {t("timeline.resolved")}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="text-sm text-slate-400">{t("timeline.selectConversation")}</span>
        )}
      </div>

      {/* Transfer dialog */}
      {showTransfer && (
        <div className="mx-4 mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 shrink-0">
          <div className="text-xs font-semibold text-slate-700 mb-2">{t("timeline.transferTitle")}</div>
          <div className="flex flex-col gap-2">
            <select
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
            >
              <option value="">{t("timeline.selectAgent")}</option>
              {sortedColleagues.map((c) => {
                const isOnline = c.status === "online" || c.status === "busy";
                const label = `${c.displayName ?? t("msgList.unknown")}${c.employeeNo ? ` #${c.employeeNo}` : ""} ${isOnline ? "🟢" : "⚪"}`;
                return (
                  <option key={c.agentId} value={c.agentId}>{label}</option>
                );
              })}
            </select>
            <input
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder={t("timeline.transferNote")}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTransferConfirm}
                disabled={!transferTargetId}
                className="h-7 px-3 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {t("timeline.confirmTransfer")}
              </button>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                className="h-7 px-3 rounded-md bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                {t("timeline.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View hint banners */}
      {viewHint && (
        <div className={cn(
          "mx-4 mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium shrink-0",
          hintType === "error" ? "bg-red-50 border border-red-200 text-red-700" :
          hintType === "warning" ? "bg-amber-50 border border-amber-200 text-amber-700" :
          "bg-blue-50 border border-blue-200 text-blue-700"
        )}>
          {viewHint}
        </div>
      )}

      {isLockedByAnotherAgent && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 shrink-0">
          ⚠️ {t("timeline.lockedBanner")}
        </div>
      )}

      {/* Resolve confirm bar */}
      {resolveConfirm && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 shrink-0">
          <span className="text-xs text-amber-700 flex-1">
            {t("timeline.resolveBanner", { count: openTickets.length })}
          </span>
          <button
            type="button"
            onClick={() => { setResolveConfirm(false); void onResolve(); }}
            className="h-7 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
          >
            {t("timeline.endConversation")}
          </button>
          <button
            type="button"
            onClick={() => setResolveConfirm(false)}
            className="h-7 px-3 rounded-md bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            {t("timeline.cancel")}
          </button>
        </div>
      )}

      {/* Message list — flex-1 to fill remaining space */}
      <MessageList
        detailOpen={Boolean(detail)}
        messages={messages}
        capability={capability}
        isAssignedToMe={isAssignedToMe}
        listRef={listRef}
        bottomRef={bottomRef}
        hoveredMessageId={hoveredMessageId}
        messageMenuId={messageMenuId}
        reactionTargetId={reactionTargetId}
        reactionPlacement={reactionPlacement}
        menuPlacement={menuPlacement}
        onHoverMessage={setHoveredMessageId}
        onCloseReactionMenuForMessage={(messageId) => {
          setReactionTargetId((current) => current === messageId ? null : current);
        }}
        onCloseMenus={() => {
          setMessageMenuId(null);
          setReactionTargetId(null);
        }}
        onToggleReactionMenu={(messageId, anchor) => {
          setMessageMenuId(null);
          setReactionPlacement(resolvePopoverPlacement(anchor));
          setReactionTargetId((current) => current === messageId ? null : messageId);
        }}
        onToggleMessageMenu={(messageId, anchor) => {
          setReactionTargetId(null);
          setMenuPlacement(resolvePopoverPlacement(anchor));
          setMessageMenuId((current) => current === messageId ? null : messageId);
        }}
        onSetReplyTarget={onSetReplyTarget}
        onAddTaskFromMessage={onAddTaskFromMessage}
        onOpenSkillAssist={openManualSkillAssist}
        onSendReaction={onSendReaction}
        onCopyMessageContent={(message) => { void copyMessageContent(message); }}
        onPreviewImage={(url, alt) => setImagePreview({ url, alt })}
      />

      {manualSkillModal ? (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" onClick={() => setManualSkillModal(null)}>
          <div
            className="w-[min(720px,92vw)] max-h-[80vh] overflow-auto rounded-2xl bg-white shadow-2xl border border-slate-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{t("skillAssist.manual.title")}</div>
                <div className="text-xs text-slate-500 truncate">{manualSkillModal.preview || t("timeline.message")}</div>
              </div>
              <button
                type="button"
                className="h-8 px-3 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                onClick={() => setManualSkillModal(null)}
              >
                {t("skillAssist.manual.close")}
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-600">{t("skillAssist.manual.selectSkill")}</label>
                <select
                  value={manualSkillModal.skillSlug}
                  onChange={(event) => setManualSkillModal((current) => current ? {
                    ...current,
                    skillSlug: event.target.value,
                    assist: null,
                    error: ""
                  } : current)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="" disabled>{t("skillAssist.manual.selectSkillPlaceholder")}</option>
                  {skillSchemas.map((schema) => (
                    <option key={schema.name} value={schema.name}>
                      {schema.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!manualSkillModal.skillSlug || manualSkillModal.loading}
                  onClick={runManualSkillAssist}
                  className="h-9 px-4 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {manualSkillModal.loading ? t("skillAssist.manual.processing") : t("skillAssist.manual.execute")}
                </button>
              </div>
              {manualSkillModal.error ? (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {manualSkillModal.error}
                </div>
              ) : null}
              {manualSkillModal.assist ? (
                <SkillAssistCard
                  assist={manualSkillModal.assist}
                  onInsert={(value) => onReplyChange(value)}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Image preview overlay */}
      {imagePreview ? (
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            className="image-preview-close"
            aria-label={t("timeline.closePreview")}
            onClick={() => setImagePreview(null)}
          >
            ×
          </button>
          <img
            src={imagePreview.url}
            alt={imagePreview.alt}
            className="image-preview-content"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      {/* Composer */}
        <MessageComposer
          detailOpen={Boolean(detail)}
          capability={capability}
          reply={reply}
          pendingAttachments={pendingAttachments}
          composerSkillAssist={composerSkillAssist}
          replyTarget={replyTarget}
          aiSuggestions={aiSuggestions}
          isAssignedToMe={isAssignedToMe}
          isResolved={isResolved}
          isLockedByAnotherAgent={isLockedByAnotherAgent}
          canSend={canSend}
          uploading={uploading}
          uploadItems={uploadItems}
          composerError={composerError}
          onReplyChange={onReplyChange}
          onSend={sendNow}
          onSelectFiles={(files, mode) => { void startUpload(files, mode); }}
          onRetryUpload={retryUpload}
          onClearAttachments={onClearAttachments}
          onRemoveAttachment={onRemoveAttachment}
          onSetReplyTarget={onSetReplyTarget}
          onClearComposerState={() => {
            onReplyChange("");
            onClearAttachments();
            onSetReplyTarget(null);
            setComposerError("");
            setUploadItems([]);
          }}
          messagePreview={(msg) => messagePreview(msg, t)}
        />
    </section>
  );
}
