/**
 * 功能名称: 消息中间列编排器
 * 菜单路径: 座席工作台 / 消息 / 会话详情
 * 文件职责: 负责会话头部、消息流、输入区三块区域的状态编排，管理上传、消息菜单、预览与手动技能处理等中间列状态。
 * 主要交互文件:
 * - ./messages/ConversationHeader.tsx: 渲染会话头部和会话级动作。
 * - ./messages/ConversationMessageStream.tsx: 渲染消息流、图片预览和手动技能弹窗。
 * - ./messages/ConversationComposerPane.tsx: 渲染回复输入区和发送动作。
 * - ../hooks/useWorkspaceDashboard.ts: 提供会话状态、消息和技能辅助动作。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getChannelCapability, validateUploadForChannel } from "../constants";
import type { AgentColleague, ComposerSkillAssist, ConversationDetail, MessageAttachment, MessageItem, SkillSchema, Ticket } from "../types";
import { ConversationHeader } from "./messages/ConversationHeader";
import { ConversationMessageStream } from "./messages/ConversationMessageStream";
import { ConversationComposerPane } from "./messages/ConversationComposerPane";

type TimelinePanelProps = {
  detail: ConversationDetail | null;
  messages: MessageItem[];
  unreadAnchorCount: number;
  unreadAnchorMessageId: string | null;
  messagesHasMore: boolean;
  messagesLoading: boolean;
  messagesLoadingMore: boolean;
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
  onLoadOlderMessages: () => Promise<void>;
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
    unreadAnchorCount,
    unreadAnchorMessageId,
    messagesHasMore,
    messagesLoading,
    messagesLoadingMore,
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
    onLoadOlderMessages,
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
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const prependScrollHeightRef = useRef<number | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
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
      if (el.scrollTop <= 80 && messagesHasMore && !messagesLoading && !messagesLoadingMore) {
        prependScrollHeightRef.current = el.scrollHeight;
        void onLoadOlderMessages();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [messagesHasMore, messagesLoading, messagesLoadingMore, onLoadOlderMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el && prependScrollHeightRef.current != null) {
      const heightDelta = el.scrollHeight - prependScrollHeightRef.current;
      el.scrollTop += heightDelta;
      prependScrollHeightRef.current = null;
      return;
    }
    const currentConversationId = detail?.conversationId ?? null;
    const latestMessageId = messages.length > 0 ? messages[messages.length - 1]?.message_id ?? null : null;

    if (currentConversationId && previousConversationIdRef.current !== currentConversationId) {
      if (unreadAnchorCount > 0 && unreadDividerRef.current) {
        unreadDividerRef.current.scrollIntoView({ behavior: "instant", block: "start" });
        userScrolledUpRef.current = true;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
        userScrolledUpRef.current = false;
      }
      previousConversationIdRef.current = currentConversationId;
      previousLastMessageIdRef.current = latestMessageId;
      return;
    }

    if (
      currentConversationId
      && latestMessageId
      && previousLastMessageIdRef.current
      && latestMessageId !== previousLastMessageIdRef.current
      && messages.length > 0
      && messages[messages.length - 1]?.message_type !== "reaction"
    ) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      userScrolledUpRef.current = false;
    }
    previousConversationIdRef.current = currentConversationId;
    previousLastMessageIdRef.current = latestMessageId;
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
    previousConversationIdRef.current = null;
    previousLastMessageIdRef.current = null;
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
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <ConversationHeader
        detail={detail}
        viewHint={viewHint}
        isAssignedToMe={isAssignedToMe}
        actionLoading={actionLoading}
        tickets={tickets}
        colleagues={colleagues}
        onAssign={onAssign}
        onHandoff={onHandoff}
        onTransfer={onTransfer}
        onResolve={onResolve}
      />

      <ConversationMessageStream
        detailOpen={Boolean(detail)}
        messages={messages}
        unreadAnchorCount={unreadAnchorCount}
        unreadAnchorMessageId={unreadAnchorMessageId}
        messagesHasMore={messagesHasMore}
        messagesLoading={messagesLoading}
        messagesLoadingMore={messagesLoadingMore}
        capability={capability}
        isAssignedToMe={isAssignedToMe}
        listRef={listRef}
        bottomRef={bottomRef}
        unreadDividerRef={unreadDividerRef}
        hoveredMessageId={hoveredMessageId}
        messageMenuId={messageMenuId}
        reactionTargetId={reactionTargetId}
        reactionPlacement={reactionPlacement}
        menuPlacement={menuPlacement}
        skillSchemas={skillSchemas}
        manualSkillModal={manualSkillModal}
        imagePreview={imagePreview}
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
        onCloseImagePreview={() => setImagePreview(null)}
        onCloseManualSkillModal={() => setManualSkillModal(null)}
        onRunManualSkillAssist={runManualSkillAssist}
        onManualSkillSlugChange={(skillSlug) => {
          setManualSkillModal((current) => current ? { ...current, skillSlug, assist: null, error: "" } : current);
        }}
        onInsertManualSkillResult={(value) => onReplyChange(value)}
      />

      <ConversationComposerPane
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
        onSelectFiles={(files, mode) => {
          void startUpload(files, mode);
        }}
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
