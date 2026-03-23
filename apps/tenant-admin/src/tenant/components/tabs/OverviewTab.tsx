// 用于系统概览，展示会话总数、知识库条目数、坐席数量等关键指标，以及会话状态分布的统计图表
// 菜单路径：客户中心 -> 系统概览
// 作者：吴川
import { Card, Col, Row, Statistic, Table, Tag } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../api";
import type { OverviewData } from "../../types";

type StatusRow = { status: string; count: number };

export function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<OverviewData>("/api/admin/overview"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusRows = useMemo<StatusRow[]>(() => {
    if (!data) return [];
    return Object.entries(data.conversations.byStatus).map(([status, count]) => ({ status, count }));
  }, [data]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}><Card><Statistic title="总会话数" value={data?.conversations.total ?? 0} /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="知识库条目" value={data?.knowledgeBase.activeEntries ?? 0} /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="坐席数量" value={data?.agents.total ?? 0} /></Card></Col>
      <Col span={24}>
        <Card title="会话状态分布" extra={error ? <Tag color="red">{error}</Tag> : null}>
          <Table<StatusRow>
            rowKey="status"
            loading={!data && !error}
            dataSource={statusRows}
            pagination={false}
            columns={[
              { title: "Status", dataIndex: "status", render: (value) => <Tag>{String(value)}</Tag> },
              { title: "Count", dataIndex: "count" }
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}
