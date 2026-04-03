/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 路由规则
 * 文件职责: 展示路由规则列表、条件摘要、目标归属与操作入口。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../helpers.ts
 * - ../modals/RuleEditorDrawer.tsx
 * - ../types.ts
 */

import { CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { ChannelConfig, DepartmentItem, RoutingRule, TeamItem } from "../../../types";
import { buildRuleSummary, getExecutionModeLabel } from "../helpers";

const executionModeColor: Record<string, string> = {
  ai_first: "blue",
  human_first: "green",
  hybrid: "cyan"
};

export function RuleTable({
  rules,
  channels,
  departments,
  teams,
  loading,
  onEdit,
  onDelete
}: {
  rules: RoutingRule[];
  channels: ChannelConfig[];
  departments: DepartmentItem[];
  teams: TeamItem[];
  loading: boolean;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Table<RoutingRule>
      rowKey="rule_id"
      loading={loading}
      dataSource={rules}
      pagination={{ pageSize: 10 }}
      size="middle"
      columns={[
        {
          title: t("routing.table.rule"),
          width: 200,
          render: (_, row) => (
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{row.name}</Typography.Text>
              <Space size={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("routing.summary.priority", { count: row.priority })}</Typography.Text>
                <Tag color={executionModeColor[row.actions.executionMode ?? "hybrid"] ?? "default"} style={{ fontSize: 11 }}>
                  {getExecutionModeLabel((row.actions.executionMode as "ai_first" | "human_first" | "hybrid" | undefined) ?? "hybrid")}
                </Tag>
              </Space>
            </Space>
          )
        },
        {
          title: t("routing.table.conditions"),
          width: 220,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams, channels);
            return (
              <Space size={4} wrap>
                <Tag>{s.channel}</Tag>
                {s.channelInstance ? <Tag color="blue">{s.channelInstance}</Tag> : null}
                <Tag>{s.language}</Tag>
                <Tag>{s.tier}</Tag>
              </Space>
            );
          }
        },
        {
          title: t("routing.table.target"),
          width: 180,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams, channels);
            return (
              <Space direction="vertical" size={0}>
                <Typography.Text>{s.departmentName}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.teamName}</Typography.Text>
              </Space>
            );
          }
        },
        {
          title: t("routing.table.skillAndStrategy"),
          width: 200,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams, channels);
            return (
              <Space direction="vertical" size={0}>
                <Typography.Text>{s.skillGroupCode}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  人工: {s.humanStrategy} | AI: {s.aiStrategy}
                </Typography.Text>
              </Space>
            );
          }
        },
        {
          title: t("routing.table.status"),
          dataIndex: "is_active",
          width: 90,
          render: (value: boolean) => value
            ? <Tag color="green" icon={<CheckCircleOutlined />}>{t("routing.state.active")}</Tag>
            : <Tag>{t("routing.state.inactive")}</Tag>
        },
        {
          title: t("common.action"),
          width: 130,
          render: (_, row) => (
            <Space size={4}>
              <Button size="small" onClick={() => onEdit(row.rule_id)}>{t("common.edit")}</Button>
              <Popconfirm
                title={t("routing.confirm.deleteRuleTitle")}
                description={t("routing.confirm.deleteRuleDescription")}
                onConfirm={() => onDelete(row.rule_id)}
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
