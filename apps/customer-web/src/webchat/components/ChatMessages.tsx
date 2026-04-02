import { CopyOutlined, MessageOutlined, SmileOutlined } from "@ant-design/icons";
import { Button, Dropdown, Empty, Space, Tag, Typography } from "antd";
import { Bubble } from "@ant-design/x";
import { useEffect, useMemo, useState } from "react";

import type { WebchatAttachment, WebchatMessage } from "../types";
import { resolveApiBase } from "../config";
import { StructuredMessageContent } from "./StructuredMessageContent";

const API_BASE = resolveApiBase();
const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function resolveAttachmentUrl(url?: string) {
  if (!url) return undefined;
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return new URL(url, API_BASE).toString();
}

function isSelfMessage(message: WebchatMessage) {
  if (message.sender_type === "customer") return true;
  if (message.sender_type === "agent" || message.sender_type === "bot" || message.sender_type === "system") return false;
  return message.direction === "inbound";
}

function previewReplyContent(content?: { text?: string; attachments?: WebchatAttachment[] } | null) {
  if (!content) return "";
  if (content.text?.trim()) return content.text.trim();
  if (content.attachments?.length) return content.attachments[0]?.name ?? "附件消息";
  return "消息";
}

function previewMessage(message: WebchatMessage | null | undefined) {
  if (!message) return "";
  if (message.reactionEmoji) return message.reactionEmoji;
  if (message.text.trim()) return message.text.trim();
  if (message.attachments?.length) return message.attachments[0]?.name ?? "附件消息";
  if (message.structured?.blocks?.length) return "结构化消息";
  return "消息";
}

function MessageBody(props: {
  message: WebchatMessage;
  quotedMessage: WebchatMessage | null;
  text: string;
  onPreviewImage: (url: string, alt: string) => void;
}) {
  const { message, quotedMessage, text } = props;

  return (
    <div className="x-chat-bubble-body">
      {message.replyToMessageId ? (
        <div className="reply-preview">
          <span className="reply-label">
            {quotedMessage ? (isSelfMessage(quotedMessage) ? "你自己" : "客服") : "引用消息"}
          </span>
          <span className="reply-text">
            {quotedMessage ? previewMessage(quotedMessage) : previewReplyContent(message.replyToContent)}
          </span>
        </div>
      ) : null}

      <StructuredMessageContent structured={message.structured} fallbackText={text} />

      {message.attachments?.length ? (
        <div className="bubble-attachments">
          {message.attachments.map((file, idx) => {
            const fileUrl = resolveAttachmentUrl(file.url);
            const isImage = file.mimeType.startsWith("image/");

            return (
              <a
                key={`${message.id}-${idx}`}
                className="bubble-file"
                href={fileUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!isImage || !fileUrl) return;
                  event.preventDefault();
                  props.onPreviewImage(fileUrl, file.name);
                }}
              >
                {isImage && fileUrl ? <img src={fileUrl} alt={file.name} /> : null}
                <span>{file.name}</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ChatMessages(props: {
  messages: WebchatMessage[];
  loading: boolean;
  onReply: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => Promise<void>;
}) {
  const [typedContent, setTypedContent] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<{ url: string; alt: string } | null>(null);

  const newestAgentMessage = useMemo(() => {
    const rows = [...props.messages].reverse();
    return rows.find((item) => !isSelfMessage(item) && item.text) ?? null;
  }, [props.messages]);

  const visibleMessages = useMemo(
    () => props.messages.filter((message) => !(message.type === "reaction" && message.reactionTargetMessageId)),
    [props.messages]
  );

  const reactionsByTarget = useMemo(() => {
    const map = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const message of props.messages) {
      if (message.type !== "reaction" || !message.reactionTargetMessageId || !message.reactionEmoji) continue;
      const current = map.get(message.reactionTargetMessageId) ?? [];
      const existing = current.find((item) => item.emoji === message.reactionEmoji);
      if (existing) existing.count += 1;
      else current.push({ emoji: message.reactionEmoji, count: 1 });
      map.set(message.reactionTargetMessageId, current);
    }
    return map;
  }, [props.messages]);

  useEffect(() => {
    if (!newestAgentMessage || !newestAgentMessage.text) return;
    const target = newestAgentMessage.text;
    const current = typedContent[newestAgentMessage.id] ?? "";
    if (current === target) return;

    let cursor = current.length;
    const timer = window.setInterval(() => {
      cursor += 2;
      const next = target.slice(0, cursor);
      setTypedContent((prev) => ({ ...prev, [newestAgentMessage.id]: next }));
      if (next.length >= target.length) {
        window.clearInterval(timer);
      }
    }, 12);

    return () => window.clearInterval(timer);
  }, [newestAgentMessage, typedContent]);

  const items = useMemo(() => visibleMessages.map((message) => {
    const self = isSelfMessage(message);
    const quoted = message.replyToMessageId
      ? visibleMessages.find((item) => item.id === message.replyToMessageId) ?? null
      : null;
    const reactions = reactionsByTarget.get(message.id) ?? [];
    const text = !self && message.text ? (typedContent[message.id] ?? message.text) : message.text;

    return {
      key: message.id,
      role: self ? "user" : "ai",
      placement: self ? "end" as const : "start" as const,
      variant: self ? "shadow" as const : "outlined" as const,
      shape: "corner" as const,
      typing: !self,
      content: (
        <MessageBody
          message={message}
          quotedMessage={quoted}
          text={text}
          onPreviewImage={(url, alt) => setImagePreview({ url, alt })}
        />
      ),
      footer: (
        <div className="x-chat-meta">
          <Typography.Text type="secondary">
            {new Date(message.createdAt).toLocaleString()}
          </Typography.Text>
          {reactions.length > 0 ? (
            <Space size={6} wrap>
              {reactions.map((reaction) => (
                <Tag key={`${message.id}-${reaction.emoji}`} className="reaction-chip" bordered>
                  {reaction.emoji}{reaction.count > 1 ? ` ${reaction.count}` : ""}
                </Tag>
              ))}
            </Space>
          ) : null}
        </div>
      ),
      extra: (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              {
                key: "reply",
                icon: <MessageOutlined />,
                label: "回复",
                onClick: () => props.onReply(message.id)
              },
              ...REACTION_OPTIONS.map((emoji) => ({
                key: `react-${emoji}`,
                icon: <SmileOutlined />,
                label: emoji,
                onClick: () => { void props.onReact(message.id, emoji); }
              })),
              {
                key: "copy",
                icon: <CopyOutlined />,
                label: "复制",
                onClick: async () => {
                  await navigator.clipboard.writeText(previewMessage(message));
                }
              }
            ]
          }}
        >
          <Button type="text" size="small" className="x-chat-action-btn">···</Button>
        </Dropdown>
      )
    };
  }), [props, reactionsByTarget, typedContent, visibleMessages]);

  return (
    <main className="chat-messages x-chat-messages">
      {items.length === 0 && !props.loading ? (
        <div className="chat-empty">
          <Empty description="欢迎咨询，消息发送后客服或 AI 将尽快回复。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <Bubble.List
          autoScroll
          className="x-chat-bubble-list"
          items={items}
          role={{
            user: {
              placement: "end",
              avatar: <span>你</span>
            },
            ai: {
              placement: "start",
              avatar: <span>客</span>
            }
          }}
        />
      )}

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
    </main>
  );
}
