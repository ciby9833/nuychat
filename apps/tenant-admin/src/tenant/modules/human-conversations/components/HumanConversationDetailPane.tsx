import { Alert, Space, Tag } from "antd";

import { StructuredMessageContent } from "../../../components/StructuredMessageContent";
import { formatDateLabel, formatTime, isSameDay } from "../helpers";
import { S } from "../../ai-conversations/styles";
import type { HumanConversationDetail, HumanConversationListItem } from "../types";

type HumanConversationDetailPaneProps = {
  detail: HumanConversationDetail | null;
  currentItem: HumanConversationListItem | null;
  detailLoading: boolean;
  renderMessages: HumanConversationDetail["messages"];
  reactionsByTarget: Map<string, Array<{ emoji: string; count: number }>>;
};

export function HumanConversationDetailPane({
  detail,
  currentItem,
  detailLoading,
  renderMessages,
  reactionsByTarget
}: HumanConversationDetailPaneProps) {
  if (!detail) {
    return (
      <div style={S.midCol}>
        <div style={S.chatEmpty}>
          <span style={{ fontSize: 40 }}>💬</span>
          <span>选择左侧会话查看详情</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.midCol}>
      <div style={S.chatHeader}>
        <div style={S.chatHeaderAvatar}>
          {(detail.conversation.customerName ?? detail.conversation.customerRef ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{detail.conversation.customerName ?? detail.conversation.customerRef ?? "匿名客户"}</div>
          <div style={{ fontSize: 11, color: "#8c8c8c" }}>
            {(detail.conversation.channelType ?? "").toUpperCase()} · {detail.conversation.customerLanguage ?? "未知"} · {detail.conversation.caseTitle ?? "未命名事项"}
          </div>
        </div>
        <Space size={4}>
          {detail.conversation.caseStatus ? <Tag color="blue">{detail.conversation.caseStatus}</Tag> : null}
          {detail.conversation.queueStatus ? <Tag color="gold">{detail.conversation.queueStatus}</Tag> : null}
          {detail.conversation.currentOwnerName ? <Tag color="green">{detail.conversation.currentOwnerName}</Tag> : null}
        </Space>
      </div>

      {detail.conversation.caseSummary ? (
        <Alert type="info" showIcon message={detail.conversation.caseSummary} style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }} />
      ) : null}

      <div style={S.chatScroll}>
        {detailLoading ? (
          <div style={S.chatEmpty}><span>加载中…</span></div>
        ) : detail.messages.length === 0 ? (
          <div style={S.chatEmpty}><span style={{ fontSize: 32 }}>📭</span><span>暂无消息记录</span></div>
        ) : (
          renderMessages.map((msg, index) => {
            const isOut = msg.direction === "outbound";
            const previous = index > 0 ? renderMessages[index - 1] : null;
            const showDate = !previous || !isSameDay(previous.createdAt, msg.createdAt);
            const isAI = msg.senderType === "ai";
            const attrColor = isAI ? "#52c41a" : msg.senderType === "agent" ? "#1677ff" : "#8c8c8c";
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
                  {msg.senderType !== "customer" ? (
                    <div style={{ ...S.msgAttr(isAI), color: attrColor }}>
                      {msg.senderName ?? (isAI ? "AI" : "人工")}
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
          })
        )}
      </div>
    </div>
  );
}
