import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  message
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createMemoryEvalDataset,
  getMemoryEncoderTraceDetail,
  getMemoryEvalReportDetail,
  listMemoryEncoderTraces,
  listMemoryEvalDatasets,
  listMemoryEvalReports,
  runMemoryEvalDataset
} from "../../api";
import type {
  MemoryEncoderTraceDetail,
  MemoryEncoderTraceListItem,
  MemoryEvalDatasetItem,
  MemoryEvalReportDetail,
  MemoryEvalReportItem
} from "../../types";

type TraceFilters = {
  conversationId: string;
  customerId: string;
  sourceKind?: string;
  status?: string;
};

function metricNumber(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function MemoryQaTab() {
  const [loading, setLoading] = useState(false);
  const [traceSummary, setTraceSummary] = useState({ recent7dCount: 0 });
  const [traces, setTraces] = useState<MemoryEncoderTraceListItem[]>([]);
  const [traceFilters, setTraceFilters] = useState<TraceFilters>({
    conversationId: "",
    customerId: ""
  });
  const [traceDetail, setTraceDetail] = useState<MemoryEncoderTraceDetail | null>(null);
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [datasets, setDatasets] = useState<MemoryEvalDatasetItem[]>([]);
  const [reports, setReports] = useState<MemoryEvalReportItem[]>([]);
  const [reportDetail, setReportDetail] = useState<MemoryEvalReportDetail | null>(null);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [datasetModalOpen, setDatasetModalOpen] = useState(false);
  const [creatingDataset, setCreatingDataset] = useState(false);
  const [runningDatasetId, setRunningDatasetId] = useState<string | null>(null);
  const [datasetForm] = Form.useForm<{ name: string; description?: string; payload: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [traceData, datasetData, reportData] = await Promise.all([
        listMemoryEncoderTraces({
          conversationId: traceFilters.conversationId.trim() || undefined,
          customerId: traceFilters.customerId.trim() || undefined,
          sourceKind: traceFilters.sourceKind,
          status: traceFilters.status,
          limit: 50
        }),
        listMemoryEvalDatasets(),
        listMemoryEvalReports()
      ]);
      setTraceSummary(traceData.summary);
      setTraces(traceData.items);
      setDatasets(datasetData.items);
      setReports(reportData.items);
    } finally {
      setLoading(false);
    }
  }, [traceFilters.conversationId, traceFilters.customerId, traceFilters.sourceKind, traceFilters.status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTrace = useCallback(async (traceId: string) => {
    const detail = await getMemoryEncoderTraceDetail(traceId);
    setTraceDetail(detail);
    setTraceDrawerOpen(true);
  }, []);

  const openReport = useCallback(async (reportId: string) => {
    const detail = await getMemoryEvalReportDetail(reportId);
    setReportDetail(detail);
    setReportDrawerOpen(true);
  }, []);

  const handleCreateDataset = useCallback(async () => {
    const values = await datasetForm.validateFields();
    let rows: unknown;
    try {
      rows = JSON.parse(values.payload);
    } catch {
      message.error("数据集 JSON 格式不正确");
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      message.error("数据集必须是非空 JSON 数组");
      return;
    }

    setCreatingDataset(true);
    try {
      await createMemoryEvalDataset({
        name: values.name.trim(),
        description: values.description?.trim() || null,
        rows: rows as never[]
      });
      message.success("评测数据集已创建");
      setDatasetModalOpen(false);
      datasetForm.resetFields();
      await load();
    } finally {
      setCreatingDataset(false);
    }
  }, [datasetForm, load]);

  const handleRunDataset = useCallback(async (datasetId: string) => {
    setRunningDatasetId(datasetId);
    try {
      await runMemoryEvalDataset(datasetId);
      message.success("评测已完成");
      await load();
    } finally {
      setRunningDatasetId(null);
    }
  }, [load]);

  const avgPrecision = useMemo(() => {
    if (reports.length === 0) return 0;
    return reports.reduce((sum, report) => sum + metricNumber(report.metrics, "precision"), 0) / reports.length;
  }, [reports]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space size="middle" wrap>
        <Card><Statistic title="近 7 天 Trace" value={traceSummary.recent7dCount} /></Card>
        <Card><Statistic title="评测数据集" value={datasets.length} /></Card>
        <Card><Statistic title="评测报告" value={reports.length} /></Card>
        <Card><Statistic title="平均 Precision" value={avgPrecision} precision={3} /></Card>
      </Space>

      <Tabs
        items={[
          {
            key: "traces",
            label: "Encoder Traces",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card>
                  <Space wrap>
                    <Input
                      placeholder="按 conversationId 过滤"
                      value={traceFilters.conversationId}
                      onChange={(e) => setTraceFilters((prev) => ({ ...prev, conversationId: e.target.value }))}
                      style={{ width: 220 }}
                    />
                    <Input
                      placeholder="按 customerId 过滤"
                      value={traceFilters.customerId}
                      onChange={(e) => setTraceFilters((prev) => ({ ...prev, customerId: e.target.value }))}
                      style={{ width: 220 }}
                    />
                    <Select
                      allowClear
                      placeholder="source kind"
                      value={traceFilters.sourceKind}
                      onChange={(value) => setTraceFilters((prev) => ({ ...prev, sourceKind: value }))}
                      style={{ width: 160 }}
                      options={[
                        { label: "conversation", value: "conversation" },
                        { label: "task", value: "task" }
                      ]}
                    />
                    <Select
                      allowClear
                      placeholder="status"
                      value={traceFilters.status}
                      onChange={(value) => setTraceFilters((prev) => ({ ...prev, status: value }))}
                      style={{ width: 160 }}
                      options={[
                        { label: "completed", value: "completed" },
                        { label: "skipped", value: "skipped" }
                      ]}
                    />
                    <Button onClick={() => { void load(); }} loading={loading}>刷新</Button>
                  </Space>
                </Card>

                <Card>
                  <Table
                    rowKey="traceId"
                    loading={loading}
                    dataSource={traces}
                    pagination={{ pageSize: 12 }}
                    columns={[
                      { title: "时间", dataIndex: "createdAt", width: 180 },
                      { title: "Source", dataIndex: "sourceKind", width: 120 },
                      { title: "状态", dataIndex: "status", width: 120 },
                      { title: "Conversation", dataIndex: "conversationId", ellipsis: true },
                      {
                        title: "Final",
                        width: 100,
                        render: (_, row) => metricNumber(row.metrics, "finalCount")
                      },
                      {
                        title: "Candidate",
                        width: 100,
                        render: (_, row) => metricNumber(row.metrics, "candidateCount")
                      },
                      {
                        title: "操作",
                        width: 100,
                        render: (_, row) => <Button size="small" onClick={() => { void openTrace(row.traceId); }}>详情</Button>
                      }
                    ]}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "eval",
            label: "Evaluation",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card
                  title="评测数据集"
                  extra={<Button type="primary" onClick={() => setDatasetModalOpen(true)}>新建数据集</Button>}
                >
                  <Table
                    rowKey="datasetId"
                    dataSource={datasets}
                    pagination={false}
                    columns={[
                      { title: "名称", dataIndex: "name" },
                      { title: "样本数", dataIndex: "sampleCount", width: 100 },
                      { title: "更新时间", dataIndex: "updatedAt", width: 180 },
                      {
                        title: "操作",
                        width: 120,
                        render: (_, row) => (
                          <Button
                            size="small"
                            loading={runningDatasetId === row.datasetId}
                            onClick={() => { void handleRunDataset(row.datasetId); }}
                          >
                            运行评测
                          </Button>
                        )
                      }
                    ]}
                  />
                </Card>

                <Card title="评测报告">
                  <Table
                    rowKey="reportId"
                    dataSource={reports}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: "名称", dataIndex: "name" },
                      { title: "数据集", dataIndex: "datasetName" },
                      {
                        title: "Precision",
                        width: 120,
                        render: (_, row) => metricNumber(row.metrics, "precision").toFixed(3)
                      },
                      {
                        title: "Duplicate Rate",
                        width: 140,
                        render: (_, row) => metricNumber(row.metrics, "duplicateRate").toFixed(3)
                      },
                      {
                        title: "Stale Rate",
                        width: 120,
                        render: (_, row) => metricNumber(row.metrics, "staleMemoryRate").toFixed(3)
                      },
                      { title: "创建时间", dataIndex: "createdAt", width: 180 },
                      {
                        title: "操作",
                        width: 100,
                        render: (_, row) => <Button size="small" onClick={() => { void openReport(row.reportId); }}>详情</Button>
                      }
                    ]}
                  />
                </Card>
              </Space>
            )
          }
        ]}
      />

      <Drawer
        width={880}
        title="Memory Encoder Trace"
        open={traceDrawerOpen}
        onClose={() => setTraceDrawerOpen(false)}
      >
        {traceDetail ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Trace ID">{traceDetail.traceId}</Descriptions.Item>
              <Descriptions.Item label="Source">{traceDetail.sourceKind}</Descriptions.Item>
              <Descriptions.Item label="Conversation">{traceDetail.conversationId || "-"}</Descriptions.Item>
              <Descriptions.Item label="Status">{traceDetail.status}</Descriptions.Item>
            </Descriptions>
            <Card title="Metrics"><pre>{JSON.stringify(traceDetail.metrics, null, 2)}</pre></Card>
            <Card title="Input Context"><pre>{JSON.stringify(traceDetail.inputContext, null, 2)}</pre></Card>
            <Card title="Event Frame"><pre>{JSON.stringify(traceDetail.eventFrame, null, 2)}</pre></Card>
            <Card title="Candidate Items"><pre>{JSON.stringify(traceDetail.candidateItems, null, 2)}</pre></Card>
            <Card title="Reviewed Items"><pre>{JSON.stringify(traceDetail.reviewedItems, null, 2)}</pre></Card>
            <Card title="Final Items"><pre>{JSON.stringify(traceDetail.finalItems, null, 2)}</pre></Card>
          </Space>
        ) : null}
      </Drawer>

      <Drawer
        width={920}
        title="Memory Eval Report"
        open={reportDrawerOpen}
        onClose={() => setReportDrawerOpen(false)}
      >
        {reportDetail ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Report">{reportDetail.name}</Descriptions.Item>
              <Descriptions.Item label="Samples">{reportDetail.sampleCount}</Descriptions.Item>
              <Descriptions.Item label="Precision">{metricNumber(reportDetail.metrics, "precision").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="Duplicate Rate">{metricNumber(reportDetail.metrics, "duplicateRate").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="Stale Rate">{metricNumber(reportDetail.metrics, "staleMemoryRate").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="Created">{reportDetail.createdAt}</Descriptions.Item>
            </Descriptions>
            <Card title="Report JSON"><pre>{JSON.stringify(reportDetail.report, null, 2)}</pre></Card>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={datasetModalOpen}
        title="新建评测数据集"
        onCancel={() => setDatasetModalOpen(false)}
        onOk={() => { void handleCreateDataset(); }}
        confirmLoading={creatingDataset}
        width={860}
      >
        <Form layout="vertical" form={datasetForm}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="例如：March Memory QA Batch" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="payload"
            label="数据集 JSON"
            extra={<Typography.Text type="secondary">粘贴 `memory:eval:export` 导出的 JSON 数组，并补完 gold memories。</Typography.Text>}
            rules={[{ required: true, message: "请输入 JSON 数据集" }]}
          >
            <Input.TextArea rows={16} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
