/**
 * 功能名称: 会话消息流
 * 菜单路径: 座席工作台 / 消息 / 会话详情 / 消息流
 * 文件职责: 承载消息列表滚动区域，以及图片预览、手动技能处理弹窗等消息上下文辅助交互。
 * 交互页面:
 * - ./MessagesWorkspace.tsx: 消息工作台页面，组合左侧会话列表和右侧上下文面板。
 * - ../TimelinePanel.tsx: 编排消息列表、消息菜单状态和预览状态。
 * - ../MessageList.tsx: 真正渲染消息气泡、菜单、附件与任务入口。
 */

import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { MessageList } from "../MessageList";
import { SkillAssistCard } from "../SkillAssistCard";
import type { ChannelCapability } from "../../constants";
import type { ComposerSkillAssist, MessageItem, SkillSchema } from "../../types";

type PopoverPlacement = "up" | "down";

type ManualSkillModalState = {
  messageId: string;
  preview: string;
  skillSlug: string;
  loading: boolean;
  assist: ComposerSkillAssist | null;
  error: string;
} | null;

type ConversationMessageStreamProps = {
  detailOpen: boolean;
  messages: MessageItem[];
  unreadAnchorCount: number;
  unreadAnchorMessageId: string | null;
  messagesHasMore: boolean;
  messagesLoading: boolean;
  messagesLoadingMore: boolean;
  capability: ChannelCapability;
  isAssignedToMe: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  unreadDividerRef: RefObject<HTMLDivElement | null>;
  hoveredMessageId: string | null;
  messageMenuId: string | null;
  reactionTargetId: string | null;
  reactionPlacement: PopoverPlacement;
  menuPlacement: PopoverPlacement;
  skillSchemas: SkillSchema[];
  manualSkillModal: ManualSkillModalState;
  imagePreview: { url: string; alt: string } | null;
  onHoverMessage: (messageId: string | null) => void;
  onCloseReactionMenuForMessage: (messageId: string) => void;
  onCloseMenus: () => void;
  onToggleReactionMenu: (messageId: string, anchor: HTMLElement) => void;
  onToggleMessageMenu: (messageId: string, anchor: HTMLElement) => void;
  onSetReplyTarget: (messageId: string | null) => void;
  onAddTaskFromMessage: (messageId: string, preview: string) => void;
  onOpenSkillAssist: (messageId: string, preview: string) => void;
  onSendReaction: (targetMessageId: string, emoji: string) => Promise<void>;
  onCopyMessageContent: (message: MessageItem) => void;
  onPreviewImage: (url: string, alt: string) => void;
  onCloseImagePreview: () => void;
  onCloseManualSkillModal: () => void;
  onRunManualSkillAssist: () => void;
  onManualSkillSlugChange: (skillSlug: string) => void;
  onInsertManualSkillResult: (value: string) => void;
};

export function ConversationMessageStream(props: ConversationMessageStreamProps) {
  const {
    detailOpen,
    messages,
    unreadAnchorCount,
    unreadAnchorMessageId,
    messagesHasMore,
    messagesLoading,
    messagesLoadingMore,
    capability,
    isAssignedToMe,
    listRef,
    bottomRef,
    unreadDividerRef,
    hoveredMessageId,
    messageMenuId,
    reactionTargetId,
    reactionPlacement,
    menuPlacement,
    skillSchemas,
    manualSkillModal,
    imagePreview,
    onHoverMessage,
    onCloseReactionMenuForMessage,
    onCloseMenus,
    onToggleReactionMenu,
    onToggleMessageMenu,
    onSetReplyTarget,
    onAddTaskFromMessage,
    onOpenSkillAssist,
    onSendReaction,
    onCopyMessageContent,
    onPreviewImage,
    onCloseImagePreview,
    onCloseManualSkillModal,
    onRunManualSkillAssist,
    onManualSkillSlugChange,
    onInsertManualSkillResult
  } = props;

  const { t } = useTranslation();

  return (
    <>
      <MessageList
        detailOpen={detailOpen}
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
        onHoverMessage={onHoverMessage}
        onCloseReactionMenuForMessage={onCloseReactionMenuForMessage}
        onCloseMenus={onCloseMenus}
        onToggleReactionMenu={onToggleReactionMenu}
        onToggleMessageMenu={onToggleMessageMenu}
        onSetReplyTarget={onSetReplyTarget}
        onAddTaskFromMessage={onAddTaskFromMessage}
        onOpenSkillAssist={onOpenSkillAssist}
        onSendReaction={onSendReaction}
        onCopyMessageContent={(message) => {
          void onCopyMessageContent(message);
        }}
        onPreviewImage={onPreviewImage}
      />

      {manualSkillModal ? (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" onClick={onCloseManualSkillModal}>
          <div
            className="max-h-[80vh] w-[min(720px,92vw)] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{t("skillAssist.manual.title")}</div>
                <div className="truncate text-xs text-slate-500">{manualSkillModal.preview || t("timeline.message")}</div>
              </div>
              <button
                type="button"
                className="h-8 rounded-md bg-slate-100 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
                onClick={onCloseManualSkillModal}
              >
                {t("skillAssist.manual.close")}
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-600">{t("skillAssist.manual.selectSkill")}</label>
                <select
                  value={manualSkillModal.skillSlug}
                  onChange={(event) => onManualSkillSlugChange(event.target.value)}
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
                  onClick={onRunManualSkillAssist}
                  className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {manualSkillModal.loading ? t("skillAssist.manual.processing") : t("skillAssist.manual.execute")}
                </button>
              </div>
              {manualSkillModal.error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {manualSkillModal.error}
                </div>
              ) : null}
              {manualSkillModal.assist ? (
                <SkillAssistCard assist={manualSkillModal.assist} onInsert={onInsertManualSkillResult} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {imagePreview ? (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" onClick={onCloseImagePreview}>
          <button
            type="button"
            className="image-preview-close"
            aria-label={t("timeline.closePreview")}
            onClick={onCloseImagePreview}
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
    </>
  );
}
