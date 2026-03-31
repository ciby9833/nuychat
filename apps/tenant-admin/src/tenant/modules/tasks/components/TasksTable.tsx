/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理 -> 任务列表
 * 文件职责: 展示左侧任务列表表格，并支持切换当前选中任务。
 * 主要交互文件:
 * - ../TasksTab.tsx
 * - ../helpers.ts
 * - ../hooks/useTasksData.ts
 */

import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import { getStatusLabel, statusColor } from "../helpers";
import type { AdminTaskItem } from "../types";

type TasksTableProps = {
  items: AdminTaskItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (taskId: string) => void;
};

export function TasksTable({ items, loading, selectedId, onSelect }: TasksTableProps) {
  const { t } = useTranslation();

  const columns: ColumnsType<AdminTaskItem> = [
    {
      title: t("tasksModule.table.task"),
      dataIndex: "title",
      render: (_value, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          <Typography.Text type="secondary">{row.caseTitle || row.caseId.slice(0, 8)}</Typography.Text>
        </div>
      )
    },
    {
      title: t("tasksModule.table.owner"),
      render: (_value, row) => (row.ownerName ? `${row.ownerName}${row.ownerEmployeeNo ? ` #${row.ownerEmployeeNo}` : ""}` : t("tasksModule.table.empty"))
    },
    {
      title: t("tasksModule.table.status"),
      dataIndex: "status",
      render: (value) => <Tag color={statusColor(value)}>{getStatusLabel(value)}</Tag>
    },
    {
      title: t("tasksModule.table.dueAt"),
      dataIndex: "dueAt",
      render: (value) => (value ? dayjs(value).format("YYYY-MM-DD HH:mm") : t("tasksModule.table.empty"))
    }
  ];

  return (
    <Table<AdminTaskItem>
      rowKey="taskId"
      loading={loading}
      pagination={false}
      dataSource={items}
      rowSelection={undefined}
      onRow={(record) => ({
        onClick: () => onSelect(record.taskId)
      })}
      rowClassName={(record) => (record.taskId === selectedId ? "ant-table-row-selected" : "")}
      columns={columns}
    />
  );
}
