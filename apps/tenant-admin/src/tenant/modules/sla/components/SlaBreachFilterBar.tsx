/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> 违约筛选
 * 文件职责: 提供 SLA 违约查询条件，包括状态、指标与日期范围。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供筛选值与刷新动作。
 * - ./SlaBreachesTable.tsx: 展示筛选后的违约列表。
 */

import { Button, Card, DatePicker, Select, Space } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import type { BreachFilter } from "../types";

type SlaBreachFilterBarProps = {
  loading: boolean;
  filters: BreachFilter;
  onFiltersChange: (updater: (prev: BreachFilter) => BreachFilter) => void;
  onRefresh: () => void;
};

export function SlaBreachFilterBar({
  loading,
  filters,
  onFiltersChange,
  onRefresh
}: SlaBreachFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("slaModule.filter.title")} extra={<Button onClick={onRefresh}>{t("slaModule.filter.refresh")}</Button>}>
      <Space wrap size={12}>
        <Select
          allowClear
          style={{ width: 160 }}
          placeholder={t("slaModule.filter.statusPlaceholder")}
          value={filters.status}
          options={[
            { value: "open", label: t("slaModule.filter.status.open") },
            { value: "acknowledged", label: t("slaModule.filter.status.acknowledged") },
            { value: "resolved", label: t("slaModule.filter.status.resolved") }
          ]}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, status: value }))}
        />
        <Select
          allowClear
          style={{ width: 180 }}
          placeholder={t("slaModule.filter.metricPlaceholder")}
          value={filters.metric}
          options={[
            { value: "first_response", label: t("slaModule.filter.metric.firstResponse") },
            { value: "assignment_accept", label: t("slaModule.filter.metric.assignmentAccept") },
            { value: "follow_up", label: t("slaModule.filter.metric.followUp") },
            { value: "resolution", label: t("slaModule.filter.metric.resolution") }
          ]}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, metric: value }))}
        />
        <DatePicker style={{ width: 140 }} value={filters.from ? dayjs(filters.from) : null} onChange={(value) => onFiltersChange((prev) => ({ ...prev, from: value ? value.format("YYYY-MM-DD") : undefined }))} />
        <DatePicker style={{ width: 140 }} value={filters.to ? dayjs(filters.to) : null} onChange={(value) => onFiltersChange((prev) => ({ ...prev, to: value ? value.format("YYYY-MM-DD") : undefined }))} />
        <Button type="primary" onClick={onRefresh} loading={loading}>{t("slaModule.filter.query")}</Button>
      </Space>
    </Card>
  );
}
