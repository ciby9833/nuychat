/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理 -> 质检记录列表
 * 文件职责: 展示质检记录列表、标签、状态与发布/转草稿操作。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../hooks/useQaData.ts
 * - ../types.ts
 */

import { Button, Card, Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { QaReviewItem, QaReviewListResponse } from "../types";

type QaReviewsTableProps = {
  loading: boolean;
  reviews: QaReviewListResponse | null;
  onToggleStatus: (row: QaReviewItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
};

export function QaReviewsTable({
  loading,
  reviews,
  onToggleStatus,
  onPageChange
}: QaReviewsTableProps) {
  const { t } = useTranslation();
  return (
    <Card title={t("qaModule.table.title")}>
      <Table<QaReviewItem>
        rowKey="reviewId"
        loading={loading}
        dataSource={reviews?.items ?? []}
        pagination={{
          current: reviews?.page ?? 1,
          pageSize: reviews?.pageSize ?? 20,
          total: reviews?.total ?? 0,
          onChange: onPageChange
        }}
        columns={[
          { title: t("qaModule.table.reviewTime"), dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
          { title: t("qaModule.table.caseId"), dataIndex: "caseId", ellipsis: true, render: (value: string) => <code>{value.slice(0, 8)}</code> },
          { title: t("qaModule.table.conversationId"), dataIndex: "conversationId", ellipsis: true },
          { title: t("qaModule.table.agent"), dataIndex: "agentName", render: (value: string | null) => value ?? "-" },
          { title: t("qaModule.table.reviewer"), dataIndex: "reviewerEmail", render: (value: string | null) => value ?? "-" },
          { title: t("qaModule.table.score"), dataIndex: "score" },
          {
            title: t("qaModule.table.tags"),
            dataIndex: "tags",
            render: (value: string[]) => (
              <Space size={4} wrap>
                {value.length ? value.map((tag) => <Tag key={tag}>{tag}</Tag>) : <Typography.Text type="secondary">{t("qaModule.table.emptyTag")}</Typography.Text>}
              </Space>
            )
          },
          {
            title: t("qaModule.table.status"),
            dataIndex: "status",
            render: (value: "draft" | "published") => <Tag color={value === "published" ? "green" : "default"}>{t(`qaModule.status.${value}`, { defaultValue: value })}</Tag>
          },
          {
            title: t("qaModule.table.actions"),
            render: (_, row) => (
              <Button size="small" onClick={() => onToggleStatus(row)}>
                {row.status === "draft" ? t("qaModule.table.publish") : t("qaModule.table.revertDraft")}
              </Button>
            )
          }
        ]}
      />
    </Card>
  );
}
