// 作用: 坐席与成员管理模块共享表单与展示类型。
// 菜单路径: 系统设置 -> 坐席与成员管理。
// 交互: 被 AgentsTab 及其子组件复用，统一成员/坐席/WA Seat 的前端字段处理。

import i18next from "i18next";
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
  waSeatEnabled?: boolean;
};

export const STATUS_COLOR: Record<string, string> = {
  online:  "green",
  busy:    "orange",
  away:    "gold",
  offline: "default"
};

export const ROLE_COLOR: Record<string, string> = {
  tenant_admin:  "red",
  admin:         "volcano",
  supervisor:    "purple",
  senior_agent:  "blue",
  agent:         "geekblue",
  readonly:      "default"
};

/** Translated at call-time via i18next singleton (safe outside React) */
export function statusLabel(status: string): string {
  return i18next.t(`agents.status.${status}`, { defaultValue: status });
}

export function seniorityLabel(level: string): string {
  return i18next.t(`agents.seniority.${level}`, { defaultValue: level });
}

export function seniorityOptions(): { value: string; label: string }[] {
  return ["junior", "mid", "senior", "lead"].map((v) => ({ value: v, label: seniorityLabel(v) }));
}

export function roleLabel(role: string): string {
  return i18next.t(`agents.roles.${role}`, { defaultValue: role });
}

export function roleOptions(): { value: string; label: string }[] {
  const roles = ["tenant_admin", "admin", "supervisor", "senior_agent", "agent", "readonly"];
  return roles.map((r) => ({
    value: r,
    label: `${roleLabel(r)} (${r})`
  }));
}

export function getActionErrorMessage(error: unknown, action: "member_create" | "agent_enable" | "member_upgrade"): string {
  if (error instanceof TenantApiError && error.code === "seat_limit_exceeded") {
    const key =
      action === "member_create" ? "agents.errors.seatLimitCreate" :
      action === "agent_enable"  ? "agents.errors.seatLimitEnable" :
                                   "agents.errors.seatLimitUpgrade";
    return i18next.t(key);
  }
  return error instanceof Error ? error.message : i18next.t("agents.errors.operationFailed");
}
