/**
 * 菜单路径与名称: 座席工作台 / 会话详情 / 消息列表
 * 文件职责: 渲染消息气泡、附件、反应、消息菜单，并提供技能处理与创建任务入口。
 * 主要交互文件:
 * - ./TimelinePanel.tsx: 管理消息菜单、反应面板和技能处理弹窗状态。
 * - ./StructuredMessageContent.tsx: 渲染结构化消息内容。
 * - ../hooks/useWorkspaceDashboard.ts: 提供消息数据与交互动作。
 */

import { useMemo, useRef, type RefObject, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { resolveApiUrl } from "../api";
import type { ChannelCapability } from "../constants";
import type { MessageItem } from "../types";
import { StructuredMessageContent } from "./StructuredMessageContent";
import { fullTimestamp, messageDateSeparator } from "../utils";
import { cn } from "../../lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PopoverPlacement = "up" | "down";

type RenderItem =
  | { kind: "sep"; label: string; id: string }
  | { kind: "msg"; msg: MessageItem };

type MessageListProps = {
  detailOpen: boolean;
  messages: MessageItem[];
  capability: ChannelCapability;
  isAssignedToMe: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  hoveredMessageId: string | null;
  messageMenuId: string | null;
  reactionTargetId: string | null;
  reactionPlacement: PopoverPlacement;
  menuPlacement: PopoverPlacement;
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────

function fileIcon(name?: string): string {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xlsx","xls","csv"].includes(ext)) return "📊";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["ppt","pptx"].includes(ext)) return "📽️";
  if (["zip","rar","7z","tar","gz"].includes(ext)) return "📦";
  return "📎";
}

function resolveAttachmentUrl(url?: string): string | undefined {
  return url ? resolveApiUrl(url) : undefined;
}

function getAttachments(content: MessageItem["content"]) {
  return Array.isArray(content.attachments) ? content.attachments : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp-style delivery ticks
// ─────────────────────────────────────────────────────────────────────────────

function DeliveryTick({ status }: { status: MessageItem["message_status"] }) {
  if (status === "failed") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    );
  }
  if (status === "sent") {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
        <polyline points="1,5 5,9 13,1"
          stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
        <polyline points="1,5 5,9 13,1"
          stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="5,5 9,9 17,1"
          stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === "read") {
    return (
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
        <polyline points="1,5 5,9 13,1"
          stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="5,5 9,9 17,1"
          stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icon helpers
// ─────────────────────────────────────────────────────────────────────────────

const IcoSmile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);
const IcoDots = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8"/>
    <circle cx="12" cy="12" r="1.8"/>
    <circle cx="19" cy="12" r="1.8"/>
  </svg>
);
const IcoReply = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7"/>
    <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
  </svg>
);
const IcoTask = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);
const IcoCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IcoSkill = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.7l-1.7-4.7L6 9.3l4.3-1.7L12 3z"/>
    <path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Attachment renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderAttachment(
  att: { url?: string; mimeType?: string; fileName?: string },
  key: string,
  caption: string | undefined,
  onPreviewImage: (url: string, alt: string) => void,
  tAtt: string, tPreview: string, tDl: string,
): ReactNode {
  const url = resolveAttachmentUrl(att.url);
  const mime = att.mimeType ?? "";

  if (mime.startsWith("image/")) {
    return (
      <div key={key} className="flex flex-col gap-1">
        {url && (
          <img src={url} alt={att.fileName ?? "image"}
            className={mime === "image/webp" ? "bubble-img bubble-sticker" : "bubble-img"}
            loading="lazy"
            onClick={() => onPreviewImage(url, att.fileName ?? "image")}
          />
        )}
        {caption && <div className="media-caption">{caption}</div>}
      </div>
    );
  }
  if (mime.startsWith("video/")) {
    return (
      <div key={key} className="flex flex-col gap-1">
        {url && <video src={url} controls className="bubble-video" preload="metadata"/>}
        {caption && <div className="media-caption">{caption}</div>}
      </div>
    );
  }
  if (mime.startsWith("audio/")) {
    return (
      <div key={key} className="flex flex-col gap-1">
        {url && <audio src={url} controls className="bubble-audio" preload="metadata"/>}
        {caption && <div className="media-caption">{caption}</div>}
      </div>
    );
  }
  return (
    <div key={key} className="flex items-center gap-2.5 py-0.5 min-w-0">
      <span className="text-2xl shrink-0">{fileIcon(att.fileName)}</span>
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium truncate">{att.fileName ?? tAtt}</span>
        <span className="text-[11px] opacity-60 truncate">{mime}</span>
        {caption && <span className="text-xs opacity-60">{caption}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {url && mime === "application/pdf" && (
          <a href={url} target="_blank" rel="noreferrer"
            className="text-xs text-blue-400 hover:underline">{tPreview}</a>
        )}
        {url && (
          <a href={url} download={att.fileName}
            className="text-xs text-blue-400 hover:underline">{tDl}</a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side action bar — shown next to each bubble on hover
//
// KEY DESIGN: buttons are INLINE siblings of the bubble inside the same flex
// row. Moving the cursor from bubble → buttons never leaves the container, so
// there is no hover-gap problem. Popups are anchored inside each button wrapper.
// ─────────────────────────────────────────────────────────────────────────────

type SideActionsProps = {
  isOut: boolean;
  canReply: boolean;
  canReact: boolean;
  canTask: boolean;
  visible: boolean;                 // controlled by React state (no CSS hover magic)
  isReactOpen: boolean;
  isMenuOpen: boolean;
  menuPlacement: PopoverPlacement;
  reactionOptions: string[];
  onReply: () => void;
  onToggleReact: (anchor: HTMLElement) => void;
  onToggleMenu: (anchor: HTMLElement) => void;
  onSelectReaction: (emoji: string) => void;
  onMenuClose: () => void;
  onSetReplyTarget: () => void;
  onAddTask: () => void;
  onSkill: () => void;
  onCopy: () => void;
  t: (key: string) => string;
};

function SideActions({
  isOut, canReply, canReact, canTask, visible,
  isReactOpen, isMenuOpen, menuPlacement, reactionOptions,
  onToggleReact, onToggleMenu,
  onSelectReaction, onMenuClose, onSetReplyTarget, onAddTask, onSkill, onCopy,
  t,
}: SideActionsProps) {

  // Base classes for each icon button
  const btn = "flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors cursor-pointer";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 self-end pb-1 transition-opacity duration-150",
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      {/* ── Emoji reaction ── */}
      {canReact && (
        <div className="relative">
          <button
            type="button"
            className={cn(btn, isReactOpen && "text-blue-500 bg-blue-50")}
            title={t("msgList.react")}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => onToggleReact(e.currentTarget)}
          >
            <IcoSmile />
          </button>

          {/* Reaction picker popover — opens UP or DOWN based on space */}
          {isReactOpen && (
            <div
              className={cn(
                "absolute z-50 flex gap-1 p-2 bg-white border border-slate-200 rounded-2xl shadow-xl",
                // Position: always float away from the bubble
                isOut ? "right-full mr-2" : "left-full ml-2",
                menuPlacement === "down" ? "top-0" : "bottom-0",
              )}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {reactionOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-[18px] w-8 h-8 rounded-xl hover:bg-slate-100 hover:scale-125 transition-transform flex items-center justify-center"
                  onClick={() => onSelectReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── More options ── */}
      <div className="relative">
        <button
          type="button"
          className={cn(btn, isMenuOpen && "text-blue-500 bg-blue-50")}
          title={t("msgList.moreActions")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => onToggleMenu(e.currentTarget)}
        >
          <IcoDots />
        </button>

        {/* More-menu dropdown */}
        {isMenuOpen && (
          <div
            className={cn(
              "absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-[156px]",
              isOut ? "right-full mr-2" : "left-full ml-2",
              menuPlacement === "down" ? "top-0" : "bottom-0",
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {canReply && (
              <MenuItem icon={<IcoReply />} label={t("msgList.quoteReply")}
                onClick={() => { onMenuClose(); onSetReplyTarget(); }}/>
            )}
            {canTask && (
              <MenuItem icon={<IcoTask />} label={t("msgList.addToTask")}
                onClick={() => { onMenuClose(); onAddTask(); }}/>
            )}
            <MenuItem icon={<IcoSkill />} label={t("skillAssist.menuAction")}
              onClick={() => { onMenuClose(); onSkill(); }}/>
            <MenuItem icon={<IcoCopy />} label={t("msgList.copyContent")}
              onClick={() => { onMenuClose(); onCopy(); }}/>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors text-left"
    >
      <span className="text-slate-400 shrink-0">{icon}</span>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function MessageList(props: MessageListProps) {
  const {
    detailOpen, messages, capability, isAssignedToMe,
    listRef, bottomRef,
    hoveredMessageId, messageMenuId, reactionTargetId, reactionPlacement, menuPlacement,
    onHoverMessage, onCloseReactionMenuForMessage, onCloseMenus,
    onToggleReactionMenu, onToggleMessageMenu,
    onSetReplyTarget, onAddTaskFromMessage, onOpenSkillAssist, onSendReaction,
    onCopyMessageContent, onPreviewImage,
  } = props;

  const { t } = useTranslation();

  // Delay timer — prevents the bar from vanishing during the few-ms cursor gap
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRowEnter = (id: string) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    onHoverMessage(id);
  };
  const handleRowLeave = (id: string) => {
    leaveTimer.current = setTimeout(() => {
      // Only clear if no popup is still open for this message
      if (messageMenuId !== id && reactionTargetId !== id) {
        onHoverMessage(null);
      }
      onCloseReactionMenuForMessage(id);
    }, 120);
  };

  // ── helpers ──

  const msgPreview = (m: MessageItem | null | undefined): string => {
    if (!m) return "";
    if (m.status_deleted_at) return t("timeline.deleted");
    if (m.reaction_emoji) return m.reaction_emoji;
    if (m.content?.text) return m.content.text;
    if (m.content?.structured?.blocks?.length) return "[structured]";
    const atts = getAttachments(m.content);
    if (atts.length) return atts[0]?.fileName ?? t("timeline.attachment");
    return t("timeline.message");
  };

  const statusLabel = (m: MessageItem): string | null => {
    if (m.direction !== "outbound") return null;
    if (m.status_deleted_at) return t("msgList.msgStatus.deleted");
    switch (m.message_status) {
      case "read":      return t("msgList.msgStatus.read");
      case "delivered": return t("msgList.msgStatus.delivered");
      case "sent":      return t("msgList.msgStatus.sent");
      case "failed":    return t("msgList.msgStatus.failed");
      default: return null;
    }
  };

  const renderBubbleContent = (m: MessageItem): ReactNode => {
    const c = m.content;
    const atts = getAttachments(c);

    if (m.message_type === "media" && atts.length > 0) {
      return (
        <div className="flex flex-col gap-1">
          {atts.map((att, i) => renderAttachment(
            att, `${m.message_id}-${i}`,
            atts.length === 1 && i === 0 ? c.text : undefined,
            onPreviewImage,
            t("msgList.attachment"), t("msgList.preview"), t("msgList.download"),
          ))}
          {atts.length > 1 && c.text && <div className="media-caption">{c.text}</div>}
        </div>
      );
    }

    if (m.message_type === "location" && c.location) {
      return (
        <div className="flex items-start gap-2">
          <span className="text-xl">📍</span>
          <div className="flex flex-col gap-0.5 min-w-0">
            {c.location.name    && <div className="font-medium text-sm">{c.location.name}</div>}
            {c.location.address && <div className="text-xs opacity-75">{c.location.address}</div>}
            <div className="text-[11px] opacity-60 font-mono">
              {c.location.latitude.toFixed(5)}, {c.location.longitude.toFixed(5)}
            </div>
          </div>
        </div>
      );
    }

    if (m.message_type === "contacts" && c.contacts?.length) {
      return (
        <div className="flex flex-col gap-2">
          {c.contacts.map((ct, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">👤 {ct.name ?? t("msgList.unknown")}</span>
              {ct.phones?.map((ph, j) => (
                <span key={j} className="text-xs opacity-75 ml-5">{ph}</span>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (m.message_type === "reaction") {
      return <span className="text-2xl leading-none">{c.text ?? "😀"}</span>;
    }

    if ((m.message_type === "skill_result" || m.message_type === "task_update") && c.skillName) {
      return (
        <div className="skill-result-bubble">
          <div className="skill-result-head">⚡ {c.skillName}</div>
          <pre className="skill-result-body">{JSON.stringify(c.result, null, 2)}</pre>
        </div>
      );
    }

    if (c.structured?.blocks?.length) {
      return <StructuredMessageContent structured={c.structured} fallbackText={c.text} />;
    }

    return c.text ?? t("timeline.nonText");
  };

  // ── Derived data ──

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.message_type === "reaction" && m.reaction_target_message_id) continue;
      const prev = i > 0 ? messages[i - 1] : null;
      const sep  = messageDateSeparator(prev, m);
      if (sep) items.push({ kind: "sep", label: sep, id: `sep-${i}` });
      items.push({ kind: "msg", msg: m });
    }
    return items;
  }, [messages]);

  const reactionsByTarget = useMemo(() => {
    const map = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const m of messages) {
      if (m.message_type !== "reaction" || !m.reaction_target_message_id || !m.reaction_emoji) continue;
      const list = map.get(m.reaction_target_message_id) ?? [];
      const ex = list.find((r) => r.emoji === m.reaction_emoji);
      if (ex) ex.count++; else list.push({ emoji: m.reaction_emoji, count: 1 });
      map.set(m.reaction_target_message_id, list);
    }
    return map;
  }, [messages]);

  // ── Render ──

  return (
    <div ref={listRef}
      className="flex-1 overflow-y-auto bg-white px-4 py-4 flex flex-col gap-0.5">

      {/* Empty states */}
      {!detailOpen && (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
          <span className="text-5xl">💬</span>
          <span className="text-sm">{t("msgList.selectHint")}</span>
        </div>
      )}
      {detailOpen && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
          <span className="text-5xl">📭</span>
          <span className="text-sm">{t("msgList.noMessages")}</span>
        </div>
      )}

      {renderItems.map((item, ri) => {
        /* ── Date separator ── */
        if (item.kind === "sep") {
          return (
            <div key={item.id} className="msg-date-sep my-3">
              <span>{item.label}</span>
            </div>
          );
        }

        const m      = item.msg;
        const isOut  = m.direction === "outbound";
        const isSys  = m.sender_type === "system";
        const isAI   = m.sender_type === "bot" && isOut;
        const isAgt  = m.sender_type === "agent" && isOut;

        const prevItem = renderItems[ri - 1];
        const prevMsg  = prevItem?.kind === "msg" ? prevItem.msg : null;
        const isCluster = m.message_type === "media"
          && prevMsg?.message_type === "media"
          && prevMsg.direction === m.direction
          && prevMsg.sender_id === m.sender_id;

        const canReply   = capability.supportsReply && !isSys;
        const canTask    = isAssignedToMe && !isSys;
        const canReact   = capability.supportsReaction && !isSys;
        const hasActions = (canReply || canTask || canReact) && !isSys;

        const isHovered   = hoveredMessageId === m.message_id;
        const isMenuOpen  = messageMenuId    === m.message_id;
        const isReactOpen = reactionTargetId === m.message_id;
        // Bar is visible when hovered OR any popup is open for this message
        const barVisible  = isHovered || isMenuOpen || isReactOpen;

        const reactions   = reactionsByTarget.get(m.message_id) ?? [];

        // Attribution label
        const aiLabel  = isAI  ? `🤖 ${m.content?.aiAgentName ?? "AI"}` : null;
        const agtLabel = isAgt
          ? [m.sender_name, m.sender_employee_no ? `#${m.sender_employee_no}` : null]
              .filter(Boolean).join(" ")
          : null;
        const attrLabel = aiLabel ?? agtLabel;

        const bubbleCls = isSys ? "msg-bubble-system"
          : isAI  ? "msg-bubble-bot"
          : isOut ? "msg-bubble-out"
          :         "msg-bubble-in";

        return (
          <div
            key={m.message_id}
            className={cn(
              "flex flex-col",
              isSys ? "items-center" : isOut ? "items-end" : "items-start",
              isCluster ? "mb-0.5" : "mb-2",
              "[animation:bubble-in_0.16s_ease_both]"
            )}
            onMouseEnter={() => handleRowEnter(m.message_id)}
            onMouseLeave={() => handleRowLeave(m.message_id)}
          >
            {/* Attribution (AI / agent name) */}
            {attrLabel && (
              <div className={cn(
                "text-[10px] font-medium px-1 pb-0.5 opacity-80",
                isAI ? "text-violet-600" : "text-blue-600"
              )}>
                {attrLabel}
              </div>
            )}

            {/*
              Body row:
              • outbound  → flex-row-reverse  (bubble on RIGHT, actions on LEFT)
              • inbound   → flex-row          (bubble on LEFT, actions on RIGHT)
              • system    → centered, no actions
              Actions are INLINE siblings of the bubble — same flex container —
              so moving the cursor from bubble→buttons never leaves the parent.
            */}
            <div className={cn(
              "flex items-end gap-1",
              isSys  ? "justify-center max-w-[72%]"
              : isOut ? "flex-row-reverse max-w-[78%]"
              :         "flex-row max-w-[78%]"
            )}>
              {/* ── Bubble ── */}
              <div className={cn(
                "px-3 py-2 text-[13px] leading-relaxed break-words min-w-0 max-w-full",
                bubbleCls
              )}>
                {/* Quoted reply — WhatsApp style */}
                {m.reply_to_message_id && (() => {
                  const quoted    = messages.find((x) => x.message_id === m.reply_to_message_id);
                  const qIsOut    = quoted?.direction === "outbound";
                  const senderNm  = qIsOut
                    ? (quoted?.sender_name ?? t("msgList.you"))
                    : t("msgList.customer");
                  return (
                    <div className="reply-preview">
                      <span className="reply-label">{senderNm}</span>
                      <span className="reply-text">{msgPreview(quoted ?? null)}</span>
                    </div>
                  );
                })()}

                {renderBubbleContent(m)}
              </div>

              {/* ── Side action bar ── */}
              {hasActions && (
                <SideActions
                  isOut={isOut}
                  canReply={canReply}
                  canReact={canReact}
                  canTask={canTask}
                  visible={barVisible}
                  isReactOpen={isReactOpen}
                  isMenuOpen={isMenuOpen}
                  menuPlacement={menuPlacement}
                  reactionOptions={capability.reactionOptions}
                  onReply={() => onSetReplyTarget(m.message_id)}
                  onToggleReact={(anchor) => onToggleReactionMenu(m.message_id, anchor)}
                  onToggleMenu={(anchor) => onToggleMessageMenu(m.message_id, anchor)}
                  onSelectReaction={(emoji) => {
                    onCloseReactionMenuForMessage(m.message_id);
                    void onSendReaction(m.message_id, emoji);
                  }}
                  onMenuClose={onCloseMenus}
                  onSetReplyTarget={() => onSetReplyTarget(m.message_id)}
                  onAddTask={() => onAddTaskFromMessage(m.message_id, msgPreview(m))}
                  onSkill={() => onOpenSkillAssist(m.message_id, msgPreview(m))}
                  onCopy={() => onCopyMessageContent(m)}
                  t={t}
                />
              )}
            </div>

            {/* ── Reaction chips ── */}
            {reactions.length > 0 && (
              <div className={cn(
                "flex flex-wrap gap-1 mt-1 px-1",
                isOut ? "justify-end" : "justify-start"
              )}>
                {reactions.map((r) => (
                  <span key={`${m.message_id}-${r.emoji}`}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white border border-slate-200 shadow-sm text-[13px] select-none cursor-default">
                    {r.emoji}
                    {r.count > 1 && (
                      <span className="text-[11px] text-slate-500 font-medium">{r.count}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* ── Timestamp + delivery tick ── */}
            {!isSys && (
              <div className={cn(
                "flex items-center gap-1 mt-0.5 px-1 select-none",
                isOut ? "flex-row-reverse" : "flex-row"
              )}>
                <span className="text-[10px] text-slate-400">
                  {fullTimestamp(m.created_at)}
                  {statusLabel(m) && ` · ${statusLabel(m)}`}
                </span>
                {isOut && <DeliveryTick status={m.message_status} />}
              </div>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
