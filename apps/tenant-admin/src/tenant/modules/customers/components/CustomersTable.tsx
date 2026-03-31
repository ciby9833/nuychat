/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 客户列表
 * 文件职责: 展示客户列表、最近事项、标签与分页，并提供标签管理入口。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../modals/CustomerTagsModal.tsx
 * - ../types.ts
 */

import { Button, Card, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CustomerListItem, CustomerListResponse } from "../types";

type CustomersTableProps = {
  loading: boolean;
  customers: CustomerListResponse | null;
  onManageTags: (customer: CustomerListItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
};

export function CustomersTable({ loading, customers, onManageTags, onPageChange }: CustomersTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnsType<CustomerListItem>>(
    () => [
      { title: t("customersModule.table.customer"), render: (_value, row) => row.name ?? row.reference },
      { title: t("customersModule.table.channel"), dataIndex: "channel", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
      { title: t("customersModule.table.tier"), dataIndex: "tier", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
      { title: t("customersModule.table.conversations"), dataIndex: "conversationCount" },
      { title: t("customersModule.table.cases"), dataIndex: "caseCount" },
      { title: t("customersModule.table.openCases"), dataIndex: "openCaseCount" },
      { title: t("customersModule.table.tasks"), dataIndex: "taskCount" },
      { title: t("customersModule.table.lastContact"), dataIndex: "lastContactAt", render: (value: string | null) => (value ? new Date(value).toLocaleString() : "-") },
      {
        title: t("customersModule.table.lastCase"),
        render: (_value, row) => {
          if (!row.lastCaseId) return "-";
          return (
            <Space direction="vertical" size={0}>
              <span>{row.lastCaseTitle ?? t("customersModule.table.caseWithId", { id: row.lastCaseId })}</span>
              <span style={{ color: "rgba(0,0,0,0.45)", fontSize: 12 }}>
                {row.lastCaseAt ? new Date(row.lastCaseAt).toLocaleString() : row.lastCaseId}
              </span>
            </Space>
          );
        }
      },
      {
        title: t("customersModule.table.tags"),
        render: (_value, row) => (
          <Space wrap>
            {row.tags.slice(0, 4).map((tag) => (
              <Tag key={tag.tagId} color={tag.color}>{tag.name}</Tag>
            ))}
            {row.tags.length > 4 ? <Tag>+{row.tags.length - 4}</Tag> : null}
          </Space>
        )
      },
      {
        title: t("customersModule.table.actions"),
        render: (_value, row) => (
          <Button size="small" onClick={() => onManageTags(row)}>{t("customersModule.table.manageTags")}</Button>
        )
      }
    ],
    [onManageTags, t]
  );

  return (
    <Card title={t("customersModule.table.title")}>
      <Table<CustomerListItem>
        rowKey="customerId"
        loading={loading}
        dataSource={customers?.items ?? []}
        columns={columns}
        pagination={{
          current: customers?.page ?? 1,
          pageSize: customers?.pageSize ?? 30,
          total: customers?.total ?? 0,
          onChange: onPageChange
        }}
      />
    </Card>
  );
}
