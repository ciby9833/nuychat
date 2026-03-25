// 作用: AI 会话监控中栏 - 聊天气泡时间线
// 菜单路径: 客户中心 -> AI 会话监控 -> 对话详情
// 作者：吴川

import { Alert, Space, Tag } from "antd";
import { useEffect, useMemo, useRef } from "react";

import type { AIConversationDetail, AIConversationListItem } from "../../../types";
import { formatDateLabel, formatTime, isSameDay } from "../helpers";
import { S } from "../styles";

export function ChatTimeline({
  detail,
  currentItem,
  detailLoading
}: {
  detail: AIConversationDetail | null;
  currentItem: AIConversationListItem | null;
  detailLoading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [detail?.messages]);
  const messages = detail?.messages ?? [];
  const renderItems = useMemo(
    () => messages.filter((msg) => !(msg.messageType === "reaction" && msg.reactionTargetMessageId)),
    [messages]
  );
  const reactionsByTarget = useMemo(() => {
    const grouped = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const msg of messages) {
      if (msg.messageType !== "reaction" || !msg.reactionTargetMessageId || !msg.reactionEmoji) continue;
      const current = grouped.get(msg.reactionTargetMessageId) ?? [];
      const existing = current.find((item) => item.emoji === msg.reactionEmoji);
      if (existing) existing.count += 1;
      else current.push({ emoji: msg.reactionEmoji, count: 1 });
      grouped.set(msg.reactionTargetMessageId, current);
    }
    return grouped;
  }, [messages]);

  if (!detail || !currentItem) {
    return (
      <div style={S.midCol}>
        <div style={S.chatEmpty}>
          <span style={{ fontSize: 40 }}>💬</span>
          <span>选择左侧会话查看对话详情</span>
        </div>
      </div>
    );
  }

  const conv = detail.conversation;

  return (
    <div style={S.midCol}>
      <div style={S.chatHeader}>
        <div style={S.chatHeaderAvatar}>
          {(conv?.customerName ?? conv?.customerRef ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{conv?.customerName ?? conv?.customerRef ?? "匿名客户"}</div>
          <div style={{ fontSize: 11, color: "#8c8c8c" }}>
            {conv?.channelType.toUpperCase()} · {conv?.customerLanguage ?? "未知"} · {conv?.currentHandlerType === "human" ? "人工处理中" : "AI 处理中"}
          </div>
        </div>
        <Space size={4}>
          {conv?.handoffRequired ? <Tag color="gold">待转人工</Tag> : null}
          {conv?.riskLevel === "high" ? <Tag color="red">高风险</Tag> : conv?.riskLevel === "attention" ? <Tag color="orange">需关注</Tag> : null}
          <Tag color={conv?.currentHandlerType === "human" ? "blue" : "green"}>{conv?.aiAgentName ?? "AI"}</Tag>
        </Space>
      </div>

      {conv?.handoffReason ? (
        <Alert type="warning" showIcon message={`转人工原因: ${conv.handoffReason}`} style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }} />
      ) : null}
      {conv && conv.riskLevel !== "normal" ? (
        <Alert type={conv.riskLevel === "high" ? "error" : "warning"} showIcon
          message={`风险: ${conv.riskReasons.join(" / ")}`}
          style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }}
        />
      ) : null}

      <div style={S.chatScroll}>
        {detailLoading ? (
          <div style={S.chatEmpty}><span>加载中…</span></div>
        ) : detail.messages.length === 0 ? (
          <div style={S.chatEmpty}><span style={{ fontSize: 32 }}>📭</span><span>暂无消息记录</span></div>
        ) : (
          <>
            {renderItems.map((msg, i) => {
              const isOut = msg.direction === "outbound";
              const isAI = msg.senderType === "ai";
              const isAgent = msg.senderType === "agent";
              const prev = i > 0 ? renderItems[i - 1] : null;
              const showDate = !prev || !isSameDay(prev.createdAt, msg.createdAt);
              return (
                <div key={msg.messageId}>
                  {showDate ? (
                    <div style={S.dateSep}>
                      <span style={{ background: "#e8e8e8", padding: "2px 12px", borderRadius: 10, fontSize: 11 }}>
                        {formatDateLabel(msg.createdAt)}
                      </span>
                    </div>
                  ) : null}
                  <div style={S.msgRow(isOut)}>
                    {(isAI || isAgent) ? (
                      <div style={S.msgAttr(isAI)}>
                        {isAI ? `🤖 ${conv?.aiAgentName ?? "AI"}` : `👤 ${conv?.assignedAgentName ?? "人工"}`}
                      </div>
                    ) : null}
                    <div style={S.msgBubbleWrap(isOut)}>
                      <div style={S.msgBubble(isOut, msg.senderType)}>
                        {msg.replyToPreview ? (
                          <div style={S.replyPreview(isOut)}>
                            <div style={S.replyLabel(isOut)}>回复</div>
                            <div style={S.replyText(isOut)}>{msg.replyToPreview}</div>
                          </div>
                        ) : null}
                        {msg.preview}
                      </div>
                      {(reactionsByTarget.get(msg.messageId)?.length ?? 0) > 0 ? (
                        <div style={S.reactionStack(isOut)}>
                          {reactionsByTarget.get(msg.messageId)!.map((reaction) => (
                            <span key={`${msg.messageId}-${reaction.emoji}`} style={S.reactionChip}>
                              <span>{reaction.emoji}</span>
                              {reaction.count > 1 ? <span style={S.reactionCount}>{reaction.count}</span> : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div style={S.msgTime}>{formatTime(msg.createdAt)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
