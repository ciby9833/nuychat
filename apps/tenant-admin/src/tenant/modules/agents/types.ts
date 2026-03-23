// 作用: 坐席与成员管理模块的类型定义与常量
// 菜单路径: 系统设置 -> 坐席与成员管理
// 作者：吴川

import { TenantApiError } from "../../api";

export type NewMemberForm = {
  email: string;
  password: string;
  displayName: string;
  employeeNo?: string;
  phone?: string;
  idNumber?: string;
  role: string;
};

export type EnableAgentForm = {
  membershipId: string;
  seniorityLevel: string;
  maxConcurrency: number;
  allowAiAssist: boolean;
};

export type EditMemberForm = {
  role: string;
  status: string;
  displayName: string;
  employeeNo?: string;
  phone?: string;
  idNumber?: string;
};

export const STATUS_COLOR: Record<string, string> = {
  online: "green",
  busy: "orange",
  away: "gold",
  offline: "default"
};

export const STATUS_LABEL: Record<string, string> = {
  online: "在线",
  busy: "忙碌",
  away: "离开",
  offline: "离线"
};

export const SENIORITY_LABEL: Record<string, string> = {
  junior: "初级",
  mid: "中级",
  senior: "高级",
  lead: "组长"
};

export const ROLE_OPTIONS = [
  { value: "tenant_admin", label: "公司超管 (tenant_admin)" },
  { value: "admin", label: "管理员 (admin)" },
  { value: "supervisor", label: "主管 (supervisor)" },
  { value: "senior_agent", label: "高级坐席 (senior_agent)" },
  { value: "agent", label: "坐席 (agent)" },
  { value: "readonly", label: "只读 (readonly)" }
];

export const ROLE_COLOR: Record<string, string> = {
  tenant_admin: "red",
  admin: "volcano",
  supervisor: "purple",
  senior_agent: "blue",
  agent: "geekblue",
  readonly: "default"
};

function getSeatLimitMessage(action: "member_create" | "agent_enable" | "member_upgrade"): string {
  if (action === "member_create") {
    return "当前授权座席已满。除 readonly 外，其他成员角色都会占用座席，请先停用或降级现有成员，或联系平台管理员扩容。";
  }
  if (action === "agent_enable") {
    return "当前授权座席已满，无法开通坐席。请先释放现有座席，或联系平台管理员扩容。";
  }
  return "当前授权座席已满，无法升级成员角色或重新启用成员。请先释放现有座席，或联系平台管理员扩容。";
}

export function getActionErrorMessage(error: unknown, action: "member_create" | "agent_enable" | "member_upgrade"): string {
  if (error instanceof TenantApiError && error.code === "seat_limit_exceeded") {
    return getSeatLimitMessage(action);
  }
  return error instanceof Error ? error.message : "操作失败";
}
