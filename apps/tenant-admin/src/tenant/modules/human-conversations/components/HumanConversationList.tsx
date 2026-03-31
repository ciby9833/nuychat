import { Empty, Tag } from "antd";

import { formatRelativeTime, statusColor } from "../helpers";
import { S } from "../../ai-conversations/styles";
import type { HumanConversationListItem } from "../types";

type HumanConversationListProps = {
  loading: boolean;
  items: HumanConversationListItem[];
  selectedConversationId: string;
  onSelect: (conversationId: string) => void;
};

export function HumanConversationList({
  loading,
  items,
  selectedConversationId,
  onSelect
}: HumanConversationListProps) {
  return (
    <div style={S.leftCol}>
      <div style={S.listHeader}>
        <span>人工会话</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: "#bbb" }}>{items.length} 条</span>
      </div>
      <div style={S.listScroll}>
        {items.length === 0 && !loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Empty description="暂无人工会话" /></div>
        ) : null}
        {items.map((item) => {
          const isSelected = item.conversationId === selectedConversationId;
          const initial = (item.customerName ?? item.customerRef ?? "?").slice(0, 1).toUpperCase();
          return (
            <div
              key={item.conversationId}
              style={S.listItem(isSelected)}
              onClick={() => onSelect(item.conversationId)}
              onMouseEnter={(event) => { if (!isSelected) event.currentTarget.style.background = "#f0f5ff"; }}
              onMouseLeave={(event) => { if (!isSelected) event.currentTarget.style.background = "transparent"; }}
            >
              <div style={S.avatar(statusColor(item))}>{initial}</div>
              <div style={S.listInfo}>
                <div style={S.listRow}>
                  <span style={S.listName}>{item.customerName ?? item.customerRef ?? "匿名客户"}</span>
                  <span style={S.listTime}>{formatRelativeTime(item.lastMessageAt)}</span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={S.listPreview}>{item.lastMessagePreview ?? item.caseTitle ?? "暂无消息"}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  {item.channelType ? <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.channelType.toUpperCase()}</Tag> : null}
                  {item.caseId ? <Tag color="blue" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>事项 {item.caseId.slice(0, 8)}</Tag> : null}
                  {item.currentResponsibleName ? <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.currentResponsibleName}</Tag> : null}
                  {item.currentExceptionReason ? <Tag color="red" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>异常</Tag> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
