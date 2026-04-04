/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理
 * 文件职责: 统一导出 tasks 模块依赖的任务、坐席与筛选类型。
 * 主要交互文件:
 * - ./TasksTab.tsx
 * - ./hooks/useTasksData.ts
 * - ./components/TasksFilterBar.tsx
 * - ./components/TasksTable.tsx
 * - ./components/TaskDetailPanel.tsx
 */

import type { AdminTaskDetail, AdminTaskItem, AgentProfile } from "../../types";

export type { AdminTaskDetail, AdminTaskItem, AgentProfile };

export type TasksFilters = {
  status?: string;
  ownerAgentId?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
};
