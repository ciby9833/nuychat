// 作用: AI 会话监控左栏 - Telegram 风格会话列表
// 菜单路径: 客户中心 -> AI 会话监控 -> 会话列表
// 作者：吴川

import { Empty, Tag } from "antd";

import type { AIConversationListItem } from "../../../types";
import { StatusDot, formatRelativeTime } from "../helpers";
import { S } from "../styles";

export function ConversationList({
  items,
  selectedConversationId,
  loading,
  onSelect
}: {
  items: AIConversationListItem[];
  selectedConversationId: string;
  loading: boolean;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <div style={S.leftCol}>
      <div style={S.listHeader}>
        <span>会话列表</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: "#bbb" }}>{items.length} 条</span>
      </div>
      <div style={S.listScroll}>
        {items.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: "center" }}><Empty description="暂无 AI 会话" /></div>
        )}
        {items.map((item) => {
          const isSelected = item.conversationId === selectedConversationId;
          const initial = (item.customerName ?? item.customerRef ?? "?").slice(0, 1).toUpperCase();
          return (
            <div
              key={item.conversationId}
              style={S.listItem(isSelected)}
              onClick={() => onSelect(item.conversationId)}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.background = "#f0f5ff"); }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.background = "transparent"); }}
            >
              <div style={S.avatar(item.riskLevel)}>{initial}</div>
              <div style={S.listInfo}>
                <div style={S.listRow}>
                  <span style={S.listName}>{item.customerName ?? item.customerRef ?? "匿名客户"}</span>
                  <span style={S.listTime}>{formatRelativeTime(item.lastMessageAt)}</span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <StatusDot item={item} />
                  <span style={S.listPreview}>{item.lastMessagePreview ?? "暂无消息"}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.channelType.toUpperCase()}</Tag>
                  {item.customerTier ? <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.customerTier}</Tag> : null}
                  {item.riskLevel === "high" ? (
                    <Tag color="red" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>高风险</Tag>
                  ) : item.riskLevel === "attention" ? (
                    <Tag color="orange" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>需关注</Tag>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
