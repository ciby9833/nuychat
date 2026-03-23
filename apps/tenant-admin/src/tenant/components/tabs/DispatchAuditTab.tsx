// 用于调度审计，展示 AI 和人工调度的执行记录详情，帮助运营分析和优化调度规则
// 菜单路径：客户中心 -> 调度审计
// 作者：吴川
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Descriptions, Drawer, Input, Select, Space, Table, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getDispatchExecutionDetail, listDispatchExecutions, listDispatchOpsSuggestions } from "../../api";
import type { DispatchExecutionDetail, DispatchExecutionListItem, DispatchOpsSuggestion, DispatchOpsSuggestionGroup } from "../../types";

const TRIGGER_OPTIONS = [
  { value: "inbound_message", label: "入站消息" },
  { value: "ai_routing", label: "AI 路由" },
  { value: "agent_assign", label: "人工接管" },
  { value: "agent_handoff", label: "人工转队列" },
  { value: "agent_transfer", label: "人工转人工" },
  { value: "supervisor_transfer", label: "主管转移" },
  { value: "conversation_resolve", label: "会话解决" }
];

const DATE_PRESET_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last7d", label: "最近 7 天" },
  { value: "custom", label: "自定义" }
] as const;

type DatePreset = (typeof DATE_PRESET_OPTIONS)[number]["value"];
type RangeValue = [Dayjs | null, Dayjs | null] | null;

function renderSummary(summary: Record<string, unknown>) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return <Typography.Text type="secondary">无</Typography.Text>;
  return (
    <Space direction="vertical" size={4}>
      {entries.map(([key, value]) => (
        <Typography.Text key={key} style={{ fontSize: 12 }}>
          <b>{key}</b>: {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </Typography.Text>
      ))}
    </Space>
  );
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function renderCandidateDetails(details: Record<string, unknown>) {
  const todayNewCaseCount = readNumber(details.todayNewCaseCount);
  const activeAssignments = readNumber(details.activeAssignments);
  const reservedAssignments = readNumber(details.reservedAssignments);
  const hasBalancedNewCaseMetrics =
    todayNewCaseCount !== null &&
    activeAssignments !== null &&
    reservedAssignments !== null;

  if (!hasBalancedNewCaseMetrics) {
    return renderSummary(details);
  }

  const score = (4 * todayNewCaseCount) + (2 * activeAssignments) + reservedAssignments;

  return (
    <Space direction="vertical" size={4}>
      <Space wrap>
        <Tag color="blue">score: {score}</Tag>
        <Tag>todayNewCaseCount: {todayNewCaseCount}</Tag>
        <Tag>activeAssignments: {activeAssignments}</Tag>
        <Tag>reservedAssignments: {reservedAssignments}</Tag>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        `balanced_new_case = 4 * 今日新事项 + 2 * 当前接待中 + 1 * 已保留`
      </Typography.Text>
      {renderSummary(details)}
    </Space>
  );
}

export function DispatchAuditTab() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DispatchExecutionListItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [triggerType, setTriggerType] = useState<string | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<RangeValue>([dayjs(), dayjs()]);
  const [selected, setSelected] = useState<DispatchExecutionDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DispatchOpsSuggestionGroup>({
    aiAgents: [],
    teams: [],
    customerSegments: []
  });

  const range = useMemo(() => {
    if (datePreset === "custom") {
      return {
        from: customRange?.[0]?.format("YYYY-MM-DD"),
        to: customRange?.[1]?.format("YYYY-MM-DD")
      };
    }

    const today = dayjs();
    if (datePreset === "yesterday") {
      const yesterday = today.subtract(1, "day").format("YYYY-MM-DD");
      return { from: yesterday, to: yesterday };
    }
    if (datePreset === "last7d") {
      return {
        from: today.subtract(6, "day").format("YYYY-MM-DD"),
        to: today.format("YYYY-MM-DD")
      };
    }
    const current = today.format("YYYY-MM-DD");
    return { from: current, to: current };
  }, [customRange, datePreset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, suggestionData] = await Promise.all([
        listDispatchExecutions({
          caseId: caseId.trim() || undefined,
          conversationId: conversationId.trim() || undefined,
          triggerType,
          from: range.from,
          to: range.to
        }),
        listDispatchOpsSuggestions({
          from: range.from,
          to: range.to
        })
      ]);
      setItems(data.items);
      setSuggestions(suggestionData.groups);
    } finally {
      setLoading(false);
    }
  }, [caseId, conversationId, triggerType, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (executionId: string) => {
    setDetailLoading(true);
    setDrawerOpen(true);
    try {
      const data = await getDispatchExecutionDetail(executionId);
      setSelected(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    ai: items.filter((item) => item.decisionType === "ai_selection").length,
    manual: items.filter((item) => item.decisionType === "manual_transition").length
  }), [items]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="调度依据">
        <Space wrap>
          <Tag color="blue">{stats.total} 条执行记录</Tag>
          <Tag color="purple">{stats.ai} 条 AI 选择</Tag>
          <Tag color="green">{stats.manual} 条人工变更</Tag>
          <Input
            allowClear
            placeholder="按事项 ID 过滤"
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            style={{ width: 220 }}
          />
          <Input
            allowClear
            placeholder="按会话 ID 过滤"
            value={conversationId}
            onChange={(event) => setConversationId(event.target.value)}
            style={{ width: 240 }}
          />
          <Select
            allowClear
            placeholder="触发类型"
            value={triggerType}
            onChange={setTriggerType}
            options={TRIGGER_OPTIONS}
            style={{ width: 180 }}
          />
          <Select
            value={datePreset}
            onChange={(value) => setDatePreset(value)}
            options={DATE_PRESET_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            style={{ width: 140 }}
          />
          {datePreset === "custom" ? (
            <DatePicker.RangePicker
              value={customRange}
              onChange={(values) => setCustomRange(values)}
              allowEmpty={[false, false]}
            />
          ) : null}
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          用于查看每个事项为什么被分配到 AI 或人工，以及后续每次转移的依据。
        </Typography.Paragraph>
      </Card>

      <Card title="调度运营建议">
        {suggestions.aiAgents.length === 0 && suggestions.teams.length === 0 && suggestions.customerSegments.length === 0 ? (
          <Typography.Text type="secondary">当前时间范围内暂无明显建议。</Typography.Text>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <SuggestionGroup title="按 AI 座席" items={suggestions.aiAgents} />
            <SuggestionGroup title="按团队" items={suggestions.teams} />
            <SuggestionGroup title="按客户等级 / 渠道" items={suggestions.customerSegments} />
          </Space>
        )}
      </Card>

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
              <Button size="small" onClick={() => void openDetail(row.executionId)}>
                查看
              </Button>
            )
          }
        ]}
      />

      <Drawer
        title="调度执行详情"
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelected(null);
        }}
        width={760}
        destroyOnClose
        loading={detailLoading}
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
    </Space>
  );
}

function SuggestionGroup({ title, items }: { title: string; items: DispatchOpsSuggestion[] }) {
  if (items.length === 0) {
    return (
      <Card size="small" title={title}>
        <Typography.Text type="secondary">当前时间范围内暂无明显建议。</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" title={title}>
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        {items.map((item) => (
          <Card
            key={item.key}
            size="small"
            styles={{ body: { padding: 12 } }}
            title={(
              <Space>
                <Tag color={item.severity === "high" ? "red" : item.severity === "medium" ? "orange" : "blue"}>
                  {item.severity === "high" ? "高" : item.severity === "medium" ? "中" : "低"}
                </Tag>
                <span>{item.title}</span>
              </Space>
            )}
          >
            <Typography.Paragraph style={{ marginBottom: 8 }}>{item.summary}</Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              建议：{item.recommendation}
            </Typography.Paragraph>
            <Space wrap>
              {Object.entries(item.metrics).map(([key, value]) => (
                <Tag key={key}>{key}: {String(value)}</Tag>
              ))}
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}
