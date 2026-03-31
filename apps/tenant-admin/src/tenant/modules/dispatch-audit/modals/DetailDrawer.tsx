/**
 * 菜单路径与名称: 客户中心 -> 调度审计 -> 执行详情抽屉
 * 文件职责: 展示单条调度执行的基础信息、候选列表与责任切换记录。
 * 主要交互文件:
 * - ../DispatchAuditTab.tsx
 * - ../helpers.tsx
 * - ../../../types
 */

import { Card, Descriptions, Drawer, Space, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { DispatchExecutionDetail } from "../../../types";
import {
  formatCandidateStage,
  formatCandidateType,
  formatDecisionReasonText,
  formatDecisionType,
  formatOwnerDisplay,
  formatTransitionType,
  formatTriggerType,
  renderCandidateDetails,
  renderSummary
} from "../helpers";

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
  const { t } = useTranslation();

  return (
    <Drawer
      title={t("dispatchAudit.detail.title")}
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      loading={loading}
    >
      {selected ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label={t("dispatchAudit.detail.case")}>
              {selected.execution.caseId ? t("dispatchAudit.case.full", { id: selected.execution.caseId }) : t("dispatchAudit.case.unlinked")}
              {selected.execution.caseTitle ? ` · ${selected.execution.caseTitle}` : ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.conversation")}>{selected.execution.customerName || selected.execution.customerRef || selected.execution.conversationId}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.trigger")}>{formatTriggerType(t, selected.execution.triggerType)}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.decisionType")}>{formatDecisionType(t, selected.execution.decisionType)}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.rule")}>{selected.execution.routingRuleName || t("dispatchAudit.common.none")}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.conditions")}>{renderSummary(t, selected.execution.matchedConditions)}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.inputSnapshot")}>{renderSummary(t, selected.execution.inputSnapshot)}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.decisionSummary")}>{renderSummary(t, selected.execution.decisionSummary)}</Descriptions.Item>
            <Descriptions.Item label={t("dispatchAudit.detail.decisionReason")}>{selected.execution.decisionReason ? formatDecisionReasonText(t, selected.execution.decisionReason) : t("dispatchAudit.common.none")}</Descriptions.Item>
          </Descriptions>

          <Card size="small" title={t("dispatchAudit.detail.candidates")}>
            <Table
              rowKey={(row) => `${row.candidateType}-${row.candidateId}-${row.createdAt}`}
              size="small"
              pagination={false}
              dataSource={selected.candidates}
              columns={[
                { title: t("dispatchAudit.candidateColumns.type"), dataIndex: "candidateType", width: 100, render: (value: string | null) => formatCandidateType(t, value) },
                { title: t("dispatchAudit.candidateColumns.candidate"), dataIndex: "candidateLabel", render: (value: string | null, row) => value || row.candidateId || t("dispatchAudit.common.none") },
                { title: t("dispatchAudit.candidateColumns.stage"), dataIndex: "stage", width: 140, render: (value: string | null) => formatCandidateStage(t, value) },
                {
                  title: t("dispatchAudit.candidateColumns.result"),
                  width: 100,
                  render: (_, row) => row.accepted ? <Tag color="green">{t("dispatchAudit.candidateResult.accepted")}</Tag> : <Tag>{t("dispatchAudit.candidateResult.rejected")}</Tag>
                },
                { title: t("dispatchAudit.candidateColumns.reason"), dataIndex: "rejectReason", render: (value: string | null) => value ? formatDecisionReasonText(t, value) : t("dispatchAudit.common.none") },
                { title: t("dispatchAudit.candidateColumns.details"), render: (_, row) => renderCandidateDetails(t, row.details) }
              ]}
            />
          </Card>

          <Card size="small" title={t("dispatchAudit.detail.transitions")}>
            <Table
              rowKey="transitionId"
              size="small"
              pagination={false}
              dataSource={selected.transitions}
              columns={[
                { title: t("dispatchAudit.transitionColumns.time"), dataIndex: "createdAt", width: 180 },
                { title: t("dispatchAudit.transitionColumns.type"), dataIndex: "transitionType", width: 180, render: (value: string | null) => formatTransitionType(t, value) },
                { title: t("dispatchAudit.transitionColumns.from"), render: (_, row) => formatOwnerDisplay(t, row.fromOwnerType, row.fromOwnerId) },
                { title: t("dispatchAudit.transitionColumns.to"), render: (_, row) => formatOwnerDisplay(t, row.toOwnerType, row.toOwnerId) },
                { title: t("dispatchAudit.transitionColumns.reason"), dataIndex: "reason", render: (value: string | null) => value ? formatDecisionReasonText(t, value) : t("dispatchAudit.common.none") }
              ]}
            />
          </Card>
        </Space>
      ) : null}
    </Drawer>
  );
}
