/**
 * 菜单路径与名称: 客户中心 -> Permissions / 权限策略
 * 文件职责: 提供角色标签映射等轻量辅助常量。
 * 主要交互文件:
 * - ./components/PermissionsMatrixTable.tsx
 */

import type { PermissionRole } from "./types";

export const ROLE_LABEL: Record<PermissionRole, string> = {
  tenant_admin: "tenant_admin",
  admin: "admin",
  supervisor: "supervisor",
  senior_agent: "senior_agent",
  agent: "agent",
  readonly: "readonly"
};
