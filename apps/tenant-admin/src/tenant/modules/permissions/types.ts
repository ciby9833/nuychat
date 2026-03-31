/**
 * 菜单路径与名称: 客户中心 -> Permissions / 权限策略
 * 文件职责: 统一导出 permissions 模块依赖的权限策略、角色与矩阵行类型。
 * 主要交互文件:
 * - ./PermissionsTab.tsx
 * - ./hooks/usePermissionsData.ts
 * - ./components/PermissionsMatrixTable.tsx
 */

import type { PermissionKey, PermissionPolicyResponse, PermissionRole } from "../../types";

export type { PermissionKey, PermissionPolicyResponse, PermissionRole };

export type PolicyRow = {
  role: PermissionRole;
  values: Record<PermissionKey, boolean>;
};
