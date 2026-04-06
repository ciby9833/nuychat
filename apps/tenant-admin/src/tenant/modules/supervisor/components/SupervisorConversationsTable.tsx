/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台 -> 会话监控
 * 文件职责: 展示主管重点关注的会话监控列表，并提供跳转到人工会话页的入口。
 * 主要交互文件:
 * - ../SupervisorTab.tsx: 提供跳转动作与分页动作。
 * - ../hooks/useSupervisorData.ts: 提供会话数据。
 * - ../../human-conversations/HumanConversationsTab.tsx: 承接后续处理。
 */

import { Button, Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SupervisorConversationWorkbenchItem, SupervisorConversationWorkbenchResponse } from "../types";

type SupervisorConversationsTableProps = {
  loading: boolean;
  conversations: SupervisorConversationWorkbenchResponse | null;
  onOpenHumanConversations: (row: SupervisorConversationWorkbenchItem) => void;
  onPageChange: (page: number) => void;
};

export function SupervisorConversationsTable({
  loading,
  conversations,
  onOpenHumanConversations,
  onPageChange
}: SupervisorConversationsTableProps) {
  const { t } = useTranslation();

  const renderQueueState = (row: SupervisorConversationWorkbenchItem) => {
    const etaMinutes =
      typeof row.estimatedWaitSec === "number" && row.estimatedWaitSec > 0
        ? Math.max(1, Math.ceil(row.estimatedWaitSec / 60))
        : null;

    return (
      <Space direction="vertical" size={2}>
        <Space size={4} wrap>
          {row.serviceRequestMode === "human_requested" ? (
            <Tag color="gold">{t("supervisorModule.conversations.humanRequested")}</Tag>
          ) : null}
          {row.queueMode === "assigned_waiting" ? (
            <Tag color="blue">{t("supervisorModule.conversations.assignedWaiting")}</Tag>
          ) : null}
          {row.queueMode === "pending_unavailable" ? (
            <Tag color="orange">{t("supervisorModule.conversations.pendingUnavailable")}</Tag>
          ) : null}
          {row.aiFallbackAllowed ? <Tag color="purple">{t("supervisorModule.conversations.aiFallbackAllowed")}</Tag> : null}
        </Space>
        {typeof row.queuePosition === "number" ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("supervisorModule.conversations.queueAhead", { count: row.queuePosition })}
            {etaMinutes ? ` · ${t("supervisorModule.conversations.etaMinutes", { count: etaMinutes })}` : ""}
          </Typography.Text>
        ) : null}
      </Space>
    );
  };

  const columns = useMemo(
    () => [
      {
        title: t("supervisorModule.conversations.customerConversation"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => (
          <div>
            <div>{row.customerName ?? row.customerRef ?? t("supervisorModule.conversations.empty")}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("supervisorModule.conversations.conversationPrefix", { id: row.conversationId.slice(0, 8) })}
              {row.caseId ? ` · ${t("supervisorModule.conversations.casePrefix", { id: row.caseId.slice(0, 8) })}` : ""}
              {row.caseTitle ? ` · ${row.caseTitle}` : ""}
            </Typography.Text>
          </div>
        )
      },
      { title: t("supervisorModule.conversations.channel"), dataIndex: "channelType", render: (v: string | null) => (v ? <Tag>{v.toUpperCase()}</Tag> : t("supervisorModule.conversations.empty")) },
      {
        title: t("supervisorModule.conversations.currentResponsible"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) =>
          row.currentResponsibleName
            ? `${row.currentResponsibleName}${row.currentResponsibleType === "ai" ? t("supervisorModule.conversations.aiSuffix") : ""}`
            : t("supervisorModule.conversations.empty")
      },
      {
        title: t("supervisorModule.conversations.reservedResponsible"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) =>
          row.reservedResponsibleName
            ? `${row.reservedResponsibleName}${row.reservedResponsibleType === "ai" ? t("supervisorModule.conversations.aiSuffix") : ""}`
            : t("supervisorModule.conversations.empty")
      },
      {
        title: t("supervisorModule.conversations.queueState"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => renderQueueState(row)
      },
      {
        title: t("supervisorModule.conversations.lastCustomerMessage"),
        dataIndex: "lastCustomerMessageAt",
        render: (value: string | null) => (value ? new Date(value).toLocaleString() : t("supervisorModule.conversations.empty"))
      },
      {
        title: t("supervisorModule.conversations.waitingDuration"),
        dataIndex: "waitingSeconds",
        render: (seconds: number) => {
          if (!seconds || seconds <= 0) return t("supervisorModule.conversations.empty");
          const minutes = Math.floor(seconds / 60);
          return <Tag color={minutes >= 10 ? "red" : minutes >= 5 ? "gold" : "blue"}>{t("supervisorModule.conversations.minutes", { count: minutes })}</Tag>;
        }
      },
      {
        title: t("supervisorModule.conversations.firstResponse"),
        dataIndex: "hasFirstResponse",
        render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? t("supervisorModule.conversations.replied") : t("supervisorModule.conversations.notReplied")}</Tag>
      },
      {
        title: t("supervisorModule.conversations.reassignCount"),
        dataIndex: "reassignCount"
      },
      {
        title: t("supervisorModule.conversations.exceptionReason"),
        dataIndex: "currentExceptionReason",
        render: (value: string | null) => {
          if (!value) return t("supervisorModule.conversations.empty");
          if (value === "human_queue_unavailable") {
            return <Tag color="orange">{t("supervisorModule.conversations.pendingUnavailable")}</Tag>;
          }
          return <Tag color="orange">{value}</Tag>;
        }
      },
      {
        title: t("supervisorModule.conversations.organization"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => row.teamName ?? row.departmentName ?? t("supervisorModule.conversations.empty")
      },
      {
        title: t("supervisorModule.conversations.status"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => (
          <Space size={4}>
            {row.ownerBucket ? <Tag color="purple">{row.ownerBucket}</Tag> : null}
            {row.conversationStatus ? <Tag>{row.conversationStatus}</Tag> : null}
            {row.queueStatus ? <Tag color="blue">{row.queueStatus}</Tag> : null}
          </Space>
        )
      },
      {
        title: t("supervisorModule.conversations.actions"),
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => (
          <Space>
            <Tooltip title={t("supervisorModule.conversations.viewTooltip")}>
              <Button type="primary" size="small" onClick={() => onOpenHumanConversations(row)}>
                {t("supervisorModule.conversations.viewConversation")}
              </Button>
            </Tooltip>
            <Tooltip title={t("supervisorModule.conversations.handleTooltip")}>
              <Button size="small" onClick={() => onOpenHumanConversations(row)}>
                {t("supervisorModule.conversations.goHandle")}
              </Button>
            </Tooltip>
          </Space>
        )
      }
    ],
    [onOpenHumanConversations, t]
  );

  return (
    <Card
      title={t("supervisorModule.conversations.title")}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("supervisorModule.conversations.description")}
        </Typography.Text>
      }
    >
      <Table<SupervisorConversationWorkbenchItem>
        rowKey="conversationId"
        loading={loading}
        columns={columns}
        dataSource={conversations?.items ?? []}
        pagination={{
          current: conversations?.page ?? 1,
          pageSize: conversations?.pageSize ?? 20,
          total: conversations?.total ?? 0,
          onChange: (nextPage) => onPageChange(nextPage)
        }}
      />
    </Card>
  );
}
