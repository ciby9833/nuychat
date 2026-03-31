/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 模块管理
 * 文件职责: 展示模块列表，并提供编辑与删除入口。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../modals/ModuleEditorModal.tsx
 * - ../types.ts
 */

import { DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { ModuleItem } from "../../../types";
import { MODULE_MODE_OPTIONS } from "../types";

export function ModuleTable({
  modules,
  loading,
  onEdit,
  onDelete
}: {
  modules: ModuleItem[];
  loading: boolean;
  onEdit: (item: ModuleItem) => void;
  onDelete: (moduleId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Table<ModuleItem>
      rowKey="moduleId"
      loading={loading}
      dataSource={modules}
      pagination={false}
      size="middle"
      columns={[
        { title: t("routing.table.module"), render: (_, row) => `${row.name} (${row.code})` },
        {
          title: t("routing.table.operatingMode"),
          dataIndex: "operatingMode",
          width: 140,
          render: (value: string) =>
            t(`routing.options.moduleMode.${value}`, { defaultValue: MODULE_MODE_OPTIONS.find((o) => o.value === value)?.labelKey ?? value })
        },
        {
          title: t("routing.table.status"),
          dataIndex: "isActive",
          width: 90,
          render: (value: boolean) => (value ? <Tag color="green">{t("routing.state.active")}</Tag> : <Tag>{t("routing.state.inactive")}</Tag>)
        },
        {
          title: t("common.action"),
          width: 130,
          render: (_, row) => (
            <Space size={4}>
              <Button size="small" onClick={() => onEdit(row)}>{t("common.edit")}</Button>
              <Popconfirm
                title={t("routing.confirm.deleteModuleTitle")}
                description={t("routing.confirm.deleteModuleDescription")}
                onConfirm={() => onDelete(row.moduleId)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )
        }
      ]}
    />
  );
}
