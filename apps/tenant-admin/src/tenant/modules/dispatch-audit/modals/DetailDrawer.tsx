// 作用: 调度执行详情抽屉（基础信息 + 候选项 + 责任切换）
// 菜单路径: 客户中心 -> 调度审计 -> 执行详情
// 作者：吴川

import { Card, Descriptions, Drawer, Space, Table, Tag } from "antd";

import type { DispatchExecutionDetail } from "../../../types";
import { renderCandidateDetails, renderSummary } from "../helpers";

export function DetailDrawer({
  open,
  loading,
  selected,
  onClose
}: {
  open: boolean;
  loading: boolean;
  selected: DispatchExecutionDetail | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="调度执行详情"
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      loading={loading}
    >
      {selected ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="事项">
              {selected.execution.caseId ? `事项 ${selected.execution.caseId}` : "未关联事项"}
              {selected.execution.caseTitle ? ` · ${selected.execution.caseTitle}` : ""}
            </Descriptions.Item>
            <Descriptions.Item label="会话">{selected.execution.customerName || selected.execution.customerRef || selected.execution.conversationId}</Descriptions.Item>
            <Descriptions.Item label="触发">{selected.execution.triggerType}</Descriptions.Item>
            <Descriptions.Item label="决策类型">{selected.execution.decisionType}</Descriptions.Item>
            <Descriptions.Item label="规则">{selected.execution.routingRuleName || "-"}</Descriptions.Item>
            <Descriptions.Item label="条件">{renderSummary(selected.execution.matchedConditions)}</Descriptions.Item>
            <Descriptions.Item label="输入快照">{renderSummary(selected.execution.inputSnapshot)}</Descriptions.Item>
            <Descriptions.Item label="决策摘要">{renderSummary(selected.execution.decisionSummary)}</Descriptions.Item>
            <Descriptions.Item label="决策原因">{selected.execution.decisionReason || "-"}</Descriptions.Item>
          </Descriptions>

          <Card size="small" title="候选项">
            <Table
              rowKey={(row) => `${row.candidateType}-${row.candidateId}-${row.createdAt}`}
              size="small"
              pagination={false}
              dataSource={selected.candidates}
              columns={[
                { title: "类型", dataIndex: "candidateType", width: 100 },
                { title: "候选", dataIndex: "candidateLabel", render: (value: string | null, row) => value || row.candidateId || "-" },
                { title: "阶段", dataIndex: "stage", width: 120 },
                {
                  title: "结果",
                  width: 100,
                  render: (_, row) => row.accepted ? <Tag color="green">选中</Tag> : <Tag>淘汰</Tag>
                },
                { title: "原因", dataIndex: "rejectReason", render: (value: string | null) => value || "-" },
                { title: "详情", render: (_, row) => renderCandidateDetails(row.details) }
              ]}
            />
          </Card>

          <Card size="small" title="责任切换">
            <Table
              rowKey="transitionId"
              size="small"
              pagination={false}
              dataSource={selected.transitions}
              columns={[
                { title: "时间", dataIndex: "createdAt", width: 180 },
                { title: "类型", dataIndex: "transitionType", width: 180 },
                { title: "从", render: (_, row) => `${row.fromOwnerType || "-"} / ${row.fromOwnerId || "-"}` },
                { title: "到", render: (_, row) => `${row.toOwnerType || "-"} / ${row.toOwnerId || "-"}` },
                { title: "原因", dataIndex: "reason", render: (value: string | null) => value || "-" }
              ]}
            />
          </Card>
        </Space>
      ) : null}
    </Drawer>
  );
}
