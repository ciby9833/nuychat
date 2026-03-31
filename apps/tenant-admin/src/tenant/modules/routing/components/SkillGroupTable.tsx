/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 技能组管理
 * 文件职责: 展示技能组列表，并提供编辑与删除入口。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../modals/SkillGroupEditorModal.tsx
 * - ../../../types
 */

import { DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { ModuleItem, SkillGroup } from "../../../types";

export function SkillGroupTable({
  groups,
  modules,
  loading,
  onEdit,
  onDelete
}: {
  groups: SkillGroup[];
  modules: ModuleItem[];
  loading: boolean;
  onEdit: (item: SkillGroup) => void;
  onDelete: (skillGroupId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Table<SkillGroup>
        rowKey="skill_group_id"
        loading={loading}
        dataSource={groups}
        pagination={false}
        size="middle"
        columns={[
          { title: t("routing.table.skillGroup"), render: (_, row) => `${row.name} (${row.code})` },
          { title: t("routing.table.moduleName"), render: (_, row) => row.module_name ?? "-" },
          { title: t("routing.table.priority"), dataIndex: "priority", width: 90 },
          {
            title: t("routing.table.status"),
            dataIndex: "is_active",
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
                  title={t("routing.confirm.deleteSkillGroupTitle")}
                  description={t("routing.confirm.deleteSkillGroupDescription")}
                  onConfirm={() => onDelete(row.skill_group_id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
      {modules.length === 0 && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {t("routing.state.createModuleFirst")}
        </Typography.Paragraph>
      )}
    </>
  );
}
