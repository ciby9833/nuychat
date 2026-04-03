/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> 违约列表
 * 文件职责: 展示 SLA 违约记录列表，并提供确认、解决等状态处置操作。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供违约记录、分页和状态更新动作。
 * - ./SlaBreachFilterBar.tsx: 提供筛选条件。
 */

import { Button, Space, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import type { SlaBreachItem, SlaBreachListResponse } from "../types";

type SlaBreachesTableProps = {
  loading: boolean;
  breaches: SlaBreachListResponse | null;
  onStatusChange: (item: SlaBreachItem, status: "open" | "acknowledged" | "resolved") => void;
  onPageChange: (page: number, pageSize: number) => void;
};

export function SlaBreachesTable({
  loading,
  breaches,
  onStatusChange,
  onPageChange
}: SlaBreachesTableProps) {
  const { t } = useTranslation();
  const metricLabel = (value: string) => {
    switch (value) {
      case "first_response":
        return t("slaModule.filter.metric.firstResponse");
      case "assignment_accept":
        return t("slaModule.filter.metric.assignmentAccept");
      case "subsequent_response":
        return t("slaModule.filter.metric.subsequentResponse");
      case "follow_up":
        return t("slaModule.filter.metric.followUp");
      case "resolution":
        return t("slaModule.filter.metric.resolution");
      default:
        return value;
    }
  };

  return (
    <Table<SlaBreachItem>
      rowKey="breachId"
      loading={loading}
      dataSource={breaches?.items ?? []}
      title={() => t("slaModule.breaches.title")}
      pagination={{
        current: breaches?.page ?? 1,
        pageSize: breaches?.pageSize ?? 20,
        total: breaches?.total ?? 0,
        onChange: onPageChange
      }}
      columns={[
        { title: t("slaModule.breaches.createdAt"), dataIndex: "createdAt", key: "createdAt", render: (value: string) => dayjs(value).format("MM-DD HH:mm:ss") },
        { title: t("slaModule.breaches.metric"), dataIndex: "metric", key: "metric", render: (value: string) => <Tag>{metricLabel(value)}</Tag> },
        { title: t("slaModule.breaches.agentName"), dataIndex: "agentName", key: "agentName", render: (value: string | null) => value ?? t("slaModule.breaches.empty") },
        { title: t("slaModule.breaches.caseId"), dataIndex: "caseId", key: "caseId", render: (value: string | null) => (value ? <code>{value.slice(0, 8)}</code> : t("slaModule.breaches.empty")) },
        { title: t("slaModule.breaches.conversationId"), dataIndex: "conversationId", key: "conversationId", render: (value: string | null) => (value ? <code>{value.slice(0, 8)}</code> : t("slaModule.breaches.empty")) },
        { title: t("slaModule.breaches.targetSec"), dataIndex: "targetSec", key: "targetSec" },
        { title: t("slaModule.breaches.actualSec"), dataIndex: "actualSec", key: "actualSec" },
        { title: t("slaModule.breaches.breachSec"), dataIndex: "breachSec", key: "breachSec" },
        { title: t("slaModule.breaches.severity"), dataIndex: "severity", key: "severity", render: (value: "warning" | "critical") => <Tag color={value === "critical" ? "red" : "orange"}>{value === "critical" ? t("slaModule.breaches.severityCritical") : t("slaModule.breaches.severityWarning")}</Tag> },
        { title: t("slaModule.breaches.status"), dataIndex: "status", key: "status", render: (value: "open" | "acknowledged" | "resolved") => value === "open" ? <Tag color="red">{t("slaModule.breaches.statusOpen")}</Tag> : value === "acknowledged" ? <Tag color="blue">{t("slaModule.breaches.statusAcknowledged")}</Tag> : <Tag color="green">{t("slaModule.breaches.statusResolved")}</Tag> },
        {
          title: t("slaModule.breaches.actions"),
          key: "actions",
          render: (_: unknown, row: SlaBreachItem) => (
            <Space>
              <Button size="small" disabled={row.status !== "open"} onClick={() => onStatusChange(row, "acknowledged")}>{t("slaModule.breaches.acknowledge")}</Button>
              <Button size="small" type="primary" ghost disabled={row.status === "resolved"} onClick={() => onStatusChange(row, "resolved")}>{t("slaModule.breaches.resolve")}</Button>
            </Space>
          )
        }
      ]}
    />
  );
}
