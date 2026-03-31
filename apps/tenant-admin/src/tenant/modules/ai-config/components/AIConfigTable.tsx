// 作用: AI 模型配置列表表格组件
// 菜单路径: 客户中心 -> AI 配置 -> 模型配置
// 作者：吴川

import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { AIConfigProfile } from "../../../types";

export function AIConfigTable({
  rows,
  selectedId,
  readOnly,
  readOnlyMessage,
  onCreate,
  onSelect,
  onEdit,
  onSetDefault,
  onDelete
}: {
  rows: AIConfigProfile[];
  selectedId: string | null;
  readOnly?: boolean;
  readOnlyMessage?: string;
  onCreate: () => void;
  onSelect: (cfg: AIConfigProfile) => void;
  onEdit: (cfg: AIConfigProfile) => void;
  onSetDefault: (configId: string) => void;
  onDelete: (configId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card title={t("aiConfig.table.title")} extra={readOnly ? null : <Button onClick={onCreate}>{t("aiConfig.table.create")}</Button>}>
      {readOnlyMessage ? <Alert type="info" showIcon style={{ marginBottom: 16 }} message={readOnlyMessage} /> : null}
      <Table<AIConfigProfile>
        rowKey="config_id"
        size="small"
        dataSource={rows}
        pagination={false}
        onRow={(record) => ({ onClick: () => onSelect(record) })}
        rowClassName={(record) => (record.config_id === selectedId ? "ant-table-row-selected" : "")}
        columns={[
          {
            title: t("aiConfig.table.colName"),
            dataIndex: "name",
            render: (_, r) => (
              <Space>
                <Typography.Text>{r.name}</Typography.Text>
                {r.is_default ? <Tag color="blue">{t("aiConfig.table.defaultTag")}</Tag> : null}
                {!r.is_active ? <Tag>{t("aiConfig.table.inactiveTag")}</Tag> : null}
              </Space>
            )
          },
          { title: "Provider", dataIndex: "provider", width: 140 },
          { title: "Model", dataIndex: "model_name", width: 220 },
          {
            title: t("aiConfig.table.colAction"),
            width: 220,
            render: (_, r) => (
              <Space>
                {readOnly ? (
                  <Typography.Text type="secondary">{t("aiConfig.table.platformManaged")}</Typography.Text>
                ) : (
                  <>
                    <Button size="small" onClick={(e) => { e.stopPropagation(); onEdit(r); }}>
                      {t("aiConfig.table.edit")}
                    </Button>
                    {!r.is_default ? (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); onSetDefault(r.config_id); }}>
                        {t("aiConfig.table.setDefault")}
                      </Button>
                    ) : null}
                    <Popconfirm
                      title={t("aiConfig.table.deleteConfirmTitle")}
                      description={t("aiConfig.table.deleteConfirmDesc")}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        onDelete(r.config_id);
                      }}
                    >
                      <Button danger size="small" onClick={(e) => e.stopPropagation()}>
                        {t("aiConfig.table.delete")}
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
