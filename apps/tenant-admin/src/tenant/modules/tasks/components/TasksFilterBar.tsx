/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理 -> 任务筛选
 * 文件职责: 提供任务状态、负责人、搜索筛选栏。
 * 主要交互文件:
 * - ../TasksTab.tsx
 * - ../helpers.ts
 * - ../hooks/useTasksData.ts
 */

import { Input, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import { getStatusOptions } from "../helpers";
import type { AgentProfile, TasksFilters } from "../types";

type TasksFilterBarProps = {
  filters: TasksFilters;
  agents: AgentProfile[];
  onFiltersChange: (updater: (prev: TasksFilters) => TasksFilters) => void;
};

export function TasksFilterBar({ filters, agents, onFiltersChange }: TasksFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Space style={{ marginBottom: 12, width: "100%" }} wrap>
      <Select
        value={filters.status ?? ""}
        style={{ width: 140 }}
        options={getStatusOptions()}
        onChange={(value) => onFiltersChange((prev) => ({ ...prev, status: value || undefined }))}
      />
      <Select
        value={filters.ownerAgentId ?? ""}
        style={{ width: 220 }}
        placeholder={t("tasksModule.filter.ownerPlaceholder")}
        options={[
          { value: "", label: t("tasksModule.filter.allOwners") },
          ...agents.map((agent) => ({
            value: agent.agentId,
            label: `${agent.displayName}${agent.employeeNo ? ` #${agent.employeeNo}` : ""}`
          }))
        ]}
        onChange={(value) => onFiltersChange((prev) => ({ ...prev, ownerAgentId: value || undefined }))}
      />
      <Input.Search
        allowClear
        placeholder={t("tasksModule.filter.searchPlaceholder")}
        style={{ width: 260 }}
        onSearch={(value) => onFiltersChange((prev) => ({ ...prev, search: value || undefined }))}
      />
    </Space>
  );
}
