/**
 * 菜单路径与名称: 客户中心 -> 调度审计
 * 文件职责: 维护模块内通用类型、筛选常量与日期预设选项。
 * 主要交互文件:
 * - ./components/FilterBar.tsx
 * - ./hooks/useDispatchAuditData.ts
 * - ../../../../i18n/locales/en/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/zh/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/id/modules/dispatch-audit.ts
 */

import type { Dayjs } from "dayjs";

export const TRIGGER_OPTIONS = [
  { value: "inbound_message", label: "inbound_message" },
  { value: "ai_routing", label: "ai_routing" },
  { value: "ai_routing_execution", label: "ai_routing_execution" },
  { value: "agent_assign", label: "agent_assign" },
  { value: "agent_handoff", label: "agent_handoff" },
  { value: "agent_transfer", label: "agent_transfer" },
  { value: "supervisor_transfer", label: "supervisor_transfer" },
  { value: "conversation_resolve", label: "conversation_resolve" },
  { value: "ai_handoff", label: "ai_handoff" }
];

export const DATE_PRESET_OPTIONS = [
  { value: "today", labelKey: "dispatchAudit.datePreset.today" },
  { value: "yesterday", labelKey: "dispatchAudit.datePreset.yesterday" },
  { value: "last7d", labelKey: "dispatchAudit.datePreset.last7d" },
  { value: "custom", labelKey: "dispatchAudit.datePreset.custom" }
] as const;

export type DatePreset = (typeof DATE_PRESET_OPTIONS)[number]["value"];
export type RangeValue = [Dayjs | null, Dayjs | null] | null;
