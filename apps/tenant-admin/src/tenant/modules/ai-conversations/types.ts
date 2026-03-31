// 作用: AI 会话监控模块的类型定义与筛选常量
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

import i18next from "i18next";
import type { Dayjs } from "dayjs";

export const STATUS_OPTIONS = [
  { value: "all", label: i18next.t("aiConversations.status.all") },
  { value: "bot_active", label: i18next.t("aiConversations.status.bot_active") },
  { value: "handoff_required", label: i18next.t("aiConversations.status.handoff_required") },
  { value: "transferred", label: i18next.t("aiConversations.status.transferred") }
];

export const DATE_PRESET_OPTIONS = [
  { value: "today", label: i18next.t("aiConversations.datePreset.today") },
  { value: "yesterday", label: i18next.t("aiConversations.datePreset.yesterday") },
  { value: "last7d", label: i18next.t("aiConversations.datePreset.last7d") },
  { value: "custom", label: i18next.t("aiConversations.datePreset.custom") }
] as const;

export type DatePreset = (typeof DATE_PRESET_OPTIONS)[number]["value"];
export type RangeValue = [Dayjs | null, Dayjs | null] | null;
