/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理
 * 文件职责: 任务管理模块主入口，负责串联任务筛选、任务列表、任务详情与处理记录回复。
 * 主要交互文件:
 * - ./hooks/useTasksData.ts: 负责任务列表、详情、坐席列表、筛选状态与更新动作。
 * - ./components/TasksFilterBar.tsx: 展示任务状态、负责人、搜索筛选栏。
 * - ./components/TasksTable.tsx: 展示左侧任务列表表格。
 * - ./components/TaskDetailPanel.tsx: 展示右侧任务详情、负责人/状态/截止时间编辑与评论区。
 * - ./helpers.ts: 提供任务状态选项与状态色映射。
 * - ../../api.ts: 提供任务列表、详情、任务更新与评论接口能力。
 */

import { Card } from "antd";
import { useTranslation } from "react-i18next";

import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { TasksFilterBar } from "./components/TasksFilterBar";
import { TasksTable } from "./components/TasksTable";
import { useTasksData } from "./hooks/useTasksData";

export function TasksTab() {
  const { t } = useTranslation();
  const data = useTasksData();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
      <Card title={t("tasksModule.page.listTitle")}>
        <TasksFilterBar
          filters={data.filters}
          agents={data.agents}
          onFiltersChange={data.setFilters}
        />
        <TasksTable
          items={data.items}
          loading={data.loading}
          selectedId={data.selectedId}
          onSelect={data.setSelectedId}
        />
      </Card>

      <Card title={t("tasksModule.page.detailTitle")}>
        <TaskDetailPanel
          detail={data.detail}
          selectedTask={data.selectedTask}
          agents={data.agents}
          comment={data.comment}
          saving={data.saving}
          onCommentChange={data.setComment}
          onPatch={(patch) => { void data.handlePatch(patch); }}
          onComment={() => { void data.handleComment(); }}
        />
      </Card>
    </div>
  );
}
