/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 分组规则
 * 文件职责: 展示客户分组规则，并提供执行分组和启停操作。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../hooks/useCustomersData.ts
 * - ../types.ts
 */

import { Button, Card, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CustomerSegmentItem } from "../types";

type CustomerSegmentsTableProps = {
  loading: boolean;
  segments: CustomerSegmentItem[];
  onRunSegment: (segment: CustomerSegmentItem) => void;
  onToggleSegment: (segment: CustomerSegmentItem) => void;
};

export function CustomerSegmentsTable({
  loading,
  segments,
  onRunSegment,
  onToggleSegment
}: CustomerSegmentsTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnsType<CustomerSegmentItem>>(
    () => [
      { title: t("customersModule.segments.name"), dataIndex: "name" },
      { title: t("customersModule.segments.code"), dataIndex: "code" },
      {
        title: t("customersModule.segments.rule"),
        render: (_value, row) => <code>{JSON.stringify(row.rule)}</code>
      },
      {
        title: t("customersModule.segments.status"),
        dataIndex: "isActive",
        render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? t("customersModule.segments.active") : t("customersModule.segments.inactive")}</Tag>
      },
      {
        title: t("customersModule.segments.actions"),
        render: (_value, row) => (
          <Space>
            <Button size="small" onClick={() => onRunSegment(row)}>{t("customersModule.segments.run")}</Button>
            <Button size="small" onClick={() => onToggleSegment(row)}>
              {row.isActive ? t("customersModule.segments.disable") : t("customersModule.segments.enable")}
            </Button>
          </Space>
        )
      }
    ],
    [onRunSegment, onToggleSegment, t]
  );

  return (
    <Card title={t("customersModule.segments.title")}>
      <Table<CustomerSegmentItem>
        rowKey="segmentId"
        dataSource={segments}
        loading={loading}
        pagination={false}
        columns={columns}
      />
    </Card>
  );
}
