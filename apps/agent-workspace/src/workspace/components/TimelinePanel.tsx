import { useEffect, useMemo, useRef, useState } from "react";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { getChannelCapability, validateUploadForChannel } from "../constants";
import type { AgentColleague, ConversationDetail, MessageAttachment, MessageItem, Ticket } from "../types";

type TimelinePanelProps = {
  detail: ConversationDetail | null;
  messages: MessageItem[];
  reply: string;
  pendingAttachments: MessageAttachment[];
  replyTargetMessageId: string | null;
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

function messagePreview(message: MessageItem | null | undefined): string {
  if (!message) return "";
  if (message.status_deleted_at) return "[已删除]";
  if (message.reaction_emoji) return message.reaction_emoji;
  if (message.content?.text) return message.content.text;
  if (Array.isArray(message.content?.attachments) && message.content.attachments.length > 0) {
    return message.content.attachments[0]?.fileName ?? "[附件]";
  }
  return "[消息]";
}

export function TimelinePanel(props: TimelinePanelProps) {
  const {
    detail,
    messages,
    reply,
    pendingAttachments,
    replyTargetMessageId,
    viewHint,
    aiSuggestions,
    recommendedSkills,
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
    onAddTaskFromMessage
  } = props;

  const [resolveConfirm, setResolveConfirm] = useState(false);
  // Transfer dialog state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const openTickets = tickets.filter((t) => !["done", "cancelled"].includes(t.status));
  const isResolved = detail?.status === "resolved" || detail?.status === "closed";
  // Locked: another agent is actively handling this conversation right now.
  const isLockedByAnotherAgent = Boolean(detail && !isAssignedToMe && detail.status === "human_active");
  // Agent can send when:
  //   • they own the conversation (live), OR
  //   • the conversation is resolved (backend auto-reactivates on send)
  // Blocked only when another agent has it locked in human_active state.
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
  const replyTarget = useMemo(
    () => messages.find((message) => message.message_id === replyTargetMessageId) ?? null,
    [messages, replyTargetMessageId]
  );
  const capability = useMemo(() => getChannelCapability(detail?.channelType), [detail?.channelType]);
  const uploading = uploadItems.some((item) => item.status === "uploading");

  // Track if user has scrolled up
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 200;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Scroll to bottom when a new conversation is selected; also reset transfer state
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.conversationId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(".msg-more-menu") ||
        target.closest(".msg-reaction-menu") ||
        target.closest(".msg-tail-trigger")
      ) return;
      setMessageMenuId(null);
      setReactionTargetId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const sendNow = () => {
    if (!canSend) return;
    // For resolved conversations the outbound worker transparently reactivates
    // the conversation and assigns it to this agent — no separate reopen step.
    void onSendReply();
  };

  const startUpload = async (files: File[], mode: "attachment" | "sticker") => {
    if (files.length === 0 || uploading) return;
    const uniqueFiles = files
      .filter((file, index, current) => (
        current.findIndex((item) => (
          item.name === file.name &&
          item.size === file.size &&
          item.lastModified === file.lastModified
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
      // upload errors are handled per file via onError callbacks
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

  // Sort colleagues: online first, then by name
  const sortedColleagues = useMemo(() => {
    return [...colleagues].sort((a, b) => {
      const aOnline = a.status === "online" || a.status === "busy" ? 0 : 1;
      const bOnline = b.status === "online" || b.status === "busy" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });
  }, [colleagues]);

  const openImagePreview = (url: string, alt: string) => {
    setImagePreview({ url, alt });
  };

  const resolvePopoverPlacement = (anchor: HTMLElement | null): PopoverPlacement => {
    if (!anchor || !listRef.current) return "up";
    const anchorRect = anchor.getBoundingClientRect();
    const listRect = listRef.current.getBoundingClientRect();
    const spaceAbove = anchorRect.top - listRect.top;
    const spaceBelow = listRect.bottom - anchorRect.bottom;
    return spaceAbove < 120 && spaceBelow > spaceAbove ? "down" : "up";
  };

  const copyMessageContent = async (message: MessageItem) => {
    const text = messagePreview(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setComposerError("复制失败，请检查浏览器权限。");
    }
  };

  return (
    <section className="timeline-panel">
      {/* Customer header + actions */}
      <div className="timeline-head">
        {detail ? (
          <>
            <div className="customer-info">
              <div className="customer-avatar">
                {(detail.customerName ?? detail.customerRef ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="customer-name">{detail.customerName ?? detail.customerRef}</div>
                <div className="customer-meta">
                  {detail.customerRef} · {detail.customerLanguage} · {detail.channelType} · {detail.operatingMode}
                </div>
              </div>
            </div>

            <div className="head-actions">
              {!isAssignedToMe && detail.status !== "resolved" && (
                <button onClick={() => void onAssign()} disabled={actionLoading !== null}>
                  {actionLoading === "assign" ? "处理中…" : "接管"}
                </button>
              )}
              {isAssignedToMe && detail.status !== "resolved" && (
                <>
                  <button onClick={() => void onHandoff()} disabled={actionLoading !== null}>
                    {actionLoading === "handoff" ? "处理中…" : "退回 AI"}
                  </button>
                  <button
                    className="transfer-btn"
                    onClick={() => setShowTransfer((v) => !v)}
                    disabled={actionLoading !== null}
                    title="转移给其他客服"
                  >
                    {actionLoading === "transfer" ? "转移中…" : "转移"}
                  </button>
                </>
              )}
              {detail.status !== "resolved" && (
                <button
                  className={resolveConfirm ? "" : "primary"}
                  onClick={handleResolveClick}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "resolve" ? "处理中…" : "解决"}
                </button>
              )}
              {isResolved && (
                <span className="resolved-badge" title="发送消息将自动重新激活此会话">
                  ✓ 已解决
                </span>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: "#8c8c8c" }}>请从左侧选择会话</span>
        )}
      </div>

      {/* Transfer dialog (inline dropdown) */}
      {showTransfer && (
        <div className="transfer-dialog">
          <div className="transfer-dialog-title">转移会话给：</div>
          <select
            className="transfer-select"
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
          >
            <option value="">— 选择客服 —</option>
            {sortedColleagues.map((c) => {
              const isOnline = c.status === "online" || c.status === "busy";
              const label = `${c.displayName ?? "未知"}${c.employeeNo ? ` #${c.employeeNo}` : ""} ${isOnline ? "🟢" : "⚪"}`;
              return (
                <option key={c.agentId} value={c.agentId}>
                  {label}
                </option>
              );
            })}
          </select>
          <input
            className="transfer-reason"
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder="备注（可选）"
          />
          <div className="transfer-actions">
            <button
              className="primary"
              onClick={handleTransferConfirm}
              disabled={!transferTargetId}
            >
              确认转移
            </button>
            <button onClick={() => setShowTransfer(false)}>取消</button>
          </div>
        </div>
      )}

      {/* viewHint banner */}
      {viewHint && (
        <div className={`view-hint-banner ${hintType}`}>{viewHint}</div>
      )}

      {/* Locked banner when not assigned to current agent */}
      {isLockedByAnotherAgent && (
        <div className="view-hint-banner warning">
          🔒 该会话已分配给其他客服，您当前处于只读模式
        </div>
      )}

      {/* Resolve confirmation bar */}
      {resolveConfirm && (
        <div className="resolve-confirm-bar">
          <span className="rc-label">有 {openTickets.length} 个未完成任务</span>
          <button className="danger" onClick={() => { setResolveConfirm(false); void onResolve(); }}>
            结束会话
          </button>
          <button className="cancel" onClick={() => setResolveConfirm(false)}>取消</button>
        </div>
      )}

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
        onSendReaction={onSendReaction}
        onCopyMessageContent={(message) => { void copyMessageContent(message); }}
        onPreviewImage={openImagePreview}
      />

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
            aria-label="关闭图片预览"
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
      <MessageComposer
        detailOpen={Boolean(detail)}
        capability={capability}
        reply={reply}
        pendingAttachments={pendingAttachments}
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
        messagePreview={messagePreview}
      />
    </section>
  );
}
