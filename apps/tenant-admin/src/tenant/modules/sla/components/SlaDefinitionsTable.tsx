/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> SLA 定义
 * 文件职责: 展示 SLA 定义列表，并提供新建、编辑、启停入口。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供定义列表和操作。
 * - ../modals/SlaDefinitionModal.tsx: 承载编辑表单。
 */

import { Button, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { SlaDefinitionItem } from "../types";

type SlaDefinitionsTableProps = {
  loading: boolean;
  saving: boolean;
  definitions: SlaDefinitionItem[];
  onCreate: () => void;
  onEdit: (item: SlaDefinitionItem) => void;
  onToggle: (item: SlaDefinitionItem) => void;
};

export function SlaDefinitionsTable({ loading, saving, definitions, onCreate, onEdit, onToggle }: SlaDefinitionsTableProps) {
  const { t } = useTranslation();

  return (
    <Table<SlaDefinitionItem>
      rowKey="definitionId"
      loading={loading || saving}
      pagination={false}
      dataSource={definitions}
      title={() => t("slaModule.definitions.title")}
      footer={() => <Button type="primary" onClick={onCreate}>{t("slaModule.definitions.create")}</Button>}
      columns={[
        { title: t("slaModule.definitions.name"), dataIndex: "name", key: "name" },
        { title: t("slaModule.definitions.priority"), dataIndex: "priority", key: "priority", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
        { title: t("slaModule.definitions.firstResponseTargetSec"), dataIndex: "firstResponseTargetSec", key: "firstResponseTargetSec" },
        { title: t("slaModule.definitions.assignmentAcceptTargetSec"), dataIndex: "assignmentAcceptTargetSec", key: "assignmentAcceptTargetSec", render: (value: number | null) => value ?? "-" },
        { title: t("slaModule.definitions.followUpTargetSec"), dataIndex: "followUpTargetSec", key: "followUpTargetSec", render: (value: number | null) => value ?? "-" },
        { title: t("slaModule.definitions.resolutionTargetSec"), dataIndex: "resolutionTargetSec", key: "resolutionTargetSec" },
        { title: t("slaModule.definitions.status"), dataIndex: "isActive", key: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? t("slaModule.definitions.active") : t("slaModule.definitions.inactive")}</Tag> },
        {
          title: t("slaModule.definitions.actions"),
          key: "actions",
          render: (_: unknown, row: SlaDefinitionItem) => (
            <Space>
              <Button size="small" onClick={() => onToggle(row)} loading={saving}>{row.isActive ? t("slaModule.definitions.disable") : t("slaModule.definitions.enable")}</Button>
              <Button size="small" onClick={() => onEdit(row)}>{t("slaModule.definitions.edit")}</Button>
            </Space>
          )
        }
      ]}
    />
  );
}
