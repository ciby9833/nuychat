/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构
 * 文件职责: 统一导出 organization 模块使用的类型与表单类型。
 * 主要交互文件:
 * - ./OrganizationTab.tsx
 * - ./components/DepartmentPanel.tsx
 * - ./components/TeamsPanel.tsx
 * - ./modals/NewDepartmentModal.tsx
 * - ./modals/NewTeamModal.tsx
 * - ./hooks/useOrganizationData.ts
 */

import type { AgentProfile, DepartmentItem, TeamItem } from "../../types";

export type { AgentProfile, DepartmentItem, TeamItem };

export type DepartmentFormValues = {
  code: string;
  name: string;
  parentDepartmentId?: string;
};

export type TeamFormValues = {
  departmentId: string;
  code: string;
  name: string;
  supervisorAgentId?: string;
};
