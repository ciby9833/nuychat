import { Button, Card, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { KBEntry } from "../types";

type KnowledgeBaseTableProps = {
  entries: KBEntry[];
  onEdit: (entry: KBEntry) => void;
  onDeactivate: (id: string) => void;
};

export function KnowledgeBaseTable({ entries, onEdit, onDeactivate }: KnowledgeBaseTableProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("kb.listModule")} extra={<Tag>{entries.length} {t("kb.items")}</Tag>}>
      <Table<KBEntry>
        rowKey="entry_id"
        dataSource={entries}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: t("kb.col.category"), dataIndex: "category", render: (value) => <Tag>{String(value)}</Tag> },
          { title: t("kb.col.title"), dataIndex: "title" },
          { title: t("kb.col.content"), dataIndex: "content", render: (value) => String(value).slice(0, 80) },
          { title: t("kb.col.hits"), dataIndex: "hit_count" },
          { title: t("kb.col.status"), dataIndex: "is_active", render: (value) => <Tag color={value ? "green" : "default"}>{value ? t("common.active") : t("common.inactive")}</Tag> },
          {
            title: t("common.action"),
            render: (_value, record) => (
              <Space>
                <Button size="small" onClick={() => onEdit(record)}>{t("common.edit")}</Button>
                {record.is_active ? <Button size="small" danger onClick={() => onDeactivate(record.entry_id)}>{t("common.disable")}</Button> : null}
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
