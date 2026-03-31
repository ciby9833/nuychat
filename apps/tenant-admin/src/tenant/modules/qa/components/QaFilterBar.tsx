/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理 -> 筛选区
 * 文件职责: 提供质检筛选条件，以及刷新、维度配置、新建质检入口。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../hooks/useQaData.ts
 * - ../types.ts
 */

import { Button, Card, Input, InputNumber, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { AgentProfile, ReviewFilter } from "../types";

type QaFilterBarProps = {
  loading: boolean;
  agents: AgentProfile[];
  filters: ReviewFilter;
  onFiltersChange: (updater: (prev: ReviewFilter) => ReviewFilter) => void;
  onRefresh: () => void;
  onOpenRules: () => void;
  onOpenCreate: () => void;
};

export function QaFilterBar({
  loading,
  agents,
  filters,
  onFiltersChange,
  onRefresh,
  onOpenRules,
  onOpenCreate
}: QaFilterBarProps) {
  const { t } = useTranslation();
  return (
    <Card
      title={t("qaModule.filter.title")}
      extra={(
        <Space>
          <Button onClick={onRefresh}>{t("qaModule.filter.refresh")}</Button>
          <Button onClick={onOpenRules}>{t("qaModule.filter.rules")}</Button>
          <Button type="primary" onClick={onOpenCreate}>{t("qaModule.filter.create")}</Button>
        </Space>
      )}
    >
      <Space wrap>
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder={t("qaModule.filter.agentPlaceholder")}
          value={filters.agentId}
          options={agents.map((agent) => ({ value: agent.agentId, label: `${agent.displayName} (${agent.email})` }))}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, agentId: value }))}
        />
        <Input
          style={{ width: 220 }}
          placeholder={t("qaModule.filter.tagPlaceholder")}
          value={filters.tag}
          onChange={(event) => onFiltersChange((prev) => ({ ...prev, tag: event.target.value || undefined }))}
        />
        <InputNumber
          style={{ width: 180 }}
          min={0}
          max={100}
          placeholder={t("qaModule.filter.minScorePlaceholder")}
          value={filters.minScore}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, minScore: typeof value === "number" ? value : undefined }))}
        />
        <Button type="primary" onClick={onRefresh} loading={loading}>{t("qaModule.filter.query")}</Button>
      </Space>
    </Card>
  );
}
