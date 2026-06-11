import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Card, Space, Table, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import type { KBEntry } from "../types";

type KnowledgeBaseTableProps = {
  entries: KBEntry[];
  onEdit: (entry: KBEntry) => void;
  onMarkReviewed: (id: string) => void;
  onDeactivate: (id: string) => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function KnowledgeBaseTable({ entries, onEdit, onMarkReviewed, onDeactivate }: KnowledgeBaseTableProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("kb.listModule")} extra={<Tag>{entries.length} {t("kb.items")}</Tag>}>
      <Table<KBEntry>
        rowKey="entry_id"
        dataSource={entries}
        pagination={{ pageSize: 10 }}
        rowClassName={(record) => record.needs_review ? "kb-row-needs-review" : ""}
        columns={[
          {
            title: t("kb.col.category"),
            dataIndex: "category",
            width: 100,
            render: (value) => <Tag>{String(value)}</Tag>
          },
          {
            title: t("kb.col.title"),
            dataIndex: "title",
            render: (value, record) => (
              <Space size={4}>
                {record.needs_review && (
                  <Tooltip title={t("kb.needsReviewTip", { count: record.negative_feedback_count })}>
                    <ExclamationCircleOutlined style={{ color: "#fa8c16" }} />
                  </Tooltip>
                )}
                <span>{String(value)}</span>
              </Space>
            )
          },
          {
            title: t("kb.col.content"),
            dataIndex: "content",
            render: (value) => String(value).slice(0, 80)
          },
          {
            title: t("kb.col.hits"),
            dataIndex: "hit_count",
            width: 80,
            align: "center"
          },
          {
            title: t("kb.col.negativeFeedback"),
            dataIndex: "negative_feedback_count",
            width: 80,
            align: "center",
            render: (value: number) => (
              value > 0
                ? <Tag color={value >= 3 ? "warning" : "default"}>{value}</Tag>
                : <span style={{ color: "#ccc" }}>0</span>
            )
          },
          {
            title: t("kb.col.lastUsed"),
            dataIndex: "last_used_at",
            width: 100,
            render: (value) => formatDate(value as string | null)
          },
          {
            title: t("kb.col.status"),
            dataIndex: "is_active",
            width: 80,
            render: (value) => (
              <Tag color={value ? "green" : "default"}>
                {value ? t("common.active") : t("common.inactive")}
              </Tag>
            )
          },
          {
            title: t("common.action"),
            width: 180,
            render: (_value, record) => (
              <Space size={4} wrap>
                <Button size="small" onClick={() => onEdit(record)}>{t("common.edit")}</Button>
                {record.needs_review && (
                  <Button
                    size="small"
                    type="link"
                    style={{ color: "#52c41a", padding: 0 }}
                    onClick={() => onMarkReviewed(record.entry_id)}
                  >
                    {t("kb.markReviewed")}
                  </Button>
                )}
                {record.is_active ? (
                  <Button size="small" danger onClick={() => onDeactivate(record.entry_id)}>
                    {t("common.disable")}
                  </Button>
                ) : null}
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
