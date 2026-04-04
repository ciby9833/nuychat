/**
 * 功能名称: 任务模块展示辅助
 * 菜单路径: 座席工作台 / 任务
 * 文件职责: 提供任务状态分组与展示色板，避免任务 UI 重复写死状态键和样式。
 * 交互页面:
 * - ./TasksWorkspace.tsx: 任务工作台主容器。
 * - ./TaskListPanel.tsx: 左侧任务卡片列表。
 * - ./TaskDetailPanel.tsx: 中间任务详情与处理面板。
 */

import type { Ticket } from "../../types";

export const TASK_STATUS_GROUPS: Array<{
  key: Ticket["status"];
  tone: string;
}> = [
  { key: "open", tone: "border-slate-200 bg-white" },
  { key: "in_progress", tone: "border-blue-200 bg-blue-50/70" },
  { key: "done", tone: "border-emerald-200 bg-emerald-50/70" },
  { key: "cancelled", tone: "border-slate-200 bg-slate-50" }
];
