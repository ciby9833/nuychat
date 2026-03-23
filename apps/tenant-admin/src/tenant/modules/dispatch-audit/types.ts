// 作用: 调度审计模块类型定义与常量选项
// 菜单路径: 客户中心 -> 调度审计
// 作者：吴川

import type { Dayjs } from "dayjs";

export const TRIGGER_OPTIONS = [
  { value: "inbound_message", label: "入站消息" },
  { value: "ai_routing", label: "AI 路由" },
  { value: "agent_assign", label: "人工接管" },
  { value: "agent_handoff", label: "人工转队列" },
  { value: "agent_transfer", label: "人工转人工" },
  { value: "supervisor_transfer", label: "主管转移" },
  { value: "conversation_resolve", label: "会话解决" }
];

export const DATE_PRESET_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last7d", label: "最近 7 天" },
  { value: "custom", label: "自定义" }
] as const;

export type DatePreset = (typeof DATE_PRESET_OPTIONS)[number]["value"];
export type RangeValue = [Dayjs | null, Dayjs | null] | null;
