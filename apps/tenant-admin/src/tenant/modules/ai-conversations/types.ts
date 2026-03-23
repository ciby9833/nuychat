// 作用: AI 会话监控模块的类型定义与筛选常量
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

import type { Dayjs } from "dayjs";

export const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "bot_active", label: "AI 对话中" },
  { value: "handoff_required", label: "待转人工" },
  { value: "transferred", label: "已转人工" }
];

export const DATE_PRESET_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last7d", label: "最近 7 天" },
  { value: "custom", label: "自定义" }
] as const;

export type DatePreset = (typeof DATE_PRESET_OPTIONS)[number]["value"];
export type RangeValue = [Dayjs | null, Dayjs | null] | null;
