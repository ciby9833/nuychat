/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 实时状态
 * 文件职责: 展示坐席实时在线状态、活跃会话、最后心跳，并处理发起/结束休息。
 * 主要交互文件:
 * - ../hooks/useShiftsData.ts: 提供实时状态数据与刷新动作。
 * - ../helpers.ts: 提供状态颜色与状态名称。
 * - ../modals/BreakModal.tsx: 处理发起休息。
 * - ../../../api.ts: 提供结束休息接口。
 */

import { CoffeeOutlined } from "@ant-design/icons";
import { Badge, Button, Statistic, Table, Tag, Tooltip, Typography, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { endAgentBreak } from "../../../api";
import { getStatusLabels, STATUS_COLORS } from "../helpers";
import { BreakModal } from "../modals/BreakModal";
import type { AgentPresenceResponse } from "../types";

type PresencePaneProps = {
  presence: AgentPresenceResponse | null;
  loading: boolean;
  onReload: () => Promise<void>;
};

export function PresencePane({ presence, loading, onReload }: PresencePaneProps) {
  const { t } = useTranslation();
  const [endingId, setEndingId] = useState<string | null>(null);
  const [breakModal, setBreakModal] = useState<{ agentId: string; agentName: string } | null>(null);
  const statusLabels = getStatusLabels();

  const handleEndBreak = async (agentId: string) => {
    setEndingId(agentId);
    try {
      await endAgentBreak(agentId);
      void message.success(t("shiftsModule.messages.endBreakSuccess"));
      await onReload();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setEndingId(null);
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {(["total", "online", "busy", "away", "offline"] as const).map((key) => (
          <div key={key} style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 8, padding: "12px 20px", minWidth: 90, textAlign: "center" }}>
            <Statistic
              title={key === "total" ? t("shiftsModule.presence.totalAgents") : statusLabels[key]}
              value={presence?.summary[key as keyof NonNullable<typeof presence>["summary"]] ?? 0}
              valueStyle={key !== "total" ? { color: STATUS_COLORS[key], fontSize: 22 } : { fontSize: 22 }}
              loading={loading}
            />
          </div>
        ))}
      </div>

      <Table
        rowKey="agentId"
        loading={loading}
        dataSource={presence?.items ?? []}
        pagination={false}
        locale={{ emptyText: t("shiftsModule.presence.empty") }}
        columns={[
          {
            title: t("shiftsModule.presence.agent"),
            key: "name",
            render: (_, row: AgentPresenceResponse["items"][number]) => (
              <div>
                <Typography.Text strong>{row.displayName}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{row.email}</Typography.Text>
              </div>
            )
          },
          {
            title: t("shiftsModule.presence.status"),
            dataIndex: "status",
            width: 100,
            render: (value: string) => <Badge color={STATUS_COLORS[value] ?? "#d9d9d9"} text={statusLabels[value] ?? value} />
          },
          {
            title: t("shiftsModule.presence.activeConversations"),
            dataIndex: "activeConversations",
            width: 90,
            render: (value: number) => value > 0 ? <Tag color="blue">{value}</Tag> : <Typography.Text type="secondary">0</Typography.Text>
          },
          {
            title: t("shiftsModule.presence.lastHeartbeat"),
            dataIndex: "lastSeenAt",
            width: 160,
            render: (value: string | null) => {
              if (!value) return <Typography.Text type="secondary">-</Typography.Text>;
              const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
              const label = diffMin < 1 ? t("shiftsModule.presence.justNow") : diffMin < 60 ? t("shiftsModule.presence.minutesAgo", { count: diffMin }) : t("shiftsModule.presence.hoursAgo", { count: Math.floor(diffMin / 60) });
              return <Tooltip title={new Date(value).toLocaleString()}><Typography.Text type="secondary">{label}</Typography.Text></Tooltip>;
            }
          },
          {
            title: t("shiftsModule.presence.actions"),
            key: "action",
            width: 130,
            render: (_, row: AgentPresenceResponse["items"][number]) => {
              if (row.status === "away") {
                return <Button size="small" loading={endingId === row.agentId} onClick={() => { void handleEndBreak(row.agentId); }}>{t("shiftsModule.presence.endBreak")}</Button>;
              }
              return (
                <Button
                  size="small"
                  type="dashed"
                  icon={<CoffeeOutlined />}
                  disabled={row.status === "offline"}
                  onClick={() => setBreakModal({ agentId: row.agentId, agentName: row.displayName })}
                >
                  {t("shiftsModule.presence.startBreak")}
                </Button>
              );
            }
          }
        ]}
      />

      {breakModal ? (
        <BreakModal
          agentId={breakModal.agentId}
          agentName={breakModal.agentName}
          open={Boolean(breakModal)}
          onClose={() => setBreakModal(null)}
          onSaved={onReload}
        />
      ) : null}
    </>
  );
}
