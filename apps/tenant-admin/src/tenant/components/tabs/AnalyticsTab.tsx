// 用于日报分析，展示每天的事件统计数据，帮助运营了解系统使用情况和客户行为
// 菜单路径：客户中心 -> 日报分析
// 作者：吴川
import { CalendarOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Row, Statistic, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";

import { getTenantAnalyticsDailyReport } from "../../api";
import type { DailyReport, DailyReportRow } from "../../types";

const { Title } = Typography;

const EVENT_TYPE_LABELS: Record<string, string> = {
  conversation_started: "会话开始",
  message_received: "消息接收",
  message_sent: "消息发送",
  skill_executed: "技能执行",
  conversation_resolved: "线程结束"
};

export function AnalyticsTab() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await getTenantAnalyticsDailyReport(targetDate);
      setReport(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [load, date]);

  const summary = report?.summary;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <CalendarOutlined style={{ fontSize: 18 }} />
        <Title level={4} style={{ margin: 0 }}>日报分析</Title>
        <DatePicker
          value={dayjs(date)}
          onChange={(d) => { if (d) setDate(d.format("YYYY-MM-DD")); }}
          allowClear={false}
          style={{ marginLeft: 12 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => { void load(date); }} loading={loading}>
          刷新
        </Button>
        {error && <Tag color="red">{error}</Tag>}
      </div>

      {/* Summary stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="总事件数" value={summary?.totalEvents ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="涉及事项数" value={summary?.distinctCasesTouched ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="会话开始" value={summary?.conversationsStarted ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="消息接收" value={summary?.messagesReceived ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="消息发送" value={summary?.messagesSent ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="技能执行" value={summary?.skillsExecuted ?? 0} loading={loading} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Card size="small"><Statistic title="线程结束" value={summary?.conversationsResolved ?? 0} loading={loading} /></Card>
        </Col>
      </Row>

      {/* Event breakdown table */}
      <Card title={`事件明细 — ${date}`}>
        {!error && report?.events.length === 0 && !loading && (
          <Typography.Text type="secondary" style={{ display: "block", textAlign: "center", padding: "24px 0" }}>
            当日暂无事件数据（ClickHouse 未接收到数据或服务未启动）
          </Typography.Text>
        )}
        <Table<DailyReportRow>
          rowKey="eventType"
          loading={loading}
          dataSource={report?.events ?? []}
          pagination={false}
          columns={[
            {
              title: "事件类型",
              dataIndex: "eventType",
              render: (v: string) => (
                <Tag color="blue">{EVENT_TYPE_LABELS[v] ?? v}</Tag>
              )
            },
            {
              title: "原始类型",
              dataIndex: "eventType",
              render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>
            },
            {
              title: "事件数量",
              dataIndex: "count",
              align: "right",
              render: (v: number) => <strong>{Number(v).toLocaleString()}</strong>
            }
          ]}
        />
      </Card>
    </div>
  );
}
