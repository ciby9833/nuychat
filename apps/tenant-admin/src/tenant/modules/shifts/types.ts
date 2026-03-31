/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理
 * 文件职责: 统一导出排班模块使用的接口类型与表单类型。
 * 主要交互文件:
 * - ./hooks/useShiftsData.ts: 使用列表与状态类型承载接口返回结果。
 * - ./components/ShiftDefinitionsPane.tsx: 使用班次表单类型。
 * - ./components/SchedulePane.tsx: 使用坐席、部门、团队、排班类型。
 * - ./components/PresencePane.tsx: 使用在线状态响应类型。
 */

import type dayjs from "dayjs";

import type {
  AgentPresenceResponse,
  AgentProfile,
  AgentShiftItem,
  DepartmentItem,
  ShiftScheduleItem,
  TeamItem
} from "../../types";

export type { AgentPresenceResponse, AgentProfile, AgentShiftItem, DepartmentItem, ShiftScheduleItem, TeamItem };

export type ShiftFormValues = {
  code: string;
  name: string;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  timezone: string;
};
