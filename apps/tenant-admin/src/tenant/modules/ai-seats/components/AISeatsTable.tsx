/**
 * 菜单路径与名称: 客户中心 -> AI 座席 -> 实例列表
 * 文件职责: 展示 AI 座席列表表格，并触发行级查看、编辑、启停、删除操作。
 * 主要交互文件:
 * - ../AISeatsTab.tsx: 负责把列表操作绑定到模块主入口。
 * - ../hooks/useAISeatsData.ts: 提供 rows 数据与启停、删除动作。
 * - ../../../types: 提供 TenantAIAgent 类型。
 */

import { Button, Card, Popconfirm, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { TenantAIAgent } from "../../../types";

export function AISeatsTable({
  rows,
  onView,
  onEdit,
  onToggleStatus,
  onDelete
}: {
  rows: TenantAIAgent[];
  onView: (item: TenantAIAgent) => void;
  onEdit: (item: TenantAIAgent) => void;
  onToggleStatus: (item: TenantAIAgent) => void;
  onDelete: (aiAgentId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card title={t("aiSeats.table.title")}>
      <Table<TenantAIAgent>
        rowKey="aiAgentId"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: t("aiSeats.table.colName"), dataIndex: "name" },
          { title: t("aiSeats.table.colRole"), dataIndex: "roleLabel", render: (value: string | null) => value ?? t("aiSeats.common.empty") },
          { title: t("aiSeats.table.colPersonality"), dataIndex: "personality", render: (value: string | null) => value ?? t("aiSeats.common.empty") },
          { title: t("aiSeats.table.colDescription"), dataIndex: "description", render: (value: string | null) => value ?? t("aiSeats.common.empty") },
          {
            title: t("aiSeats.table.colStatus"),
            dataIndex: "status",
            render: (value: string) => <Tag color={value === "active" ? "green" : value === "draft" ? "gold" : "default"}>{t(`aiSeats.status.${value}`, { defaultValue: value })}</Tag>
          },
          { title: t("aiSeats.table.colCreatedAt"), dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
          {
            title: t("aiSeats.table.colAction"),
            render: (_: unknown, item: TenantAIAgent) => (
              <Space>
                <Button size="small" onClick={() => onView(item)}>{t("aiSeats.actions.view")}</Button>
                <Button size="small" onClick={() => onEdit(item)}>{t("aiSeats.actions.edit")}</Button>
                <Button size="small" onClick={() => onToggleStatus(item)}>
                  {item.status === "active" ? t("aiSeats.actions.disable") : t("aiSeats.actions.enable")}
                </Button>
                <Popconfirm
                  title={t("aiSeats.table.deleteConfirm")}
                  onConfirm={() => onDelete(item.aiAgentId)}
                >
                  <Button size="small" danger>{t("aiSeats.actions.delete")}</Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
