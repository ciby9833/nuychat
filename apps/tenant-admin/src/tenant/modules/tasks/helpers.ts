/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理
 * 文件职责: 提供任务状态枚举与状态色映射等轻量辅助方法。
 * 主要交互文件:
 * - ./components/TasksFilterBar.tsx
 * - ./components/TasksTable.tsx
 * - ./components/TaskDetailPanel.tsx
 */

import i18next from "i18next";

export function getStatusOptions() {
  return [
    { value: "", label: i18next.t("tasksModule.status.all") },
    { value: "open", label: i18next.t("tasksModule.status.open") },
    { value: "in_progress", label: i18next.t("tasksModule.status.inProgress") },
    { value: "done", label: i18next.t("tasksModule.status.done") },
    { value: "cancelled", label: i18next.t("tasksModule.status.cancelled") }
  ];
}

export function getStatusLabel(status: string) {
  switch (status) {
    case "done":
      return i18next.t("tasksModule.status.done");
    case "in_progress":
      return i18next.t("tasksModule.status.inProgress");
    case "cancelled":
      return i18next.t("tasksModule.status.cancelled");
    case "open":
    default:
      return i18next.t("tasksModule.status.open");
  }
}

export function statusColor(status: string) {
  switch (status) {
    case "done":
      return "green";
    case "in_progress":
      return "blue";
    case "cancelled":
      return "default";
    default:
      return "orange";
  }
}
