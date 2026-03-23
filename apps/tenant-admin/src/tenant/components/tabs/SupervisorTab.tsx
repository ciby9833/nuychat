// 用于主管监控工作台，展示会话和坐席的实时状态，并提供介入、转接、强制关闭等操作
// 菜单路径：客户中心 -> 主管监控
// 作者：吴川
import { Button, Card, Col, Input, Modal, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  broadcastToOnlineAgents,
  forceCloseConversation,
  getSupervisorOverview,
  interveneConversation,
  listDepartments,
  listSupervisorAgents,
  listSupervisorConversations,
  listTeams,
  transferConversation
} from "../../api";
import type {
  DepartmentItem,
  SupervisorAgentStatus,
  SupervisorConversationWorkbenchItem,
  SupervisorConversationWorkbenchResponse,
  SupervisorOverview,
  TeamItem
} from "../../types";

export function SupervisorTab() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<SupervisorOverview | null>(null);
  const [conversations, setConversations] = useState<SupervisorConversationWorkbenchResponse | null>(null);
  const [agents, setAgents] = useState<SupervisorAgentStatus[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);
  const [scopeFilter, setScopeFilter] = useState<"all" | "waiting" | "exception" | "active" | "resolved">("all");
  const [page, setPage] = useState(1);
  const [interveneOpen, setInterveneOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [selectedConversation, setSelectedConversation] = useState<SupervisorConversationWorkbenchItem | null>(null);
  const [interveneText, setInterveneText] = useState("");
  const [transferAgentId, setTransferAgentId] = useState<string>("");
  const [broadcastText, setBroadcastText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, agentRows, departmentRows, teamRows, conversationRows] = await Promise.all([
        getSupervisorOverview(),
        listSupervisorAgents(),
        listDepartments(),
        listTeams(departmentFilter),
        listSupervisorConversations({
          departmentId: departmentFilter,
          teamId: teamFilter,
          agentId: agentFilter,
          scope: scopeFilter,
          page,
          pageSize: 20
        })
      ]);
      setOverview(ov);
      setAgents(agentRows);
      setDepartments(departmentRows);
      setTeams(teamRows);
      setConversations(conversationRows);
    } catch (err) {
      message.error(`加载主管工作台失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, departmentFilter, teamFilter, scopeFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const transferAgentOptions = useMemo(
    () => agents.map((agent) => {
      const isAssignable = agent.status === "online" || agent.status === "busy";
      return {
        value: agent.agentId,
        label: `${agent.displayName} (${agent.status} / ${agent.activeConversations})`,
        disabled: !isAssignable || agent.agentId === selectedConversation?.currentResponsibleId
      };
    }),
    [agents, selectedConversation]
  );

  const conversationColumns = useMemo(
    () => [
      {
        title: "客户/会话",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => (
          <div>
            <div>{row.customerName ?? row.customerRef ?? "-"}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              会话 {row.conversationId.slice(0, 8)}{row.caseId ? ` · 事项 ${row.caseId.slice(0, 8)}` : ""}{row.caseTitle ? ` · ${row.caseTitle}` : ""}
            </Typography.Text>
          </div>
        )
      },
      { title: "渠道", dataIndex: "channelType", render: (v: string | null) => (v ? <Tag>{v.toUpperCase()}</Tag> : "-") },
      {
        title: "当前负责对象",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) =>
          row.currentResponsibleName
            ? `${row.currentResponsibleName}${row.currentResponsibleType === "ai" ? " (AI)" : ""}`
            : "-"
      },
      {
        title: "预分配对象",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) =>
          row.reservedResponsibleName
            ? `${row.reservedResponsibleName}${row.reservedResponsibleType === "ai" ? " (AI)" : ""}`
            : "-"
      },
      {
        title: "最后客户消息",
        dataIndex: "lastCustomerMessageAt",
        render: (value: string | null) => (value ? new Date(value).toLocaleString() : "-")
      },
      {
        title: "等待时长",
        dataIndex: "waitingSeconds",
        render: (seconds: number) => {
          if (!seconds || seconds <= 0) return "-";
          const minutes = Math.floor(seconds / 60);
          return <Tag color={minutes >= 10 ? "red" : minutes >= 5 ? "gold" : "blue"}>{minutes} 分钟</Tag>;
        }
      },
      {
        title: "已首响",
        dataIndex: "hasFirstResponse",
        render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? "已回复" : "未回复"}</Tag>
      },
      {
        title: "重分配次数",
        dataIndex: "reassignCount"
      },
      {
        title: "异常原因",
        dataIndex: "currentExceptionReason",
        render: (value: string | null) => value ? <Tag color="orange">{value}</Tag> : "-"
      },
      {
        title: "组织归属",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => row.teamName ?? row.departmentName ?? "-"
      },
      {
        title: "状态",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => (
          <Space size={4}>
            {row.ownerBucket ? <Tag color="purple">{row.ownerBucket}</Tag> : null}
            {row.conversationStatus ? <Tag>{row.conversationStatus}</Tag> : null}
            {row.queueStatus ? <Tag color="blue">{row.queueStatus}</Tag> : null}
          </Space>
        )
      },
      {
        title: "操作",
        render: (_: unknown, row: SupervisorConversationWorkbenchItem) => {
          const isClosed = row.conversationStatus === "resolved" || row.conversationStatus === "closed";
          const canIntervene = !isClosed;
          const canTransfer = !isClosed;
          const canForceClose = !isClosed;

          return (
          <Space>
            <Tooltip title={canIntervene ? "主管发送消息介入当前会话" : "已结束会话不能再介入"}>
              <Button
                size="small"
                disabled={!canIntervene}
                onClick={() => {
                  setSelectedConversationId(row.conversationId);
                  setSelectedConversation(row);
                  setInterveneText("");
                  setInterveneOpen(true);
                }}
              >
                介入
              </Button>
            </Tooltip>
            <Tooltip title={canTransfer ? "改派给其他人工坐席" : "已结束会话不能转接"}>
              <Button
                size="small"
                disabled={!canTransfer}
                onClick={() => {
                  setSelectedConversationId(row.conversationId);
                  setSelectedConversation(row);
                  setTransferAgentId("");
                  setTransferOpen(true);
                }}
              >
                转接
              </Button>
            </Tooltip>
            <Tooltip title={canForceClose ? "强制结束当前会话" : "已结束会话无需重复关闭"}>
              <Button
                size="small"
                danger
                disabled={!canForceClose}
                onClick={() => {
                  Modal.confirm({
                    title: "确认强制关闭会话？",
                    content: `会话 ${row.conversationId.slice(0, 8)} 将被直接结束，这会影响当前处理链路。`,
                    okText: "确认关闭",
                    cancelText: "取消",
                    okButtonProps: { danger: true, loading: saving },
                    onOk: async () => {
                      setSaving(true);
                      try {
                        await forceCloseConversation(row.conversationId, "supervisor force close");
                        message.success("会话已强制关闭");
                        await load();
                      } catch (err) {
                        message.error(`关闭失败: ${(err as Error).message}`);
                      } finally {
                        setSaving(false);
                      }
                    }
                  });
                }}
              >
                强制关闭
              </Button>
            </Tooltip>
          </Space>
          );
        }
      }
    ],
    [load, saving]
  );

  const agentColumns = useMemo(
    () => [
      { title: "坐席", dataIndex: "displayName" },
      { title: "邮箱", dataIndex: "email" },
      {
        title: "状态",
        dataIndex: "status",
        render: (v: string) => {
          const map: Record<string, string> = { online: "green", busy: "blue", away: "gold", offline: "default" };
          return <Tag color={map[v] ?? "default"}>{String(v).toUpperCase()}</Tag>;
        }
      },
      { title: "处理中会话", dataIndex: "activeConversations" },
      { title: "最近活跃", dataIndex: "lastSeenAt", render: (v: string | null) => (v ? new Date(v).toLocaleString() : "-") }
    ],
    []
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="主管监控工作台"
        extra={
          <Space>
            <Button onClick={() => void load()} loading={loading}>刷新</Button>
            <Button
              onClick={() => {
                setBroadcastText("");
                setBroadcastOpen(true);
              }}
            >
              广播通知
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} md={8} lg={4}><Statistic title="等待队列" value={overview?.waitingQueue ?? 0} /></Col>
          <Col xs={12} md={8} lg={4}><Statistic title="在线坐席" value={overview?.onlineAgents ?? 0} /></Col>
          <Col xs={12} md={8} lg={4}><Statistic title="AI 处理中" value={overview?.aiProcessing ?? 0} /></Col>
          <Col xs={12} md={8} lg={4}><Statistic title="今日会话" value={overview?.todayConversations ?? 0} /></Col>
          <Col xs={12} md={8} lg={4}><Statistic title="SLA 违约(未处理)" value={overview?.slaBreaches ?? 0} /></Col>
          <Col xs={12} md={8} lg={4}><Statistic title="今日 CSAT" value={overview?.avgCsatToday ?? 0} precision={2} suffix="★" /></Col>
        </Row>
      </Card>

	      <Card title="筛选">
	        <Space wrap>
          <Select
            allowClear
            placeholder="部门"
            style={{ width: 180 }}
            value={departmentFilter}
            onChange={(value) => {
              setDepartmentFilter(value);
              setTeamFilter(undefined);
              setPage(1);
            }}
            options={departments.map((item) => ({ value: item.departmentId, label: item.name }))}
          />
          <Select
            allowClear
            placeholder="团队"
            style={{ width: 180 }}
            value={teamFilter}
            onChange={(value) => {
              setTeamFilter(value);
              setPage(1);
            }}
            options={teams.map((item) => ({ value: item.teamId, label: item.name }))}
          />
	          <Select
	            allowClear
	            showSearch
            placeholder="坐席"
            style={{ width: 200 }}
            value={agentFilter}
            onChange={(value) => {
              setAgentFilter(value);
              setPage(1);
            }}
	            options={agents.map((item) => ({ value: item.agentId, label: item.displayName }))}
	          />
	          <Select
	            style={{ width: 180 }}
	            value={scopeFilter}
	            onChange={(value) => {
	              setScopeFilter(value);
	              setPage(1);
	            }}
	            options={[
	              { value: "all", label: "全部会话" },
	              { value: "waiting", label: "等待中" },
	              { value: "exception", label: "异常会话" },
	              { value: "active", label: "处理中" },
	              { value: "resolved", label: "已结束" }
	            ]}
	          />
	          <Button onClick={() => void load()} loading={loading}>应用筛选</Button>
	        </Space>
	      </Card>

	      <Card title="会话工作台">
	        <Table<SupervisorConversationWorkbenchItem>
	          rowKey="conversationId"
	          loading={loading}
	          columns={conversationColumns}
	          dataSource={conversations?.items ?? []}
	          pagination={{
	            current: conversations?.page ?? 1,
	            pageSize: conversations?.pageSize ?? 20,
	            total: conversations?.total ?? 0,
	            onChange: (nextPage) => setPage(nextPage)
	          }}
	        />
	      </Card>

      <Card title="坐席状态">
        <Table<SupervisorAgentStatus>
          rowKey="agentId"
          loading={loading}
          columns={agentColumns}
          dataSource={agents}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="主管介入"
        open={interveneOpen}
        onCancel={() => {
          setInterveneOpen(false);
          setSelectedConversation(null);
        }}
        onOk={() => {
          void (async () => {
            if (!selectedConversationId || !interveneText.trim()) {
              message.warning("请输入介入消息");
              return;
            }
            setSaving(true);
            try {
              await interveneConversation(selectedConversationId, interveneText.trim());
              message.success("介入消息已入队");
              setInterveneOpen(false);
              setSelectedConversation(null);
            } catch (err) {
              message.error(`介入失败: ${(err as Error).message}`);
            } finally {
              setSaving(false);
            }
          })();
        }}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
      >
        <Typography.Text type="secondary">会话：{selectedConversationId}</Typography.Text>
        <Input.TextArea rows={4} value={interveneText} onChange={(e) => setInterveneText(e.target.value)} />
      </Modal>

      <Modal
        title="转接会话"
        open={transferOpen}
        onCancel={() => {
          setTransferOpen(false);
          setSelectedConversation(null);
        }}
        onOk={() => {
          void (async () => {
            if (!selectedConversationId || !transferAgentId) {
              message.warning("请选择目标坐席");
              return;
            }
            setSaving(true);
            try {
              await transferConversation(selectedConversationId, transferAgentId);
              message.success("转接成功");
              setTransferOpen(false);
              setSelectedConversation(null);
              await load();
            } catch (err) {
              message.error(`转接失败: ${(err as Error).message}`);
            } finally {
              setSaving(false);
            }
          })();
        }}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
      >
        <Select
          showSearch
          style={{ width: "100%" }}
          placeholder="选择目标坐席"
          value={transferAgentId || undefined}
          onChange={(value) => setTransferAgentId(value)}
          options={transferAgentOptions}
        />
      </Modal>

      <Modal
        title="广播通知"
        open={broadcastOpen}
        onCancel={() => setBroadcastOpen(false)}
        onOk={() => {
          void (async () => {
            if (!broadcastText.trim()) {
              message.warning("请输入广播内容");
              return;
            }
            setSaving(true);
            try {
              const res = await broadcastToOnlineAgents(broadcastText.trim());
              message.success(`广播已发送，覆盖 ${res.recipients} 位在线坐席`);
              setBroadcastOpen(false);
            } catch (err) {
              message.error(`广播失败: ${(err as Error).message}`);
            } finally {
              setSaving(false);
            }
          })();
        }}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
      >
        <Input.TextArea rows={4} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} />
      </Modal>
    </Space>
  );
}
