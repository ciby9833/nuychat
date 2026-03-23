// 用于 CSAT 满意度调查管理，包含调查任务的查询和状态更新，以及调查结果的查询和分析功能
// 菜单路径：客户中心 -> 满意度调查
// 作者：吴川
import { Button, Card, DatePicker, InputNumber, Select, Space, Statistic, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAgents, listCsatResponses, listCsatSurveys, patchCsatSurveyStatus } from "../../api";
import type { AgentProfile, CsatResponseItem, CsatSurveyItem } from "../../types";

type SurveyFilter = {
  status?: "scheduled" | "sent" | "responded" | "expired" | "failed";
  from?: string;
  to?: string;
};

type ResponseFilter = {
  agentId?: string;
  minRating?: number;
  maxRating?: number;
  from?: string;
  to?: string;
};

export function CsatTab() {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [surveyFilter, setSurveyFilter] = useState<SurveyFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [surveys, setSurveys] = useState<{
    page: number;
    pageSize: number;
    total: number;
    summary: { total: number; scheduled: number; sent: number; responded: number; expired: number; failed: number };
    items: CsatSurveyItem[];
  } | null>(null);
  const [responses, setResponses] = useState<{
    page: number;
    pageSize: number;
    total: number;
    summary: { total: number; averageRating: number };
    items: CsatResponseItem[];
  } | null>(null);

  const load = useCallback(async (nextSurveyFilter: SurveyFilter = surveyFilter, nextResponseFilter: ResponseFilter = responseFilter) => {
    setLoading(true);
    try {
      const [surveyData, responseData, agentList] = await Promise.all([
        listCsatSurveys({ ...nextSurveyFilter, page: 1, pageSize: 20 }),
        listCsatResponses({ ...nextResponseFilter, page: 1, pageSize: 20 }),
        listAgents()
      ]);
      setSurveys(surveyData);
      setResponses(responseData);
      setAgents(agentList);
    } catch (err) {
      message.error(`加载 CSAT 数据失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [surveyFilter, responseFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = surveys?.summary ?? { total: 0, scheduled: 0, sent: 0, responded: 0, expired: 0, failed: 0 };
  const averageRating = Number((responses?.summary.averageRating ?? 0).toFixed(2));

  const onMarkSent = async (row: CsatSurveyItem) => {
    try {
      await patchCsatSurveyStatus(row.surveyId, "sent");
      await load();
    } catch (err) {
      message.error(`更新状态失败: ${(err as Error).message}`);
    }
  };

  const surveyColumns = useMemo(
    () => [
      { title: "计划发送", dataIndex: "scheduledAt", render: (v: string) => dayjs(v).format("MM-DD HH:mm") },
      { title: "客户", dataIndex: "customerName", render: (v: string | null, r: CsatSurveyItem) => v ?? r.customerRef ?? "-" },
      { title: "坐席", dataIndex: "agentName", render: (v: string | null) => v ?? "-" },
      { title: "事项ID", dataIndex: "caseId", ellipsis: true, render: (v: string | null) => v ?? "-" },
      { title: "会话ID", dataIndex: "conversationId", ellipsis: true },
      { title: "渠道", dataIndex: "channelType", render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
      {
        title: "状态",
        dataIndex: "status",
        render: (v: CsatSurveyItem["status"]) => {
          const colorMap: Record<CsatSurveyItem["status"], string> = {
            scheduled: "gold",
            sent: "blue",
            responded: "green",
            expired: "default",
            failed: "red"
          };
          return <Tag color={colorMap[v]}>{v.toUpperCase()}</Tag>;
        }
      },
      {
        title: "操作",
        render: (_: unknown, row: CsatSurveyItem) => (
          <Button size="small" disabled={row.status !== "scheduled"} onClick={() => void onMarkSent(row)}>
            标记已发送
          </Button>
        )
      }
    ],
    []
  );

  const responseColumns = useMemo(
    () => [
      { title: "回复时间", dataIndex: "respondedAt", render: (v: string) => dayjs(v).format("MM-DD HH:mm") },
      { title: "客户", dataIndex: "customerName", render: (v: string | null, r: CsatResponseItem) => v ?? r.customerRef ?? "-" },
      { title: "坐席", dataIndex: "agentName", render: (v: string | null) => v ?? "-" },
      { title: "事项ID", dataIndex: "caseId", ellipsis: true, render: (v: string | null) => v ?? "-" },
      { title: "会话ID", dataIndex: "conversationId", ellipsis: true },
      {
        title: "评分",
        dataIndex: "rating",
        render: (v: number) => <Tag color={v <= 2 ? "red" : v === 3 ? "gold" : "green"}>{v} ★</Tag>
      },
      { title: "反馈", dataIndex: "feedback", render: (v: string | null) => v || "-" }
    ],
    []
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space size={24} wrap>
          <Statistic title="调查总数" value={summary.total} />
          <Statistic title="已响应" value={summary.responded} />
          <Statistic title="待发送" value={summary.scheduled} />
          <Statistic title="平均满意度" value={averageRating} suffix="★" precision={2} />
        </Space>
      </Card>

      <Card
        title="调查任务查询"
        extra={
          <Space>
            <Button onClick={() => void load(surveyFilter, responseFilter)}>刷新</Button>
          </Space>
        }
      >
        <Space wrap>
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="调查状态"
            value={surveyFilter.status}
            onChange={(value) => setSurveyFilter((prev) => ({ ...prev, status: value }))}
            options={[
              { value: "scheduled", label: "待发送" },
              { value: "sent", label: "已发送" },
              { value: "responded", label: "已响应" },
              { value: "expired", label: "已过期" },
              { value: "failed", label: "发送失败" }
            ]}
          />
          <DatePicker
            value={surveyFilter.from ? dayjs(surveyFilter.from) : null}
            onChange={(v) => setSurveyFilter((prev) => ({ ...prev, from: v ? v.format("YYYY-MM-DD") : undefined }))}
          />
          <DatePicker
            value={surveyFilter.to ? dayjs(surveyFilter.to) : null}
            onChange={(v) => setSurveyFilter((prev) => ({ ...prev, to: v ? v.format("YYYY-MM-DD") : undefined }))}
          />
          <Button type="primary" onClick={() => void load(surveyFilter, responseFilter)} loading={loading}>查询</Button>
        </Space>
      </Card>

      <Card title="CSAT 调查列表">
        <Table<CsatSurveyItem>
          rowKey="surveyId"
          loading={loading}
          dataSource={surveys?.items ?? []}
          columns={surveyColumns}
          pagination={{
            current: surveys?.page ?? 1,
            pageSize: surveys?.pageSize ?? 20,
            total: surveys?.total ?? 0,
            onChange: (page, pageSize) => {
              void (async () => {
                setLoading(true);
                try {
                  const data = await listCsatSurveys({ ...surveyFilter, page, pageSize });
                  setSurveys(data);
                } finally {
                  setLoading(false);
                }
              })();
            }
          }}
        />
      </Card>

      <Card title="满意度结果查询">
        <Space wrap>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="按坐席筛选"
            value={responseFilter.agentId}
            onChange={(value) => setResponseFilter((prev) => ({ ...prev, agentId: value }))}
            options={agents.map((a) => ({ value: a.agentId, label: `${a.displayName} (${a.email})` }))}
          />
          <InputNumber
            min={1}
            max={5}
            style={{ width: 120 }}
            placeholder="最低评分"
            value={responseFilter.minRating}
            onChange={(v) => setResponseFilter((prev) => ({ ...prev, minRating: typeof v === "number" ? v : undefined }))}
          />
          <InputNumber
            min={1}
            max={5}
            style={{ width: 120 }}
            placeholder="最高评分"
            value={responseFilter.maxRating}
            onChange={(v) => setResponseFilter((prev) => ({ ...prev, maxRating: typeof v === "number" ? v : undefined }))}
          />
          <DatePicker
            value={responseFilter.from ? dayjs(responseFilter.from) : null}
            onChange={(v) => setResponseFilter((prev) => ({ ...prev, from: v ? v.format("YYYY-MM-DD") : undefined }))}
          />
          <DatePicker
            value={responseFilter.to ? dayjs(responseFilter.to) : null}
            onChange={(v) => setResponseFilter((prev) => ({ ...prev, to: v ? v.format("YYYY-MM-DD") : undefined }))}
          />
          <Button type="primary" onClick={() => void load(surveyFilter, responseFilter)} loading={loading}>查询</Button>
        </Space>
      </Card>

      <Card title="CSAT 结果列表">
        <Table<CsatResponseItem>
          rowKey="responseId"
          loading={loading}
          dataSource={responses?.items ?? []}
          columns={responseColumns}
          pagination={{
            current: responses?.page ?? 1,
            pageSize: responses?.pageSize ?? 20,
            total: responses?.total ?? 0,
            onChange: (page, pageSize) => {
              void (async () => {
                setLoading(true);
                try {
                  const data = await listCsatResponses({ ...responseFilter, page, pageSize });
                  setResponses(data);
                } finally {
                  setLoading(false);
                }
              })();
            }
          }}
        />
      </Card>
      <Typography.Text type="secondary">
        调查在会话解决后自动创建，默认延迟 10 分钟进入待发送。
      </Typography.Text>
    </Space>
  );
}
