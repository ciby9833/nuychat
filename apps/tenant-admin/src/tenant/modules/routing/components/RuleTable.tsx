import { CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag, Typography } from "antd";

import type { DepartmentItem, RoutingRule, TeamItem, TenantAIAgent } from "../../../types";
import { buildRuleSummary } from "../helpers";
import { EXECUTION_MODE_OPTIONS } from "../types";

const executionModeColor: Record<string, string> = {
  ai_first: "blue",
  human_first: "green",
  ai_only: "purple",
  human_only: "orange",
  hybrid: "cyan"
};

export function RuleTable({
  rules,
  departments,
  teams,
  aiAgents,
  loading,
  onEdit,
  onDelete
}: {
  rules: RoutingRule[];
  departments: DepartmentItem[];
  teams: TeamItem[];
  aiAgents: TenantAIAgent[];
  loading: boolean;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}) {
  return (
    <Table<RoutingRule>
      rowKey="rule_id"
      loading={loading}
      dataSource={rules}
      pagination={{ pageSize: 10 }}
      size="middle"
      columns={[
        {
          title: "规则",
          width: 200,
          render: (_, row) => (
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{row.name}</Typography.Text>
              <Space size={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>优先级 {row.priority}</Typography.Text>
                <Tag color={executionModeColor[row.actions.executionMode ?? "ai_first"] ?? "default"} style={{ fontSize: 11 }}>
                  {EXECUTION_MODE_OPTIONS.find((o) => o.value === (row.actions.executionMode ?? "ai_first"))?.label ?? row.actions.executionMode}
                </Tag>
              </Space>
            </Space>
          )
        },
        {
          title: "命中条件",
          width: 220,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams);
            return (
              <Space size={4} wrap>
                <Tag>{s.channel}</Tag>
                <Tag>{s.language}</Tag>
                <Tag>{s.tier}</Tag>
              </Space>
            );
          }
        },
        {
          title: "目标归属",
          width: 180,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams);
            return (
              <Space direction="vertical" size={0}>
                <Typography.Text>{s.departmentName}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.teamName}</Typography.Text>
              </Space>
            );
          }
        },
        {
          title: "技能组 / 策略",
          width: 200,
          render: (_, row) => {
            const s = buildRuleSummary(row, departments, teams);
            return (
              <Space direction="vertical" size={0}>
                <Typography.Text>{s.skillGroupCode}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  AI: {aiAgents.find((a) => a.aiAgentId === s.aiAgentId)?.name ?? "自动"} | {s.strategy}
                </Typography.Text>
              </Space>
            );
          }
        },
        {
          title: "状态",
          dataIndex: "is_active",
          width: 90,
          render: (value: boolean) => value
            ? <Tag color="green" icon={<CheckCircleOutlined />}>启用</Tag>
            : <Tag>停用</Tag>
        },
        {
          title: "操作",
          width: 130,
          render: (_, row) => (
            <Space size={4}>
              <Button size="small" onClick={() => onEdit(row.rule_id)}>编辑</Button>
              <Popconfirm
                title="删除这个规则？"
                description="删除后该路由规则将立即停止生效。"
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
