import { Button, Card, DatePicker, Input, Select, Space, Tabs } from "antd";
import { useTranslation } from "react-i18next";

import type { AgentProfile, QaQueueFilters } from "../types";

type Props = {
  loading: boolean;
  filters: QaQueueFilters;
  agents: AgentProfile[];
  counts: Record<"risk" | "sample" | "auto_pass" | "reviewed" | "diff", number>;
  onFiltersChange: (updater: (prev: QaQueueFilters) => QaQueueFilters) => void;
  onRefresh: () => void;
  onOpenGuideline: () => void;
};

export function QaQueueToolbar({
  loading,
  filters,
  agents,
  counts,
  onFiltersChange,
  onRefresh,
  onOpenGuideline
}: Props) {
  const { t } = useTranslation();
  return (
    <Card
      title={t("qaModule.toolbar.title")}
      extra={(
        <Space>
          <Button onClick={onOpenGuideline}>{t("qaModule.toolbar.guideline")}</Button>
          <Button onClick={onRefresh} loading={loading}>{t("qaModule.toolbar.refresh")}</Button>
        </Space>
      )}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Tabs
          activeKey={filters.queueType}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, queueType: value as QaQueueFilters["queueType"] }))}
          items={[
            { key: "risk", label: `${t("qaModule.tabs.risk")} (${counts.risk})` },
            { key: "sample", label: `${t("qaModule.tabs.sample")} (${counts.sample})` },
            { key: "auto_pass", label: `${t("qaModule.tabs.autoPass")} (${counts.auto_pass})` },
            { key: "reviewed", label: `${t("qaModule.tabs.reviewed")} (${counts.reviewed})` },
            { key: "diff", label: `${t("qaModule.tabs.diff")} (${counts.diff})` }
          ]}
        />
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t("qaModule.toolbar.searchPlaceholder")}
            value={filters.search}
            onChange={(event) => onFiltersChange((prev) => ({ ...prev, search: event.target.value }))}
            onSearch={() => onRefresh()}
            style={{ width: 260 }}
          />
          <DatePicker.RangePicker
            value={filters.dateRange}
            onChange={(value) => onFiltersChange((prev) => ({ ...prev, dateRange: [value?.[0] ?? null, value?.[1] ?? null] }))}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            placeholder={t("qaModule.toolbar.agentPlaceholder")}
            value={filters.agentIds}
            onChange={(value) => onFiltersChange((prev) => ({ ...prev, agentIds: value }))}
            options={agents.map((agent) => ({
              value: agent.agentId,
              label: `${agent.displayName} (${agent.email})`
            }))}
            style={{ minWidth: 280 }}
          />
          <Button type="primary" onClick={onRefresh} loading={loading}>{t("qaModule.toolbar.search")}</Button>
        </Space>
      </Space>
    </Card>
  );
}
