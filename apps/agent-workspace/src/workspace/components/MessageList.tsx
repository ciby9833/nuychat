import { useMemo, type RefObject, type ReactNode } from "react";

import { resolveApiUrl } from "../api";
import type { ChannelCapability } from "../constants";
import type { MessageItem } from "../types";
import { fullTimestamp, messageDateSeparator } from "../utils";

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
  onSendReaction: (targetMessageId: string, emoji: string) => Promise<void>;
  onCopyMessageContent: (message: MessageItem) => void;
  onPreviewImage: (url: string, alt: string) => void;
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

function resolveAttachmentUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return resolveApiUrl(url);
}

function getAttachments(content: MessageItem["content"]): Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }> {
  return Array.isArray(content.attachments) ? content.attachments : [];
}

function renderAttachment(
  attachment: { url?: string; mimeType?: string; fileName?: string },
  key: string,
  text: string | undefined,
  onPreviewImage: (url: string, alt: string) => void
) {
  const url = resolveAttachmentUrl(attachment.url);
  const mimeType = attachment.mimeType ?? "";

  if (mimeType.startsWith("image/")) {
    return (
      <div key={key} className="media-bubble">
        {url ? (
          <img
            src={url}
            alt={attachment.fileName ?? "image"}
            className={mimeType === "image/webp" ? "bubble-img bubble-sticker" : "bubble-img"}
            loading="lazy"
            onClick={() => onPreviewImage(url, attachment.fileName ?? "image")}
          />
        ) : null}
        {text ? <div className="media-caption">{text}</div> : null}
      </div>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <div key={key} className="media-bubble">
        {url ? <video src={url} controls className="bubble-video" preload="metadata" /> : null}
        {text ? <div className="media-caption">{text}</div> : null}
      </div>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <div key={key} className="media-bubble">
        {url ? <audio src={url} controls className="bubble-audio" preload="metadata" /> : null}
        {text ? <div className="media-caption">{text}</div> : null}
      </div>
    );
  }

  return (
    <div key={key} className="file-bubble">
      <span className="file-icon">{fileIcon(attachment.fileName)}</span>
      <div className="file-info">
        <span className="file-name">{attachment.fileName ?? "附件"}</span>
        <span className="file-type">{mimeType}</span>
        {text ? <span className="file-caption">{text}</span> : null}
      </div>
      <div className="file-actions">
        {url && mimeType === "application/pdf" ? (
          <a href={url} target="_blank" rel="noreferrer" className="file-action-btn">
            预览
          </a>
        ) : null}
        {url ? (
          <a href={url} download={attachment.fileName} className="file-download">下载</a>
        ) : null}
      </div>
    </div>
  );
}

function renderBubbleContent(
  message: MessageItem,
  onPreviewImage: (url: string, alt: string) => void
): ReactNode {
  const content = message.content;
  const attachments = getAttachments(content);

  if (message.message_type === "media" && attachments.length > 0) {
    return (
      <div>
        {attachments.map((attachment, index) => renderAttachment(
          attachment,
          `${message.message_id}-${index}`,
          attachments.length === 1 && index === 0 ? content.text : undefined,
          onPreviewImage
        ))}
        {attachments.length > 1 && content.text ? <div className="media-caption">{content.text}</div> : null}
      </div>
    );
  }

  if (message.message_type === "location" && content.location) {
    return (
      <div className="location-bubble">
        <span className="location-pin">📍</span>
        <div>
          {content.location.name ? <div className="location-name">{content.location.name}</div> : null}
          {content.location.address ? <div className="location-addr">{content.location.address}</div> : null}
          <div className="location-coord">
            {content.location.latitude.toFixed(5)}, {content.location.longitude.toFixed(5)}
          </div>
        </div>
      </div>
    );
  }

  if (message.message_type === "contacts" && content.contacts?.length) {
    return (
      <div className="contacts-bubble">
        {content.contacts.map((contact, index) => (
          <div key={index} className="contact-row">
            <span className="contact-name">👤 {contact.name ?? "未知"}</span>
            {contact.phones?.map((phone, phoneIndex) => (
              <span key={phoneIndex} className="contact-phone">{phone}</span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (message.message_type === "reaction") {
    return <span className="reaction-bubble">{content.text ?? "😀"}</span>;
  }

  if ((message.message_type === "skill_result" || message.message_type === "task_update") && content.skillName) {
    return (
      <div className="skill-result-bubble">
        <div className="skill-result-head">⚡ {content.skillName}</div>
        <pre className="skill-result-body">
          {JSON.stringify(content.result, null, 2)}
        </pre>
      </div>
    );
  }

  return content.text ?? "[非文本消息]";
}

function messagePreview(message: MessageItem | null | undefined): string {
  if (!message) return "";
  if (message.status_deleted_at) return "[已删除]";
  if (message.reaction_emoji) return message.reaction_emoji;
  if (message.content?.text) return message.content.text;
  const attachments = getAttachments(message.content);
  if (attachments.length > 0) {
    return attachments[0]?.fileName ?? "[附件]";
  }
  return "[消息]";
}

function statusLabel(message: MessageItem): string | null {
  if (message.direction !== "outbound") return null;
  if (message.status_deleted_at) return "已删除";
  switch (message.message_status) {
    case "read":
      return "已读";
    case "delivered":
      return "已送达";
    case "sent":
      return "已发送";
    case "failed":
      return "失败";
    default:
      return null;
  }
}

export function MessageList(props: MessageListProps) {
  const {
    detailOpen,
    messages,
    capability,
    isAssignedToMe,
    listRef,
    bottomRef,
    hoveredMessageId,
    messageMenuId,
    reactionTargetId,
    reactionPlacement,
    menuPlacement,
    onHoverMessage,
    onCloseReactionMenuForMessage,
    onCloseMenus,
    onToggleReactionMenu,
    onToggleMessageMenu,
    onSetReplyTarget,
    onAddTaskFromMessage,
    onSendReaction,
    onCopyMessageContent,
    onPreviewImage
  } = props;

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.message_type === "reaction" && message.reaction_target_message_id) {
        continue;
      }
      const previous = index > 0 ? messages[index - 1] : null;
      const separator = messageDateSeparator(previous, message);
      if (separator) {
        items.push({ kind: "sep", label: separator, id: `sep-${index}` });
      }
      items.push({ kind: "msg", msg: message });
    }
    return items;
  }, [messages]);

  const reactionsByTarget = useMemo(() => {
    const grouped = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const message of messages) {
      if (message.message_type !== "reaction" || !message.reaction_target_message_id || !message.reaction_emoji) {
        continue;
      }
      const current = grouped.get(message.reaction_target_message_id) ?? [];
      const existing = current.find((item) => item.emoji === message.reaction_emoji);
      if (existing) {
        existing.count += 1;
      } else {
        current.push({ emoji: message.reaction_emoji, count: 1 });
      }
      grouped.set(message.reaction_target_message_id, current);
    }
    return grouped;
  }, [messages]);

  return (
    <div className="message-timeline" ref={listRef}>
      {!detailOpen ? (
        <div className="tl-empty">
          <div className="tl-empty-icon">💬</div>
          <div>选择一个会话开始协作处理</div>
        </div>
      ) : null}

      {detailOpen && messages.length === 0 ? (
        <div className="tl-empty">
          <div className="tl-empty-icon">📭</div>
          <div>暂无消息记录</div>
        </div>
      ) : null}

      {renderItems.map((item, renderIndex) => {
        if (item.kind === "sep") {
          return (
            <div key={item.id} className="msg-date-sep">
              <span>{item.label}</span>
            </div>
          );
        }

        const message = item.msg;
        const isOutbound = message.direction === "outbound";
        const isSystem = message.sender_type === "system";
        const isAI = message.sender_type === "bot" && isOutbound;
        const isAgent = message.sender_type === "agent" && isOutbound;
        const previousItem = renderItems[renderIndex - 1];
        const previousMessage = previousItem?.kind === "msg" ? previousItem.msg : null;
        const isMediaCluster = message.message_type === "media" &&
          previousMessage?.message_type === "media" &&
          previousMessage.direction === message.direction &&
          previousMessage.sender_id === message.sender_id;
        const rowClass = isSystem ? "system" : isOutbound ? "out" : "in";
        const bubbleClass = isSystem ? "system" : isAI ? "bot" : isOutbound ? "out" : "in";
        const canReplyToMessage = capability.supportsReply && !isSystem;
        const canAddTaskFromMessage = isAssignedToMe && !isSystem;
        const canReactToMessage = capability.supportsReaction && !isSystem;
        const hasMessageActions = canReplyToMessage || canAddTaskFromMessage || canReactToMessage;
        const isHovered = hoveredMessageId === message.message_id;
        const isMenuOpen = messageMenuId === message.message_id;
        const isReactionOpen = reactionTargetId === message.message_id;
        const showActionTrigger = hasMessageActions && !isSystem && (isHovered || isMenuOpen || isReactionOpen);
        const aiLabel = isAI ? `🤖 ${message.content?.aiAgentName ?? "AI 助手"}` : null;
        const agentLabel = isAgent
          ? [message.sender_name, message.sender_employee_no ? `#${message.sender_employee_no}` : null]
              .filter(Boolean)
              .join(" ")
          : null;
        const attrLabel = aiLabel ?? agentLabel;

        return (
          <div
            key={message.message_id}
            className={`msg-row ${rowClass}${isMediaCluster ? " media-cluster" : ""}${isMenuOpen || isReactionOpen ? " is-overlay-open" : ""}`}
            onMouseEnter={() => onHoverMessage(message.message_id)}
            onMouseLeave={() => {
              onHoverMessage(null);
              onCloseReactionMenuForMessage(message.message_id);
            }}
          >
            {attrLabel ? (
              <div className={`msg-agent-attr${isAI ? " ai-attr" : ""}`}>{attrLabel}</div>
            ) : null}
            <div className={`msg-body ${rowClass}`}>
              <div className={`msg-bubble ${bubbleClass}`}>
                {message.reply_to_message_id ? (
                  <div className="reply-preview">
                    <span className="reply-label">回复</span>
                    <span className="reply-text">
                      {messagePreview(messages.find((itemMessage) => itemMessage.message_id === message.reply_to_message_id) ?? null)}
                    </span>
                  </div>
                ) : null}
                {renderBubbleContent(message, onPreviewImage)}
              </div>
              {(reactionsByTarget.get(message.message_id)?.length ?? 0) > 0 ? (
                <div className={`msg-reaction-stack ${rowClass}`}>
                  {reactionsByTarget.get(message.message_id)!.map((reaction) => (
                    <span key={`${message.message_id}-${reaction.emoji}`} className="msg-reaction-chip">
                      <span>{reaction.emoji}</span>
                      {reaction.count > 1 ? <span className="msg-reaction-count">{reaction.count}</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              {showActionTrigger ? (
                <div className={`msg-tail-actions ${rowClass}`}>
                  {canReactToMessage ? (
                    <div className="msg-tail-group">
                      <button
                        type="button"
                        className={`msg-tail-trigger ${rowClass}${isReactionOpen ? " active" : ""}`}
                        title="表情回复"
                        aria-label="表情回复"
                        onClick={(event) => onToggleReactionMenu(message.message_id, event.currentTarget)}
                      >
                        <span className="msg-tail-emoji">🙂</span>
                      </button>
                      {isReactionOpen ? (
                        <div className={`msg-reaction-menu ${rowClass} ${reactionPlacement}`}>
                          {capability.reactionOptions.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="reaction-choice"
                              onClick={() => {
                                onCloseReactionMenuForMessage(message.message_id);
                                void onSendReaction(message.message_id, emoji);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="msg-tail-group">
                    <button
                      type="button"
                      className={`msg-tail-trigger ${rowClass}${isMenuOpen ? " active" : ""}`}
                      title="更多操作"
                      aria-label="更多操作"
                      onClick={(event) => onToggleMessageMenu(message.message_id, event.currentTarget)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="19" cy="12" r="1.8" />
                      </svg>
                    </button>
                    {isMenuOpen ? (
                      <div className={`msg-more-menu ${rowClass} ${menuPlacement}`}>
                        {canReplyToMessage ? (
                            <button
                              type="button"
                              className="msg-more-item"
                              onClick={() => {
                              onCloseMenus();
                              onSetReplyTarget(message.message_id);
                            }}
                          >
                            <span className="msg-more-icon">↩</span>
                            <span>引用回复</span>
                          </button>
                        ) : null}
                        {canAddTaskFromMessage ? (
                          <button
                            type="button"
                            className="msg-more-item"
                            onClick={() => {
                              onCloseMenus();
                              onAddTaskFromMessage(message.message_id, messagePreview(message));
                            }}
                          >
                            <span className="msg-more-icon">✓</span>
                            <span>添加到任务</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="msg-more-item"
                          onClick={() => {
                            onCloseMenus();
                            onCopyMessageContent(message);
                          }}
                        >
                          <span className="msg-more-icon">⧉</span>
                          <span>复制内容</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="msg-time msg-time--full">
              {fullTimestamp(message.created_at)}
              {statusLabel(message) ? ` · ${statusLabel(message)}` : ""}
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
