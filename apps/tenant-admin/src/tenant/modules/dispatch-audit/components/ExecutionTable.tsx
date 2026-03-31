/**
 * 菜单路径与名称: 客户中心 -> 调度审计 -> 执行列表
 * 文件职责: 展示调度执行记录列表，并提供进入详情抽屉的入口。
 * 主要交互文件:
 * - ../DispatchAuditTab.tsx
 * - ../helpers.tsx
 * - ../modals/DetailDrawer.tsx
 * - ../../../types
 */

import { Button, Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { DispatchExecutionListItem } from "../../../types";
import { formatDecisionReasonText, formatDecisionType, formatTriggerType } from "../helpers";

export function ExecutionTable({
  items,
  loading,
  onOpenDetail
}: {
  items: DispatchExecutionListItem[];
  loading: boolean;
  onOpenDetail: (executionId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Table<DispatchExecutionListItem>
      rowKey="executionId"
      loading={loading}
      dataSource={items}
      pagination={{ pageSize: 20 }}
      columns={[
        { title: t("dispatchAudit.columns.time"), dataIndex: "createdAt", width: 180 },
        {
          title: t("dispatchAudit.columns.case"),
          render: (_, row) => (
            <div>
              <div>{row.caseId ? t("dispatchAudit.case.short", { id: row.caseId.slice(0, 8) }) : t("dispatchAudit.case.unlinked")}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.caseTitle || row.customerName || row.customerRef || row.conversationId}
              </Typography.Text>
            </div>
          ),
          width: 240
        },
        { title: t("dispatchAudit.columns.trigger"), dataIndex: "triggerType", width: 160, render: (value: string | null) => formatTriggerType(t, value) },
        { title: t("dispatchAudit.columns.decisionType"), dataIndex: "decisionType", width: 160, render: (value: string | null) => formatDecisionType(t, value) },
        { title: t("dispatchAudit.columns.rule"), dataIndex: "routingRuleName", render: (value: string | null) => value || t("dispatchAudit.common.none") },
        { title: t("dispatchAudit.columns.reason"), dataIndex: "decisionReason", render: (value: string | null) => value ? formatDecisionReasonText(t, value) : t("dispatchAudit.common.none") },
        {
          title: t("dispatchAudit.columns.summary"),
          render: (_, row) => {
            const assignedAgentId = typeof row.decisionSummary.assignedAgentId === "string" ? row.decisionSummary.assignedAgentId : null;
            const aiAgentId = typeof row.decisionSummary.aiAgentId === "string" ? row.decisionSummary.aiAgentId : null;
            const aiAgentName = typeof row.decisionSummary.aiAgentName === "string" ? row.decisionSummary.aiAgentName : null;
            return (
              <Space wrap>
                {assignedAgentId ? <Tag color="green">{t("dispatchAudit.summary.assignedAgent", { id: assignedAgentId.slice(0, 8) })}</Tag> : null}
                {aiAgentId ? <Tag color="purple">{aiAgentName || t("dispatchAudit.summary.assignedAi", { id: aiAgentId.slice(0, 8) })}</Tag> : null}
                {!assignedAgentId && !aiAgentId ? <Tag>{t("dispatchAudit.summary.noDirectOwner")}</Tag> : null}
              </Space>
            );
          }
        },
        {
          title: t("common.action"),
          width: 100,
          render: (_, row) => (
            <Button size="small" onClick={() => onOpenDetail(row.executionId)}>
              {t("dispatchAudit.actions.view")}
            </Button>
          )
        }
      ]}
    />
  );
}
