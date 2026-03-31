/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 能力目录表格
 * 文件职责: 展示 AI 能力目录列表，提供选中、编辑、删除行级操作。
 * 主要交互文件:
 * - ../pages/CapabilityRegistryPage.tsx: 负责传入选中与操作回调。
 * - ../types.ts: 提供 CapabilityRegistryItem 类型。
 */
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";

import type { CapabilityRegistryItem } from "../types";

type Props = {
  items: CapabilityRegistryItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (capabilityId: string) => void;
  onEdit?: (capabilityId: string) => void;
  onDelete?: (capabilityId: string, name: string) => void;
};

export function CapabilityRegistryTable({ items, loading, selectedId, onSelect, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const columns: ColumnsType<CapabilityRegistryItem> = [
    { title: t("aiCapabilities.table.name"), dataIndex: "name", key: "name" },
    { title: t("aiCapabilities.table.code"), dataIndex: "code", key: "code", width: 180 },
    { title: t("aiCapabilities.table.category"), dataIndex: "category", key: "category", width: 140 },
    {
      title: t("aiCapabilities.table.status"),
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (value: string) => <Tag color={value === "active" ? "green" : value === "draft" ? "orange" : "default"}>{t(`aiCapabilities.status.${value}`, { defaultValue: value })}</Tag>
    },
    ...(onEdit || onDelete
      ? [{
          title: t("aiCapabilities.table.actions"),
          key: "action",
          width: 100,
          render: (_: unknown, record: CapabilityRegistryItem) => (
            <Space size="small">
              {onEdit ? (
                <Tooltip title={t("aiCapabilities.table.edit")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(e) => { e.stopPropagation(); onEdit(record.capabilityId); }}
                  />
                </Tooltip>
              ) : null}
              {onDelete ? (
                <Tooltip title={t("aiCapabilities.table.delete")}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => { e.stopPropagation(); onDelete(record.capabilityId, record.name); }}
                  />
                </Tooltip>
              ) : null}
            </Space>
          )
        } satisfies ColumnsType<CapabilityRegistryItem>[number]]
      : [])
  ];

  return (
    <Table
      rowKey="capabilityId"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={items}
      pagination={false}
      rowClassName={(record) => record.capabilityId === selectedId ? "ant-table-row-selected" : ""}
      onRow={(record) => ({
        onClick: () => onSelect(record.capabilityId),
        style: { cursor: "pointer" }
      })}
    />
  );
}
