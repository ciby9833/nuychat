/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理
 * 文件职责: 提供排班模块使用的日期生成、状态映射、标签配置与国际化辅助逻辑。
 * 主要交互文件:
 * - ./components/SchedulePane.tsx: 使用星期文案、排班标签与日期辅助函数渲染排班表。
 * - ./components/PresencePane.tsx: 使用在线状态颜色与状态名称。
 * - ./components/ShiftCellPopover.tsx: 使用排班状态与星期文案。
 * - ./modals/BulkScheduleModal.tsx: 使用星期文案、排班状态与休息类型选项。
 * - ./modals/BreakModal.tsx: 使用休息类型选项。
 */

import dayjs from "dayjs";
import i18next from "i18next";
import isoWeek from "dayjs/plugin/isoWeek";

import type { AgentShiftItem } from "./types";

dayjs.extend(isoWeek);

export const STATUS_COLORS: Record<string, string> = {
  online: "#52c41a", busy: "#faad14", away: "#d48806", offline: "#d9d9d9"
};

export function getStatusLabels(): Record<string, string> {
  return {
    online: i18next.t("shiftsModule.helper.statusLabels.online"),
    busy: i18next.t("shiftsModule.helper.statusLabels.busy"),
    away: i18next.t("shiftsModule.helper.statusLabels.away"),
    offline: i18next.t("shiftsModule.helper.statusLabels.offline")
  };
}

export function getShiftStatusOptions() {
  return [
    { value: "scheduled", label: i18next.t("shiftsModule.helper.shiftStatusOptions.scheduled") },
    { value: "off", label: i18next.t("shiftsModule.helper.shiftStatusOptions.off") },
    { value: "leave", label: i18next.t("shiftsModule.helper.shiftStatusOptions.leave") }
  ] as const;
}

export function getBreakTypeOptions() {
  return [
    { value: "break", label: i18next.t("shiftsModule.helper.breakTypeOptions.break") },
    { value: "lunch", label: i18next.t("shiftsModule.helper.breakTypeOptions.lunch") },
    { value: "training", label: i18next.t("shiftsModule.helper.breakTypeOptions.training") }
  ] as const;
}

export function getShiftStatusTagMap(): Record<string, { color: string; bg: string; label: string; dot: string }> {
  return {
    scheduled: { color: "#1677ff", bg: "#e6f4ff", label: i18next.t("shiftsModule.helper.shiftStatusTags.scheduled"), dot: "#1677ff" },
    off: { color: "#595959", bg: "#f5f5f5", label: i18next.t("shiftsModule.helper.shiftStatusTags.off"), dot: "#bfbfbf" },
    leave: { color: "#d46b08", bg: "#fff7e6", label: i18next.t("shiftsModule.helper.shiftStatusTags.leave"), dot: "#fa8c16" }
  };
}

export function weekDays(startDate: string): string[] {
  const monday = dayjs(startDate).isoWeekday(1);
  return Array.from({ length: 7 }, (_, index) => monday.add(index, "day").format("YYYY-MM-DD"));
}

export function monthDays(anchorDate: string): string[] {
  const month = dayjs(anchorDate).startOf("month");
  return Array.from({ length: month.daysInMonth() }, (_, index) => month.add(index, "day").format("YYYY-MM-DD"));
}

export function getDayShort() {
  return i18next.t("shiftsModule.helper.weekdayShort", { returnObjects: true }) as string[];
}

export function getDowShort() {
  return i18next.t("shiftsModule.helper.weekdayFullShort", { returnObjects: true }) as string[];
}

export function isWeekendDate(dateStr: string) {
  const dow = dayjs(dateStr).isoWeekday();
  return dow >= 6;
}

export function buildShiftIndex(agentShifts: AgentShiftItem[]) {
  const map = new Map<string, Map<string, AgentShiftItem>>();
  for (const shift of agentShifts) {
    if (!map.has(shift.agentId)) map.set(shift.agentId, new Map());
    map.get(shift.agentId)!.set(shift.shiftDate, shift);
  }
  return map;
}
