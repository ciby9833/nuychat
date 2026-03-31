/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台
 * 文件职责: 统一导出 supervisor 模块依赖的类型，以及模块内筛选状态类型。
 * 主要交互文件:
 * - ./SupervisorTab.tsx
 * - ./hooks/useSupervisorData.ts
 * - ./components/SupervisorFilterBar.tsx
 * - ./components/SupervisorConversationsTable.tsx
 * - ./components/SupervisorAgentsTable.tsx
 * - ./modals/SupervisorBroadcastModal.tsx
 */

import type {
  DepartmentItem,
  SupervisorAgentStatus,
  SupervisorConversationWorkbenchItem,
  SupervisorConversationWorkbenchResponse,
  SupervisorOverview,
  TeamItem
} from "../../types";

export type {
  DepartmentItem,
  SupervisorAgentStatus,
  SupervisorConversationWorkbenchItem,
  SupervisorConversationWorkbenchResponse,
  SupervisorOverview,
  TeamItem
};

export type SupervisorScopeFilter = "all" | "waiting" | "exception" | "active" | "resolved";
