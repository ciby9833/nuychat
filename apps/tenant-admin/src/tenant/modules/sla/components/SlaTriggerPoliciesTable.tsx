/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> 触发策略
 * 文件职责: 展示触发策略列表，并提供新建、编辑、启停入口。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供策略列表和操作。
 * - ../helpers.tsx: 提供动作标签渲染。
 * - ../modals/SlaTriggerPolicyModal.tsx: 承载编辑表单。
 */

import { Button, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { renderActionTags } from "../helpers";
import type { SlaTriggerPolicyItem } from "../types";

type SlaTriggerPoliciesTableProps = {
  loading: boolean;
  saving: boolean;
  triggerPolicies: SlaTriggerPolicyItem[];
  onCreate: () => void;
  onEdit: (item: SlaTriggerPolicyItem) => void;
  onToggle: (item: SlaTriggerPolicyItem) => void;
};

export function SlaTriggerPoliciesTable({
  loading,
  saving,
  triggerPolicies,
  onCreate,
  onEdit,
  onToggle
}: SlaTriggerPoliciesTableProps) {
  const { t } = useTranslation();

  return (
    <Table<SlaTriggerPolicyItem>
      rowKey="triggerPolicyId"
      loading={loading || saving}
      pagination={false}
      dataSource={triggerPolicies}
      title={() => t("slaModule.policies.title")}
      footer={() => <Button type="primary" onClick={onCreate}>{t("slaModule.policies.create")}</Button>}
      columns={[
        { title: t("slaModule.policies.name"), dataIndex: "name", key: "name" },
        { title: t("slaModule.policies.priority"), dataIndex: "priority", key: "priority", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
        { title: t("slaModule.policies.firstResponseActions"), dataIndex: "firstResponseActions", key: "firstResponseActions", render: renderActionTags },
        { title: t("slaModule.policies.assignmentAcceptActions"), dataIndex: "assignmentAcceptActions", key: "assignmentAcceptActions", render: renderActionTags },
        { title: t("slaModule.policies.followUpActions"), dataIndex: "followUpActions", key: "followUpActions", render: renderActionTags },
        { title: t("slaModule.policies.resolutionActions"), dataIndex: "resolutionActions", key: "resolutionActions", render: renderActionTags },
        { title: t("slaModule.policies.status"), dataIndex: "isActive", key: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? t("slaModule.policies.active") : t("slaModule.policies.inactive")}</Tag> },
        {
          title: t("slaModule.policies.actions"),
          key: "actions",
          render: (_: unknown, row: SlaTriggerPolicyItem) => (
            <Space>
              <Button size="small" onClick={() => onToggle(row)} loading={saving}>{row.isActive ? t("slaModule.policies.disable") : t("slaModule.policies.enable")}</Button>
              <Button size="small" onClick={() => onEdit(row)}>{t("slaModule.policies.edit")}</Button>
            </Space>
          )
        }
      ]}
    />
  );
}
