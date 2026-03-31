/**
 * 菜单路径与名称: 客户中心 -> Memory QA
 * 文件职责: 管理记忆编码 Trace 查询、评测数据集创建、评测执行与评测报告查看。
 * 主要交互文件:
 * - ../../api
 * - ../../types
 * - ../../../i18n/locales/en/modules/memory-qa.ts
 * - ../../../i18n/locales/zh/modules/memory-qa.ts
 * - ../../../i18n/locales/id/modules/memory-qa.ts
 */

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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      message.error(t("memoryQa.datasets.invalidJson"));
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      message.error(t("memoryQa.datasets.invalidRows"));
      return;
    }

    setCreatingDataset(true);
    try {
      await createMemoryEvalDataset({
        name: values.name.trim(),
        description: values.description?.trim() || null,
        rows: rows as never[]
      });
      message.success(t("memoryQa.datasets.created"));
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
      message.success(t("memoryQa.reports.runCompleted"));
      await load();
    } finally {
      setRunningDatasetId(null);
    }
  }, [load, t]);

  const avgPrecision = useMemo(() => {
    if (reports.length === 0) return 0;
    return reports.reduce((sum, report) => sum + metricNumber(report.metrics, "precision"), 0) / reports.length;
  }, [reports]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space size="middle" wrap>
        <Card><Statistic title={t("memoryQa.stats.recentTrace")} value={traceSummary.recent7dCount} /></Card>
        <Card><Statistic title={t("memoryQa.stats.datasets")} value={datasets.length} /></Card>
        <Card><Statistic title={t("memoryQa.stats.reports")} value={reports.length} /></Card>
        <Card><Statistic title={t("memoryQa.stats.avgPrecision")} value={avgPrecision} precision={3} /></Card>
      </Space>

      <Tabs
        items={[
          {
            key: "traces",
            label: t("memoryQa.tabs.traces"),
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card>
                  <Space wrap>
                    <Input
                      placeholder={t("memoryQa.filters.conversationId")}
                      value={traceFilters.conversationId}
                      onChange={(e) => setTraceFilters((prev) => ({ ...prev, conversationId: e.target.value }))}
                      style={{ width: 220 }}
                    />
                    <Input
                      placeholder={t("memoryQa.filters.customerId")}
                      value={traceFilters.customerId}
                      onChange={(e) => setTraceFilters((prev) => ({ ...prev, customerId: e.target.value }))}
                      style={{ width: 220 }}
                    />
                    <Select
                      allowClear
                      placeholder={t("memoryQa.filters.sourceKind")}
                      value={traceFilters.sourceKind}
                      onChange={(value) => setTraceFilters((prev) => ({ ...prev, sourceKind: value }))}
                      style={{ width: 160 }}
                      options={[
                        { label: t("memoryQa.sourceKinds.conversation"), value: "conversation" },
                        { label: t("memoryQa.sourceKinds.task"), value: "task" }
                      ]}
                    />
                    <Select
                      allowClear
                      placeholder={t("memoryQa.filters.status")}
                      value={traceFilters.status}
                      onChange={(value) => setTraceFilters((prev) => ({ ...prev, status: value }))}
                      style={{ width: 160 }}
                      options={[
                        { label: t("memoryQa.statuses.completed"), value: "completed" },
                        { label: t("memoryQa.statuses.skipped"), value: "skipped" }
                      ]}
                    />
                    <Button onClick={() => { void load(); }} loading={loading}>{t("memoryQa.actions.refresh")}</Button>
                  </Space>
                </Card>

                <Card>
                  <Table
                    rowKey="traceId"
                    loading={loading}
                    dataSource={traces}
                    pagination={{ pageSize: 12 }}
                    columns={[
                      { title: t("memoryQa.traces.time"), dataIndex: "createdAt", width: 180 },
                      { title: t("memoryQa.traces.source"), dataIndex: "sourceKind", width: 120, render: (value: string) => t(`memoryQa.sourceKinds.${value}`, { defaultValue: value }) },
                      { title: t("memoryQa.traces.status"), dataIndex: "status", width: 120, render: (value: string) => t(`memoryQa.statuses.${value}`, { defaultValue: value }) },
                      { title: t("memoryQa.traces.conversation"), dataIndex: "conversationId", ellipsis: true },
                      {
                        title: t("memoryQa.traces.final"),
                        width: 100,
                        render: (_, row) => metricNumber(row.metrics, "finalCount")
                      },
                      {
                        title: t("memoryQa.traces.candidate"),
                        width: 100,
                        render: (_, row) => metricNumber(row.metrics, "candidateCount")
                      },
                      {
                        title: t("memoryQa.common.action"),
                        width: 100,
                        render: (_, row) => <Button size="small" onClick={() => { void openTrace(row.traceId); }}>{t("memoryQa.actions.detail")}</Button>
                      }
                    ]}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "eval",
            label: t("memoryQa.tabs.evaluation"),
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card
                  title={t("memoryQa.datasets.title")}
                  extra={<Button type="primary" onClick={() => setDatasetModalOpen(true)}>{t("memoryQa.actions.createDataset")}</Button>}
                >
                  <Table
                    rowKey="datasetId"
                    dataSource={datasets}
                    pagination={false}
                    columns={[
                      { title: t("memoryQa.datasets.name"), dataIndex: "name" },
                      { title: t("memoryQa.datasets.sampleCount"), dataIndex: "sampleCount", width: 100 },
                      { title: t("memoryQa.datasets.updatedAt"), dataIndex: "updatedAt", width: 180 },
                      {
                        title: t("memoryQa.common.action"),
                        width: 120,
                        render: (_, row) => (
                          <Button
                            size="small"
                            loading={runningDatasetId === row.datasetId}
                            onClick={() => { void handleRunDataset(row.datasetId); }}
                          >
                            {t("memoryQa.actions.runEvaluation")}
                          </Button>
                        )
                      }
                    ]}
                  />
                </Card>

                <Card title={t("memoryQa.reports.title")}>
                  <Table
                    rowKey="reportId"
                    dataSource={reports}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: t("memoryQa.datasets.name"), dataIndex: "name" },
                      { title: t("memoryQa.reports.dataset"), dataIndex: "datasetName" },
                      {
                        title: t("memoryQa.reports.precision"),
                        width: 120,
                        render: (_, row) => metricNumber(row.metrics, "precision").toFixed(3)
                      },
                      {
                        title: t("memoryQa.reports.duplicateRate"),
                        width: 140,
                        render: (_, row) => metricNumber(row.metrics, "duplicateRate").toFixed(3)
                      },
                      {
                        title: t("memoryQa.reports.staleRate"),
                        width: 120,
                        render: (_, row) => metricNumber(row.metrics, "staleMemoryRate").toFixed(3)
                      },
                      { title: t("memoryQa.reports.createdAt"), dataIndex: "createdAt", width: 180 },
                      {
                        title: t("memoryQa.common.action"),
                        width: 100,
                        render: (_, row) => <Button size="small" onClick={() => { void openReport(row.reportId); }}>{t("memoryQa.actions.detail")}</Button>
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
        title={t("memoryQa.traces.traceTitle")}
        open={traceDrawerOpen}
        onClose={() => setTraceDrawerOpen(false)}
      >
        {traceDetail ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label={t("memoryQa.traces.traceId")}>{traceDetail.traceId}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.traces.source")}>{t(`memoryQa.sourceKinds.${traceDetail.sourceKind}`, { defaultValue: traceDetail.sourceKind })}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.traces.conversation")}>{traceDetail.conversationId || t("memoryQa.common.emptyValue")}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.traces.status")}>{t(`memoryQa.statuses.${traceDetail.status}`, { defaultValue: traceDetail.status })}</Descriptions.Item>
            </Descriptions>
            <Card title={t("memoryQa.traces.metrics")}><pre>{JSON.stringify(traceDetail.metrics, null, 2)}</pre></Card>
            <Card title={t("memoryQa.traces.inputContext")}><pre>{JSON.stringify(traceDetail.inputContext, null, 2)}</pre></Card>
            <Card title={t("memoryQa.traces.eventFrame")}><pre>{JSON.stringify(traceDetail.eventFrame, null, 2)}</pre></Card>
            <Card title={t("memoryQa.traces.candidateItems")}><pre>{JSON.stringify(traceDetail.candidateItems, null, 2)}</pre></Card>
            <Card title={t("memoryQa.traces.reviewedItems")}><pre>{JSON.stringify(traceDetail.reviewedItems, null, 2)}</pre></Card>
            <Card title={t("memoryQa.traces.finalItems")}><pre>{JSON.stringify(traceDetail.finalItems, null, 2)}</pre></Card>
          </Space>
        ) : null}
      </Drawer>

      <Drawer
        width={920}
        title={t("memoryQa.reports.reportTitle")}
        open={reportDrawerOpen}
        onClose={() => setReportDrawerOpen(false)}
      >
        {reportDetail ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label={t("memoryQa.reports.report")}>{reportDetail.name}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.reports.samples")}>{reportDetail.sampleCount}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.reports.precision")}>{metricNumber(reportDetail.metrics, "precision").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.reports.duplicateRate")}>{metricNumber(reportDetail.metrics, "duplicateRate").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.reports.staleRate")}>{metricNumber(reportDetail.metrics, "staleMemoryRate").toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label={t("memoryQa.reports.created")}>{reportDetail.createdAt}</Descriptions.Item>
            </Descriptions>
            <Card title={t("memoryQa.reports.reportJson")}><pre>{JSON.stringify(reportDetail.report, null, 2)}</pre></Card>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={datasetModalOpen}
        title={t("memoryQa.datasets.modalTitle")}
        onCancel={() => setDatasetModalOpen(false)}
        onOk={() => { void handleCreateDataset(); }}
        confirmLoading={creatingDataset}
        width={860}
      >
        <Form layout="vertical" form={datasetForm}>
          <Form.Item name="name" label={t("memoryQa.datasets.name")} rules={[{ required: true, message: t("memoryQa.datasets.nameRequired") }]}>
            <Input placeholder={t("memoryQa.datasets.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="description" label={t("memoryQa.datasets.description")}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="payload"
            label={t("memoryQa.datasets.payload")}
            extra={<Typography.Text type="secondary">{t("memoryQa.datasets.payloadHint")}</Typography.Text>}
            rules={[{ required: true, message: t("memoryQa.datasets.payloadRequired") }]}
          >
            <Input.TextArea rows={16} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
