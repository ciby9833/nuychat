/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台 -> 坐席状态
 * 文件职责: 展示当前坐席在线状态、活跃会话数与最近活跃时间。
 * 主要交互文件:
 * - ../hooks/useSupervisorData.ts: 提供坐席状态数据。
 * - ../SupervisorTab.tsx: 负责承接表格展示。
 */

import { Card, Table, Tag } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SupervisorAgentStatus } from "../types";

type SupervisorAgentsTableProps = {
  loading: boolean;
  agents: SupervisorAgentStatus[];
};

export function SupervisorAgentsTable({ loading, agents }: SupervisorAgentsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo(
    () => [
      { title: t("supervisorModule.agents.agent"), dataIndex: "displayName" },
      { title: t("supervisorModule.agents.email"), dataIndex: "email" },
      {
        title: t("supervisorModule.agents.status"),
        dataIndex: "status",
        render: (value: string) => {
          const map: Record<string, string> = { online: "green", busy: "blue", away: "gold", offline: "default" };
          return <Tag color={map[value] ?? "default"}>{String(value).toUpperCase()}</Tag>;
        }
      },
      { title: t("supervisorModule.agents.activeConversations"), dataIndex: "activeConversations" },
      { title: t("supervisorModule.agents.lastSeen"), dataIndex: "lastSeenAt", render: (value: string | null) => (value ? new Date(value).toLocaleString() : t("supervisorModule.agents.empty")) }
    ],
    [t]
  );

  return (
    <Card title={t("supervisorModule.agents.title")}>
      <Table<SupervisorAgentStatus>
        rowKey="agentId"
        loading={loading}
        columns={columns}
        dataSource={agents}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );
}
