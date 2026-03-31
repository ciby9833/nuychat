/**
 * 菜单路径与名称: 客户中心 -> Cases / 会话事项 -> 事项列表
 * 文件职责: 展示事项列表、负责人信息、状态标签与分页。
 * 主要交互文件:
 * - ../CasesTab.tsx
 * - ../types.ts
 * - ../../../../i18n/locales/en/modules/cases.ts
 * - ../../../../i18n/locales/zh/modules/cases.ts
 * - ../../../../i18n/locales/id/modules/cases.ts
 */

import { Card, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ConversationCaseItem, ConversationCaseListResponse } from "../types";

type CasesTableProps = {
  loading: boolean;
  data: ConversationCaseListResponse | null;
  onPageChange: (page: number, pageSize: number) => void;
};

const STATUS_COLORS: Record<string, string> = {
  open: "blue",
  in_progress: "processing",
  waiting_customer: "gold",
  waiting_internal: "orange",
  resolved: "green",
  closed: "default"
};

export function CasesTable({ loading, data, onPageChange }: CasesTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnsType<ConversationCaseItem>>(
    () => [
      {
        title: t("cases.col.case"),
        key: "case",
        render: (_value, row) => (
          <div>
            <div><code>{row.caseId.slice(0, 8)}</code>{row.title ? ` · ${row.title}` : ""}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.conversationId.slice(0, 8)}
            </Typography.Text>
          </div>
        )
      },
      {
        title: t("cases.col.customer"),
        key: "customer",
        render: (_value, row) => row.customerName ?? row.customerRef ?? "-"
      },
      {
        title: t("cases.col.channel"),
        dataIndex: "channelType",
        render: (value: string) => <Tag>{value.toUpperCase()}</Tag>
      },
      {
        title: t("cases.col.owner"),
        key: "owner",
        render: (_value, row) => (
          row.ownerName
            ? `${row.status === "resolved" || row.status === "closed" ? t("cases.ownerFinal") : t("cases.ownerCurrent")}：${row.ownerName}${row.ownerType === "ai" ? " (AI)" : ""}`
            : "-"
        )
      },
      {
        title: t("cases.col.status"),
        dataIndex: "status",
        render: (value: string) => <Tag color={STATUS_COLORS[value] ?? "default"}>{t(`cases.statusOptions.${value}`, { defaultValue: value })}</Tag>
      },
      {
        title: t("cases.col.summary"),
        dataIndex: "summary",
        ellipsis: true,
        render: (value: string | null) => value ?? "-"
      },
      {
        title: t("cases.col.lastActivity"),
        dataIndex: "lastActivityAt",
        render: (value: string) => dayjs(value).format("MM-DD HH:mm")
      }
    ],
    [t]
  );

  return (
    <Card title={t("cases.cardTitle")}>
      <Table<ConversationCaseItem>
        rowKey="caseId"
        loading={loading}
        dataSource={data?.items ?? []}
        columns={columns}
        pagination={{
          current: data?.page ?? 1,
          pageSize: data?.pageSize ?? 20,
          total: data?.total ?? 0,
          onChange: onPageChange
        }}
      />
    </Card>
  );
}
