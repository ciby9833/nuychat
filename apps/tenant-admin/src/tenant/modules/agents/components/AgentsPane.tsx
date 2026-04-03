import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import { Badge, Button, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { removeAgent } from "../../../api";
import type { AgentProfile, MemberListItem } from "../../../types";
import { AgentDrawer } from "../modals/AgentDrawer";
import { ROLE_COLOR, roleLabel, seniorityLabel, statusLabel } from "../types";

export function AgentsPane({
  agents,
  members,
  loading,
  onReload,
  onEnable
}: {
  agents: AgentProfile[];
  members: MemberListItem[];
  loading: boolean;
  onReload: () => void;
  onEnable: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AgentProfile | null>(null);

  useEffect(() => {
    if (!selected) return;
    const fresh = agents.find((agent) => agent.agentId === selected.agentId) ?? null;
    if (!fresh) setSelected(null);
    else if (fresh !== selected) setSelected(fresh);
  }, [agents, selected]);

  const removableCandidates = members.filter((member) => !member.agentId).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Space size="large">
          <Space><Badge status="success" /><Typography.Text>{t("agents.onlineCount", { count: agents.filter((a) => a.status === "online").length })}</Typography.Text></Space>
          <Space><Badge status="warning" /><Typography.Text>{t("agents.busyCount",   { count: agents.filter((a) => a.status === "busy").length })}</Typography.Text></Space>
          <Typography.Text type="secondary">{t("agents.totalCount", { count: agents.length })}</Typography.Text>
        </Space>
        <Space>
          <Button onClick={onReload} loading={loading}>{t("common.refresh")}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onEnable}>{t("agents.enableBtn")}</Button>
        </Space>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        {t("agents.notEnabled", { count: removableCandidates })}
      </Typography.Paragraph>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <Table<AgentProfile>
          rowKey="agentId"
          loading={loading}
          dataSource={agents}
          pagination={agents.length > 10 ? { pageSize: 10, size: "small" } : false}
          onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: "pointer" } })}
          columns={[
            {
              title: t("agents.col.agent"),
              render: (_, row) => (
                <Space>
                  <UserOutlined style={{ color: "#8c8c8c" }} />
                  <div>
                    <Typography.Text strong>{row.displayName}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.email}{row.employeeNo ? ` / ${row.employeeNo}` : ""}
                    </Typography.Text>
                  </div>
                </Space>
              )
            },
            {
              title: t("agents.col.status"),
              dataIndex: "status",
              width: 90,
              render: (value: string) => (
                <Badge
                  status={value === "online" ? "success" : value === "busy" ? "warning" : "default"}
                  text={statusLabel(value)}
                />
              )
            },
            { title: t("agents.col.role"),        dataIndex: "role",           width: 110, render: (value: string) => <Tag color={ROLE_COLOR[value] ?? "default"}>{roleLabel(value)}</Tag> },
            { title: t("agents.col.seniority"),   dataIndex: "seniorityLevel", width: 80, render: (value: string) => seniorityLabel(value) },
            { title: t("agents.col.concurrency"), dataIndex: "maxConcurrency", width: 70, align: "center" as const }
          ]}
        />
      </div>

      <AgentDrawer
        agent={selected}
        onClose={() => setSelected(null)}
        onUpdated={onReload}
        onRemoved={async (agentId) => {
          try {
            await removeAgent(agentId);
            void message.success(t("agents.removedSuccess"));
            setSelected(null);
            onReload();
          } catch (err) {
            void message.error((err as Error).message);
          }
        }}
      />
    </>
  );
}
