/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 客户筛选
 * 文件职责: 提供客户搜索、标签筛选、分组筛选与刷新/新建分组入口。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../types.ts
 * - ../modals/CustomerSegmentModal.tsx
 */

import { Button, Card, Input, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { CustomerSegmentItem, CustomerTagItem, CustomersFilters } from "../types";

type CustomersFilterBarProps = {
  loading: boolean;
  filters: CustomersFilters;
  tags: CustomerTagItem[];
  segments: CustomerSegmentItem[];
  onFiltersChange: (updater: (prev: CustomersFilters) => CustomersFilters) => void;
  onRefresh: () => void;
  onOpenCreateSegment: () => void;
};

export function CustomersFilterBar({
  loading,
  filters,
  tags,
  segments,
  onFiltersChange,
  onRefresh,
  onOpenCreateSegment
}: CustomersFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("customersModule.filter.title")}
      extra={(
        <Space>
          <Button onClick={onRefresh}>{t("customersModule.filter.refresh")}</Button>
          <Button onClick={onOpenCreateSegment}>{t("customersModule.filter.createSegment")}</Button>
        </Space>
      )}
    >
      <Space wrap>
        <Input.Search
          style={{ width: 260 }}
          placeholder={t("customersModule.filter.searchPlaceholder")}
          value={filters.search}
          onChange={(event) => onFiltersChange((prev) => ({ ...prev, search: event.target.value || undefined }))}
          onSearch={onRefresh}
        />
        <Select
          allowClear
          style={{ width: 200 }}
          placeholder={t("customersModule.filter.tagPlaceholder")}
          value={filters.tagId}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, tagId: value }))}
          options={tags.map((tag) => ({ value: tag.tagId, label: tag.name }))}
        />
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder={t("customersModule.filter.segmentPlaceholder")}
          value={filters.segmentId}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, segmentId: value }))}
          options={segments.map((segment) => ({ value: segment.segmentId, label: segment.name }))}
        />
        <Button type="primary" onClick={onRefresh} loading={loading}>{t("customersModule.filter.query")}</Button>
      </Space>
    </Card>
  );
}
