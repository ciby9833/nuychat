import { AlertOutlined, DownloadOutlined, MessageOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getAdminWaRuntimeStatus,
  getWaMonitorJudgmentConfig,
  getWaMonitorDashboard,
  listMembers,
  listWaMonitorAccountReport,
  listWaMonitorMessageDetailReport,
  listWaMonitorMemberReport,
  listWaMonitorTimeReport,
  listWaMonitorUnrepliedReport,
  updateWaMonitorJudgmentConfig
} from "../../api";
import type {
  MemberListItem,
  PagedResponse,
  WaMonitorAccountReportRow,
  WaMonitorDashboard,
  WaMonitorJudgmentConfig,
  WaMonitorMessageDetailReportRow,
  WaMonitorMemberReportRow,
  WaMonitorReportQuery,
  WaMonitorTimeReportRow,
  WaMonitorUnrepliedReportRow,
  WaRuntimeStatus
} from "../../types";
import { WaAccountsPane } from "../agents/components/WaAccountsPane";

const { RangePicker } = DatePicker;

type ReportTab = "health" | "accounts" | "members" | "time" | "messages" | "unreplied";
type AnyReportRow =
  | WaMonitorAccountReportRow
  | WaMonitorMessageDetailReportRow
  | WaMonitorMemberReportRow
  | WaMonitorTimeReportRow
  | WaMonitorUnrepliedReportRow;

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0m";
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

function mapSeverityColor(severity: "warning" | "critical") {
  return severity === "critical" ? "red" : "orange";
}

function defaultRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf("day"), dayjs().endOf("day")];
}

function toApiTime(value: Dayjs) {
  return value.format("YYYY-MM-DDTHH:mm:ss.SSS");
}

function escapeExcelCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function exportExcel(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table>
          <thead><tr>${headers.map((item) => `<th>${escapeExcelCell(item)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((item) => `<td>${escapeExcelCell(item)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

export function WaMonitorTab() {
  const { t } = useTranslation();
  const [judgmentForm] = Form.useForm<{
    isEnabled: boolean;
    judgmentPrompt: string;
    conditionText: string;
  }>();
  const [runtime, setRuntime] = useState<WaRuntimeStatus | null>(null);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [dashboard, setDashboard] = useState<WaMonitorDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("health");
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const [waAccountId, setWaAccountId] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [requiresReply, setRequiresReply] = useState<boolean | null>(null);
  const [isReplied, setIsReplied] = useState<boolean | null>(null);
  const [granularity, setGranularity] = useState<"hour" | "day">("hour");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [judgmentDrawerOpen, setJudgmentDrawerOpen] = useState(false);
  const [judgmentLoading, setJudgmentLoading] = useState(false);
  const [judgmentSaving, setJudgmentSaving] = useState(false);
  const [judgmentConfig, setJudgmentConfig] = useState<WaMonitorJudgmentConfig | null>(null);
  const [accountReport, setAccountReport] = useState<PagedResponse<WaMonitorAccountReportRow> | null>(null);
  const [memberReport, setMemberReport] = useState<PagedResponse<WaMonitorMemberReportRow> | null>(null);
  const [timeReport, setTimeReport] = useState<PagedResponse<WaMonitorTimeReportRow> | null>(null);
  const [messageReport, setMessageReport] = useState<PagedResponse<WaMonitorMessageDetailReportRow> | null>(null);
  const [unrepliedReport, setUnrepliedReport] = useState<PagedResponse<WaMonitorUnrepliedReportRow> | null>(null);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [expandedMessageRowKeys, setExpandedMessageRowKeys] = useState<string[]>([]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRuntime, nextMembers, nextDashboard] = await Promise.all([
        getAdminWaRuntimeStatus(),
        listMembers(),
        getWaMonitorDashboard()
      ]);
      setRuntime(nextRuntime);
      setMembers(nextMembers);
      setDashboard(nextDashboard);
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const reportQuery = useMemo<WaMonitorReportQuery>(() => ({
    startAt: toApiTime(range[0].startOf("second")),
    endAt: toApiTime(range[1].endOf("second")),
    waAccountId,
    membershipId,
    requiresReply,
    isReplied,
    granularity,
    page,
    pageSize
  }), [granularity, isReplied, membershipId, page, pageSize, range, requiresReply, waAccountId]);

  const loadReport = useCallback(async () => {
    if (activeTab === "health") return;
    setReportLoading(true);
    try {
      if (activeTab === "accounts") setAccountReport(await listWaMonitorAccountReport(reportQuery));
      if (activeTab === "members") setMemberReport(await listWaMonitorMemberReport(reportQuery));
      if (activeTab === "time") setTimeReport(await listWaMonitorTimeReport(reportQuery));
      if (activeTab === "messages") setMessageReport(await listWaMonitorMessageDetailReport(reportQuery));
      if (activeTab === "unreplied") setUnrepliedReport(await listWaMonitorUnrepliedReport(reportQuery));
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setReportLoading(false);
    }
  }, [activeTab, reportQuery]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const resetReportPage = useCallback(() => {
    setPage(1);
  }, []);

  const handleTableChange = useCallback((pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 20);
    setExpandedMessageRowKeys([]);
  }, []);

  const openJudgmentDrawer = useCallback(async () => {
    setJudgmentDrawerOpen(true);
    setJudgmentLoading(true);
    try {
      const nextConfig = await getWaMonitorJudgmentConfig();
      setJudgmentConfig(nextConfig);
      judgmentForm.setFieldsValue({
        isEnabled: nextConfig.isEnabled,
        judgmentPrompt: nextConfig.judgmentPrompt,
        conditionText: nextConfig.conditionText
      });
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setJudgmentLoading(false);
    }
  }, [judgmentForm]);

  const saveJudgmentConfig = useCallback(async () => {
    setJudgmentSaving(true);
    try {
      const values = await judgmentForm.validateFields();
      const nextConfig = await updateWaMonitorJudgmentConfig(values);
      setJudgmentConfig(nextConfig);
      judgmentForm.setFieldsValue({
        isEnabled: nextConfig.isEnabled,
        judgmentPrompt: nextConfig.judgmentPrompt,
        conditionText: nextConfig.conditionText
      });
      void message.success(t("waMonitor.judgment.saveSuccess"));
      setJudgmentDrawerOpen(false);
    } catch (error) {
      if (error instanceof Error) void message.error(error.message);
    } finally {
      setJudgmentSaving(false);
    }
  }, [judgmentForm, t]);

  const accountOptions = useMemo(() => (dashboard?.accounts ?? []).map((item) => ({
    label: `${item.displayName} (${item.phoneE164 ?? item.instanceKey})`,
    value: item.waAccountId
  })), [dashboard?.accounts]);

  const memberOptions = useMemo(() => members.map((item) => ({
    label: item.displayName ?? item.email,
    value: item.membershipId
  })), [members]);

  const commonPagination = useCallback((total?: number): TablePaginationConfig => ({
    current: page,
    pageSize,
    total: total ?? 0,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50, 100],
    showTotal: (count) => t("waMonitor.report.paginationTotal", { count })
  }), [page, pageSize, t]);

  const accountColumns = useMemo<ColumnsType<WaMonitorAccountReportRow>>(() => [
    { title: t("waMonitor.report.account"), dataIndex: "accountDisplayName" },
    { title: t("waMonitor.report.monitoredConversations"), dataIndex: "monitoredConversationCount" },
    { title: t("waMonitor.report.totalMessages"), dataIndex: "totalMessages" },
    { title: t("waMonitor.report.customerMessages"), dataIndex: "customerMessageCount" },
    { title: t("waMonitor.report.serviceMessages"), dataIndex: "serviceMessageCount" },
    { title: t("waMonitor.report.requiresReply"), dataIndex: "requiresReplyCount" },
    { title: t("waMonitor.report.replied"), dataIndex: "repliedCount" },
    { title: t("waMonitor.report.unreplied"), dataIndex: "unrepliedCount" },
    { title: t("waMonitor.report.avgResponse"), dataIndex: "averageResponseSeconds", render: formatDuration }
  ], [t]);

  const memberColumns = useMemo<ColumnsType<WaMonitorMemberReportRow>>(() => [
    { title: t("waMonitor.report.member"), dataIndex: "displayName", render: (value: string | null) => value ?? t("waMonitor.report.unknownMember") },
    { title: t("waMonitor.report.firstReplies"), dataIndex: "firstReplyCount" },
    { title: t("waMonitor.report.avgFirstReply"), dataIndex: "averageFirstReplySeconds", render: formatDuration },
    { title: t("waMonitor.report.participatedConversations"), dataIndex: "participatedConversationCount" }
  ], [t]);

  const timeColumns = useMemo<ColumnsType<WaMonitorTimeReportRow>>(() => [
    { title: t("waMonitor.report.timeBucket"), dataIndex: "bucketAt", render: (value: string) => dayjs(value).format(granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:00") },
    { title: t("waMonitor.report.totalMessages"), dataIndex: "totalMessages" },
    { title: t("waMonitor.report.customerMessages"), dataIndex: "customerMessageCount" },
    { title: t("waMonitor.report.serviceMessages"), dataIndex: "serviceMessageCount" },
    { title: t("waMonitor.report.requiresReply"), dataIndex: "requiresReplyCount" },
    { title: t("waMonitor.report.replied"), dataIndex: "repliedCount" },
    { title: t("waMonitor.report.unreplied"), dataIndex: "unrepliedCount" },
    { title: t("waMonitor.report.avgResponse"), dataIndex: "averageResponseSeconds", render: formatDuration }
  ], [granularity, t]);

  const unrepliedColumns = useMemo<ColumnsType<WaMonitorUnrepliedReportRow>>(() => [
    { title: t("waMonitor.report.account"), dataIndex: "accountDisplayName" },
    { title: t("waMonitor.report.conversation"), dataIndex: "displayName" },
    { title: t("waMonitor.report.type"), dataIndex: "conversationType", render: (value: string) => value === "group" ? t("waMonitor.replyPool.group") : t("waMonitor.replyPool.direct") },
    { title: t("waMonitor.report.customerMessageAt"), dataIndex: "customerMessageAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss") },
    { title: t("waMonitor.replyPool.waiting"), dataIndex: "waitingSeconds", render: formatDuration },
    { title: t("waMonitor.replyPool.unread"), dataIndex: "unreadCount" },
    { title: t("waMonitor.report.preview"), dataIndex: "lastMessagePreview", ellipsis: true }
  ], [t]);

  const messageColumns = useMemo<ColumnsType<WaMonitorMessageDetailReportRow>>(() => [
    { title: t("waMonitor.report.account"), dataIndex: "accountDisplayName", width: 150, fixed: "left" },
    { title: t("waMonitor.report.conversation"), dataIndex: "displayName", width: 170 },
    { title: t("waMonitor.report.sender"), width: 170, render: (_, row) => (
      <Space direction="vertical" size={0}>
        <Typography.Text>{row.senderDisplayName ?? row.senderPhoneE164 ?? row.senderJid ?? "-"}</Typography.Text>
        {row.senderPhoneE164 && row.senderPhoneE164 !== row.senderDisplayName ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.senderPhoneE164}</Typography.Text>
        ) : null}
      </Space>
    ) },
    { title: t("waMonitor.report.customerMessageAt"), dataIndex: "customerMessageAt", width: 160, render: (value: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-" },
    { title: t("waMonitor.report.customerMessage"), dataIndex: "bodyText", width: 360, render: (value: string) => (
      <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{value || "-"}</Typography.Paragraph>
    ) },
    { title: t("waMonitor.report.requiresReply"), dataIndex: "requiresReply", width: 110, render: (value: boolean) => <Tag color={value ? "orange" : "default"}>{value ? t("waMonitor.report.yes") : t("waMonitor.report.no")}</Tag> },
    { title: t("waMonitor.report.analysisReason"), dataIndex: "reason", width: 220, render: (value: string) => <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{value || "-"}</Typography.Paragraph> },
    { title: t("waMonitor.report.confidence"), dataIndex: "confidence", width: 90, render: (value: number) => `${Math.round(value * 100)}%` },
    { title: t("waMonitor.report.replied"), dataIndex: "isReplied", width: 90, render: (value: boolean) => <Tag color={value ? "green" : "red"}>{value ? t("waMonitor.report.yes") : t("waMonitor.report.no")}</Tag> },
    { title: t("waMonitor.report.firstReplyAt"), dataIndex: "firstReplyAt", width: 160, render: (value: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-" },
    { title: t("waMonitor.report.member"), dataIndex: "repliedByName", width: 120, render: (value: string | null) => value ?? "-" },
    { title: t("waMonitor.report.firstReplyText"), dataIndex: "firstReplyText", width: 260, render: (value: string) => <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{value || "-"}</Typography.Paragraph> }
  ], [t]);

  const fetchAllRows = useCallback(async (): Promise<AnyReportRow[]> => {
    const rows: AnyReportRow[] = [];
    let nextPage = 1;
    let total = 0;
    do {
      const query = { ...reportQuery, page: nextPage, pageSize: 500 };
      const result =
        activeTab === "accounts" ? await listWaMonitorAccountReport(query) :
          activeTab === "members" ? await listWaMonitorMemberReport(query) :
            activeTab === "time" ? await listWaMonitorTimeReport(query) :
              activeTab === "messages" ? await listWaMonitorMessageDetailReport(query) :
              activeTab === "unreplied" ? await listWaMonitorUnrepliedReport(query) :
                { rows: [], pagination: { page: 1, pageSize: 500, total: 0 } };
      rows.push(...result.rows);
      total = result.pagination.total;
      nextPage += 1;
    } while (rows.length < total);
    return rows;
  }, [activeTab, reportQuery]);

  const exportCurrentReport = useCallback(async () => {
    if (activeTab === "health") return;
    setExporting(true);
    try {
      const rows = await fetchAllRows();
      if (activeTab === "accounts") {
        exportExcel(
          `wa-account-report-${dayjs().format("YYYYMMDDHHmmss")}.xls`,
          accountColumns.map((item) => String(item.title)),
          (rows as WaMonitorAccountReportRow[]).map((row) => [
            row.accountDisplayName,
            row.monitoredConversationCount,
            row.totalMessages,
            row.customerMessageCount,
            row.serviceMessageCount,
            row.requiresReplyCount,
            row.repliedCount,
            row.unrepliedCount,
            formatDuration(row.averageResponseSeconds)
          ])
        );
      }
      if (activeTab === "members") {
        exportExcel(
          `wa-member-report-${dayjs().format("YYYYMMDDHHmmss")}.xls`,
          memberColumns.map((item) => String(item.title)),
          (rows as WaMonitorMemberReportRow[]).map((row) => [
            row.displayName ?? t("waMonitor.report.unknownMember"),
            row.firstReplyCount,
            formatDuration(row.averageFirstReplySeconds),
            row.participatedConversationCount
          ])
        );
      }
      if (activeTab === "time") {
        exportExcel(
          `wa-time-report-${dayjs().format("YYYYMMDDHHmmss")}.xls`,
          timeColumns.map((item) => String(item.title)),
          (rows as WaMonitorTimeReportRow[]).map((row) => [
            dayjs(row.bucketAt).format(granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:00"),
            row.totalMessages,
            row.customerMessageCount,
            row.serviceMessageCount,
            row.requiresReplyCount,
            row.repliedCount,
            row.unrepliedCount,
            formatDuration(row.averageResponseSeconds)
          ])
        );
      }
      if (activeTab === "unreplied") {
        exportExcel(
          `wa-unreplied-report-${dayjs().format("YYYYMMDDHHmmss")}.xls`,
          unrepliedColumns.map((item) => String(item.title)),
          (rows as WaMonitorUnrepliedReportRow[]).map((row) => [
            row.accountDisplayName,
            row.displayName,
            row.conversationType,
            dayjs(row.customerMessageAt).format("YYYY-MM-DD HH:mm:ss"),
            formatDuration(row.waitingSeconds),
            row.unreadCount,
            row.lastMessagePreview
          ])
        );
      }
      if (activeTab === "messages") {
        exportExcel(
          `wa-message-detail-report-${dayjs().format("YYYYMMDDHHmmss")}.xls`,
          messageColumns.map((item) => String(item.title)),
          (rows as WaMonitorMessageDetailReportRow[]).map((row) => [
            row.accountDisplayName,
            row.displayName,
            row.senderDisplayName ?? row.senderPhoneE164 ?? row.senderJid ?? "",
            row.customerMessageAt ? dayjs(row.customerMessageAt).format("YYYY-MM-DD HH:mm:ss") : "",
            row.bodyText,
            row.contextMessages.map((item) => {
              const sender = item.direction === "outbound" ? t("waMonitor.report.agent") : (item.senderName ?? "");
              const time = item.messageAt ? dayjs(item.messageAt).format("HH:mm:ss") : "";
              return `[${time} ${sender}] ${item.bodyText || `(${item.messageType})`}`;
            }).join("\n"),
            row.requiresReply ? t("waMonitor.report.yes") : t("waMonitor.report.no"),
            row.reason,
            `${Math.round(row.confidence * 100)}%`,
            row.isReplied ? t("waMonitor.report.yes") : t("waMonitor.report.no"),
            row.firstReplyAt ? dayjs(row.firstReplyAt).format("YYYY-MM-DD HH:mm:ss") : "",
            row.repliedByName ?? "",
            row.firstReplyText
          ])
        );
      }
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  }, [accountColumns, activeTab, fetchAllRows, granularity, memberColumns, messageColumns, t, timeColumns, unrepliedColumns]);

  const reportToolbar = activeTab === "health" ? null : (
    <Card>
      <Space wrap size={12}>
        <RangePicker
          showTime
          value={range}
          onChange={(value) => {
            if (!value?.[0] || !value?.[1]) return;
            setRange([value[0], value[1]]);
            resetReportPage();
          }}
        />
        <Select
          allowClear
          showSearch
          placeholder={t("waMonitor.report.account")}
          options={accountOptions}
          value={waAccountId ?? undefined}
          onChange={(value) => {
            setWaAccountId(value ?? null);
            resetReportPage();
          }}
          style={{ width: 260 }}
        />
        {(activeTab === "members" || activeTab === "time" || activeTab === "messages") ? (
          <Select
            allowClear
            showSearch
            placeholder={t("waMonitor.report.member")}
            options={memberOptions}
            value={membershipId ?? undefined}
            onChange={(value) => {
              setMembershipId(value ?? null);
              resetReportPage();
            }}
            style={{ width: 220 }}
          />
        ) : null}
        {activeTab === "time" ? (
          <Radio.Group
            value={granularity}
            onChange={(event) => {
              setGranularity(event.target.value as "hour" | "day");
              resetReportPage();
            }}
            options={[
              { label: t("waMonitor.report.byHour"), value: "hour" },
              { label: t("waMonitor.report.byDay"), value: "day" }
            ]}
          />
        ) : null}
        {activeTab === "messages" ? (
          <>
            <Select
              allowClear
              placeholder={t("waMonitor.report.requiresReply")}
              value={requiresReply == null ? undefined : String(requiresReply)}
              onChange={(value) => {
                setRequiresReply(value === undefined ? null : value === "true");
                resetReportPage();
              }}
              style={{ width: 150 }}
              options={[
                { label: t("waMonitor.report.yes"), value: "true" },
                { label: t("waMonitor.report.no"), value: "false" }
              ]}
            />
            <Select
              allowClear
              placeholder={t("waMonitor.report.replied")}
              value={isReplied == null ? undefined : String(isReplied)}
              onChange={(value) => {
                setIsReplied(value === undefined ? null : value === "true");
                resetReportPage();
              }}
              style={{ width: 150 }}
              options={[
                { label: t("waMonitor.report.yes"), value: "true" },
                { label: t("waMonitor.report.no"), value: "false" }
              ]}
            />
          </>
        ) : null}
        <Button icon={<ReloadOutlined />} onClick={() => void loadReport()} loading={reportLoading}>
          {t("waMonitor.refresh")}
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => void exportCurrentReport()} loading={exporting}>
          {t("waMonitor.report.exportExcel")}
        </Button>
      </Space>
    </Card>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>{t("waMonitor.pageTitle")}</Typography.Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => void openJudgmentDrawer()}>
              {t("waMonitor.judgment.button")}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadBase()} loading={loading}>
              {t("waMonitor.refresh")}
            </Button>
          </Space>
        </Col>
      </Row>

      {runtime && !runtime.available ? (
        <Alert
          type="warning"
          showIcon
          message={t("waMonitor.providerUnavailable")}
          description={runtime.reason ?? t("waMonitor.providerUnavailableDesc")}
        />
      ) : null}

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key as ReportTab);
          setPage(1);
        }}
        items={[
          {
            key: "health",
            label: t("waMonitor.reportTabs.health"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Row gutter={16}>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.accountCount")} value={dashboard?.summary.accountCount ?? 0} /></Card></Col>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.online")} value={dashboard?.summary.readyCount ?? 0} /></Card></Col>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.connecting")} value={dashboard?.summary.connectingCount ?? 0} /></Card></Col>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.offline")} value={dashboard?.summary.offlineCount ?? 0} /></Card></Col>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.criticalAlert")} value={dashboard?.summary.criticalAlertCount ?? 0} /></Card></Col>
                  <Col span={4}><Card><Statistic title={t("waMonitor.stats.warningAlert")} value={dashboard?.summary.warningAlertCount ?? 0} /></Card></Col>
                </Row>

                <Card
                  title={t("waMonitor.alerts.title")}
                  extra={(
                    <Space>
                      <AlertOutlined />
                      {(dashboard?.alerts.length ?? 0) > 1 ? (
                        <Button type="link" size="small" onClick={() => setAlertsExpanded((value) => !value)}>
                          {alertsExpanded ? t("waMonitor.alerts.collapse") : t("waMonitor.alerts.expand", { count: dashboard?.alerts.length ?? 0 })}
                        </Button>
                      ) : null}
                    </Space>
                  )}
                >
                  {dashboard?.alerts.length ? (
                    <List
                      dataSource={alertsExpanded ? dashboard.alerts : dashboard.alerts.slice(0, 1)}
                      renderItem={(item) => (
                        <List.Item>
                          <Space direction="vertical" size={0}>
                            <Space>
                              <Tag color={mapSeverityColor(item.severity)}>
                                {item.severity === "critical" ? t("waMonitor.alerts.critical") : t("waMonitor.alerts.warning")}
                              </Tag>
                              <Typography.Text strong>{item.title}</Typography.Text>
                            </Space>
                            <Typography.Text type="secondary">{item.detail}</Typography.Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("waMonitor.alerts.empty")} />
                  )}
                </Card>

                <Card title={t("waMonitor.health.title")}>
                  <WaAccountsPane
                    waAccounts={(dashboard?.accounts ?? [])}
                    members={members}
                    loading={loading}
                    onReload={() => void loadBase()}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "accounts",
            label: t("waMonitor.reportTabs.accounts"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {reportToolbar}
                <Table
                  rowKey="waAccountId"
                  loading={reportLoading}
                  columns={accountColumns}
                  dataSource={accountReport?.rows ?? []}
                  pagination={commonPagination(accountReport?.pagination.total)}
                  onChange={handleTableChange}
                />
              </Space>
            )
          },
          {
            key: "members",
            label: t("waMonitor.reportTabs.members"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {reportToolbar}
                <Table
                  rowKey={(row) => row.membershipId ?? "unknown"}
                  loading={reportLoading}
                  columns={memberColumns}
                  dataSource={memberReport?.rows ?? []}
                  pagination={commonPagination(memberReport?.pagination.total)}
                  onChange={handleTableChange}
                />
              </Space>
            )
          },
          {
            key: "time",
            label: t("waMonitor.reportTabs.time"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {reportToolbar}
                <Table
                  rowKey="bucketAt"
                  loading={reportLoading}
                  columns={timeColumns}
                  dataSource={timeReport?.rows ?? []}
                  pagination={commonPagination(timeReport?.pagination.total)}
                  onChange={handleTableChange}
                />
              </Space>
            )
          },
          {
            key: "messages",
            label: t("waMonitor.reportTabs.messages"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {reportToolbar}
                <Table
                  rowKey="analysisId"
                  loading={reportLoading}
                  columns={messageColumns}
                  dataSource={messageReport?.rows ?? []}
                  pagination={commonPagination(messageReport?.pagination.total)}
                  onChange={handleTableChange}
                  expandable={{
                    expandedRowKeys: expandedMessageRowKeys,
                    onExpand: (expanded, row) => setExpandedMessageRowKeys(expanded ? [row.analysisId] : []),
                    rowExpandable: (row) => row.contextMessages.length > 0,
                    expandedRowRender: (row) => (
                      <Space direction="vertical" size={8} style={{ width: "100%", maxWidth: 980 }}>
                        <Typography.Text strong>{t("waMonitor.report.context")}</Typography.Text>
                        {row.contextMessages.map((item) => (
                          <div
                            key={item.waMessageId}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 6,
                              background: item.waMessageId === row.waMessageId ? "#fff7e6" : "#fafafa",
                              border: "1px solid #f0f0f0"
                            }}
                          >
                            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                              {[item.messageAt ? dayjs(item.messageAt).format("HH:mm:ss") : null, item.direction === "outbound" ? t("waMonitor.report.agent") : item.senderName].filter(Boolean).join(" · ")}
                            </Typography.Text>
                            <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                              {item.bodyText || `(${item.messageType})`}
                            </Typography.Paragraph>
                          </div>
                        ))}
                      </Space>
                    )
                  }}
                  scroll={{ x: 2230 }}
                />
              </Space>
            )
          },
          {
            key: "unreplied",
            label: t("waMonitor.reportTabs.unreplied"),
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {reportToolbar}
                <Card title={t("waMonitor.replyPool.title")} extra={<MessageOutlined />}>
                  <Table
                    rowKey="factId"
                    loading={reportLoading}
                    columns={unrepliedColumns}
                    dataSource={unrepliedReport?.rows ?? []}
                    pagination={commonPagination(unrepliedReport?.pagination.total)}
                    onChange={handleTableChange}
                  />
                </Card>
              </Space>
            )
          }
        ]}
      />
      <Drawer
        title={t("waMonitor.judgment.title")}
        open={judgmentDrawerOpen}
        width={640}
        onClose={() => setJudgmentDrawerOpen(false)}
        extra={judgmentConfig?.updatedAt ? (
          <Typography.Text type="secondary">
            {t("waMonitor.judgment.updatedAt", { value: dayjs(judgmentConfig.updatedAt).format("YYYY-MM-DD HH:mm:ss") })}
          </Typography.Text>
        ) : null}
        footer={(
          <Row justify="end">
            <Space>
              <Button onClick={() => setJudgmentDrawerOpen(false)}>
                {t("waMonitor.judgment.cancel")}
              </Button>
              <Button type="primary" onClick={() => void saveJudgmentConfig()} loading={judgmentSaving}>
                {t("waMonitor.judgment.save")}
              </Button>
            </Space>
          </Row>
        )}
      >
        <Form
          form={judgmentForm}
          layout="vertical"
          disabled={judgmentLoading}
          initialValues={{ isEnabled: true }}
        >
          <Form.Item
            name="isEnabled"
            label={t("waMonitor.judgment.enabled")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="judgmentPrompt"
            label={t("waMonitor.judgment.prompt")}
            rules={[{ required: true, message: t("waMonitor.judgment.promptRequired") }]}
          >
            <Input.TextArea rows={7} maxLength={8000} showCount />
          </Form.Item>
          <Form.Item
            name="conditionText"
            label={t("waMonitor.judgment.conditions")}
            rules={[{ required: true, message: t("waMonitor.judgment.conditionsRequired") }]}
          >
            <Input.TextArea rows={10} maxLength={8000} showCount />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}
