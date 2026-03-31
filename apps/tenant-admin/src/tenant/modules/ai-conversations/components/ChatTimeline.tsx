// 作用: AI 会话监控中栏 - 聊天气泡时间线
// 菜单路径: 客户中心 -> AI 会话监控 -> 对话详情
// 作者：吴川

import { Alert, Space, Tag } from "antd";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { StructuredMessageContent } from "../../../components/StructuredMessageContent";
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
  const { t } = useTranslation();
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
          <span>{t("aiConversations.timeline.emptyTitle")}</span>
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>{conv?.customerName ?? conv?.customerRef ?? t("aiConversations.timeline.anonymousCustomer")}</div>
          <div style={{ fontSize: 11, color: "#8c8c8c" }}>
            {conv?.channelType.toUpperCase()} · {conv?.customerLanguage ?? t("aiConversations.timeline.unknownLanguage")} · {conv?.currentHandlerType === "human" ? t("aiConversations.timeline.humanHandling") : t("aiConversations.timeline.aiHandling")}
          </div>
        </div>
        <Space size={4}>
          {conv?.handoffRequired ? <Tag color="gold">{t("aiConversations.timeline.pendingHandoff")}</Tag> : null}
          {conv?.riskLevel === "high" ? <Tag color="red">{t("aiConversations.timeline.highRisk")}</Tag> : conv?.riskLevel === "attention" ? <Tag color="orange">{t("aiConversations.timeline.attention")}</Tag> : null}
          <Tag color={conv?.currentHandlerType === "human" ? "blue" : "green"}>{conv?.aiAgentName ?? t("aiConversations.timeline.aiName")}</Tag>
        </Space>
      </div>

      {conv?.handoffReason ? (
        <Alert type="warning" showIcon message={t("aiConversations.timeline.handoffReason", { reason: conv.handoffReason })} style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }} />
      ) : null}
      {conv && conv.riskLevel !== "normal" ? (
        <Alert type={conv.riskLevel === "high" ? "error" : "warning"} showIcon
          message={t("aiConversations.timeline.riskReason", { reason: conv.riskReasons.join(" / ") })}
          style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }}
        />
      ) : null}

      <div style={S.chatScroll}>
        {detailLoading ? (
          <div style={S.chatEmpty}><span>{t("aiConversations.timeline.loading")}</span></div>
        ) : detail.messages.length === 0 ? (
          <div style={S.chatEmpty}><span style={{ fontSize: 32 }}>📭</span><span>{t("aiConversations.timeline.noMessages")}</span></div>
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
                        {isAI ? `🤖 ${conv?.aiAgentName ?? t("aiConversations.timeline.aiName")}` : `👤 ${conv?.assignedAgentName ?? t("aiConversations.timeline.humanName")}`}
                      </div>
                    ) : null}
                    <div style={S.msgBubbleWrap(isOut)}>
                      <div style={S.msgBubble(isOut, msg.senderType)}>
                        {msg.replyToPreview ? (
                          <div style={S.replyPreview(isOut)}>
                            <div style={S.replyLabel(isOut)}>{t("aiConversations.timeline.reply")}</div>
                            <div style={S.replyText(isOut)}>{msg.replyToPreview}</div>
                          </div>
                        ) : null}
                        <StructuredMessageContent
                          structured={msg.content?.structured}
                          fallbackText={msg.preview}
                          attachments={msg.content?.attachments}
                        />
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
