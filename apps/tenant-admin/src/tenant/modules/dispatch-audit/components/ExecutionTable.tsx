// 作用: 调度执行记录列表表格
// 菜单路径: 客户中心 -> 调度审计 -> 执行列表
// 作者：吴川

import { Button, Space, Table, Tag, Typography } from "antd";

import type { DispatchExecutionListItem } from "../../../types";

export function ExecutionTable({
  items,
  loading,
  onOpenDetail
}: {
  items: DispatchExecutionListItem[];
  loading: boolean;
  onOpenDetail: (executionId: string) => void;
}) {
  return (
    <Table<DispatchExecutionListItem>
      rowKey="executionId"
      loading={loading}
      dataSource={items}
      pagination={{ pageSize: 20 }}
      columns={[
        { title: "时间", dataIndex: "createdAt", width: 180 },
        {
          title: "事项",
          render: (_, row) => (
            <div>
              <div>{row.caseId ? `事项 ${row.caseId.slice(0, 8)}` : "未关联事项"}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.caseTitle || row.customerName || row.customerRef || row.conversationId}
              </Typography.Text>
            </div>
          ),
          width: 240
        },
        { title: "触发", dataIndex: "triggerType", width: 160 },
        { title: "决策类型", dataIndex: "decisionType", width: 160 },
        { title: "规则", dataIndex: "routingRuleName", render: (value: string | null) => value || "-" },
        { title: "原因", dataIndex: "decisionReason", render: (value: string | null) => value || "-" },
        {
          title: "摘要",
          render: (_, row) => {
            const assignedAgentId = typeof row.decisionSummary.assignedAgentId === "string" ? row.decisionSummary.assignedAgentId : null;
            const aiAgentId = typeof row.decisionSummary.aiAgentId === "string" ? row.decisionSummary.aiAgentId : null;
            return (
              <Space wrap>
                {assignedAgentId ? <Tag color="green">人工 {assignedAgentId.slice(0, 8)}</Tag> : null}
                {aiAgentId ? <Tag color="purple">AI {aiAgentId.slice(0, 8)}</Tag> : null}
                {!assignedAgentId && !aiAgentId ? <Tag>无直接负责人</Tag> : null}
              </Space>
            );
          }
        },
        {
          title: "操作",
          width: 100,
          render: (_, row) => (
            <Button size="small" onClick={() => onOpenDetail(row.executionId)}>
              查看
            </Button>
          )
        }
      ]}
    />
  );
}
