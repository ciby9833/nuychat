// 作用: AI 会话监控模块的辅助函数（排序、格式化、状态指示器）
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

import type { AIConversationListItem } from "../../types";

export function StatusDot({ item }: { item: AIConversationListItem }) {
  const color = item.handoffRequired ? "#faad14" : item.currentHandlerType === "human" ? "#1677ff" : "#52c41a";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(dateStr).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "今天";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function sortAIConversations(items: AIConversationListItem[]) {
  return [...items].sort((left, right) => {
    const riskDelta = rankRisk(right.riskLevel) - rankRisk(left.riskLevel);
    if (riskDelta !== 0) return riskDelta;
    const rightTime = Date.parse(right.updatedAt || right.lastMessageAt || "") || 0;
    const leftTime = Date.parse(left.updatedAt || left.lastMessageAt || "") || 0;
    return rightTime - leftTime;
  });
}

function rankRisk(level: AIConversationListItem["riskLevel"]) {
  if (level === "high") return 3;
  if (level === "attention") return 2;
  return 1;
}
