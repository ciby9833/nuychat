/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理 -> 任务筛选
 * 文件职责: 提供任务状态、负责人、搜索筛选栏。
 * 主要交互文件:
 * - ../TasksTab.tsx
 * - ../helpers.ts
 * - ../hooks/useTasksData.ts
 */

import { DatePicker, Input, Select, Space } from "antd";
import dayjs from "dayjs";
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
  const { RangePicker } = DatePicker;

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
      <RangePicker
        value={[
          filters.createdFrom ? dayjs(filters.createdFrom) : null,
          filters.createdTo ? dayjs(filters.createdTo) : null
        ]}
        onChange={(values) => onFiltersChange((prev) => ({
          ...prev,
          createdFrom: values?.[0] ? values[0].startOf("day").toISOString() : undefined,
          createdTo: values?.[1] ? values[1].endOf("day").toISOString() : undefined
        }))}
        placeholder={[t("tasksModule.filter.createdFrom"), t("tasksModule.filter.createdTo")]}
      />
      <RangePicker
        value={[
          filters.dueFrom ? dayjs(filters.dueFrom) : null,
          filters.dueTo ? dayjs(filters.dueTo) : null
        ]}
        onChange={(values) => onFiltersChange((prev) => ({
          ...prev,
          dueFrom: values?.[0] ? values[0].startOf("day").toISOString() : undefined,
          dueTo: values?.[1] ? values[1].endOf("day").toISOString() : undefined
        }))}
        placeholder={[t("tasksModule.filter.dueFrom"), t("tasksModule.filter.dueTo")]}
      />
    </Space>
  );
}
