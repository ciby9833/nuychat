import dayjs from "dayjs";

import type { HumanConversationListItem } from "./types";

export const DATE_PRESET_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last7d", label: "最近7天" },
  { value: "custom", label: "自定义" }
] as const;

export const SCOPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "waiting", label: "待处理" },
  { value: "active", label: "处理中" },
  { value: "exception", label: "异常" },
  { value: "resolved", label: "已解决" }
] as const;

export function formatRelativeTime(value: string | null): string {
  if (!value) return "-";
  const target = dayjs(value);
  const diffMinutes = Math.abs(dayjs().diff(target, "minute"));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.abs(dayjs().diff(target, "hour"));
  if (diffHours < 24) return `${diffHours}小时前`;
  return target.format("MM-DD HH:mm");
}

export function formatDateLabel(value: string): string {
  return dayjs(value).format("YYYY/MM/DD");
}

export function formatTime(value: string): string {
  return dayjs(value).format("HH:mm:ss");
}

export function isSameDay(a: string, b: string): boolean {
  return dayjs(a).isSame(dayjs(b), "day");
}

export function statusColor(item: HumanConversationListItem): string {
  if (item.currentExceptionReason) return "high";
  if (item.waitingSeconds >= 300) return "attention";
  return "normal";
}
