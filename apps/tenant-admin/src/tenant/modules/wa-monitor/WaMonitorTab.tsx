import { AlertOutlined, MessageOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getAdminWaRuntimeStatus,
  getWaDailyMonitorReport,
  getWaMonitorDashboard,
  listMembers,
  listWaReplyPool
} from "../../api";
import type {
  MemberListItem,
  WaDailyMonitorReport,
  WaMonitorDashboard,
  WaReplyPoolItem,
  WaRuntimeStatus
} from "../../types";
import { WaAccountsPane } from "../agents/components/WaAccountsPane";

type InsightTab = "report" | "reply-pool";

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0m";
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

function mapSeverityColor(severity: "warning" | "critical") {
  return severity === "critical" ? "red" : "orange";
}

export function WaMonitorTab() {
  const { t } = useTranslation();
  const [runtime, setRuntime] = useState<WaRuntimeStatus | null>(null);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [dashboard, setDashboard] = useState<WaMonitorDashboard | null>(null);
  const [report, setReport] = useState<WaDailyMonitorReport | null>(null);
  const [replyPool, setReplyPool] = useState<WaReplyPoolItem[]>([]);
  const [activeInsightTab, setActiveInsightTab] = useState<InsightTab>("report");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [replyPoolLoading, setReplyPoolLoading] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      setReport(null);
      setReplyPool([]);
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

  const loadReport = useCallback(async () => {
    if (reportLoading || report) return;
    setReportLoading(true);
    try {
      setReport(await getWaDailyMonitorReport(today));
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setReportLoading(false);
    }
  }, [report, reportLoading, today]);

  const loadReplyPool = useCallback(async () => {
    if (replyPoolLoading || replyPool.length > 0) return;
    setReplyPoolLoading(true);
    try {
      setReplyPool(await listWaReplyPool());
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setReplyPoolLoading(false);
    }
  }, [replyPool.length, replyPoolLoading]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (activeInsightTab === "report") {
      void loadReport();
    } else if (activeInsightTab === "reply-pool") {
      void loadReplyPool();
    }
  }, [activeInsightTab, loadReport, loadReplyPool]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>{t("waMonitor.pageTitle")}</Typography.Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => void loadBase()} loading={loading}>
            {t("waMonitor.refresh")}
          </Button>
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

      <Row gutter={16}>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.accountCount")} value={dashboard?.summary.accountCount ?? 0} /></Card></Col>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.online")} value={dashboard?.summary.readyCount ?? 0} /></Card></Col>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.connecting")} value={dashboard?.summary.connectingCount ?? 0} /></Card></Col>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.offline")} value={dashboard?.summary.offlineCount ?? 0} /></Card></Col>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.criticalAlert")} value={dashboard?.summary.criticalAlertCount ?? 0} /></Card></Col>
        <Col span={4}><Card><Statistic title={t("waMonitor.stats.warningAlert")} value={dashboard?.summary.warningAlertCount ?? 0} /></Card></Col>
      </Row>

      <Card title={t("waMonitor.alerts.title")} extra={<AlertOutlined />}>
        {dashboard?.alerts.length ? (
          <List
            dataSource={dashboard.alerts}
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

      <Tabs
        activeKey={activeInsightTab}
        onChange={(key) => setActiveInsightTab(key as InsightTab)}
        items={[
          {
            key: "report",
            label: t("waMonitor.insightTabs.report"),
            children: (
              <Card title={t("waMonitor.report.title", { date: report?.date ?? today })} loading={reportLoading}>
                <Row gutter={16}>
                  <Col span={8}><Statistic title={t("waMonitor.report.totalMessages")} value={report?.summary.totalMessages ?? 0} /></Col>
                  <Col span={8}><Statistic title={t("waMonitor.report.manualReplies")} value={report?.summary.manualReplyCount ?? 0} /></Col>
                  <Col span={8}><Statistic title={t("waMonitor.report.avgResponse")} value={formatDuration(report?.summary.averageResponseSeconds)} /></Col>
                </Row>
                <Typography.Title level={5} style={{ marginTop: 16 }}>{t("waMonitor.report.unrepliedTop10")}</Typography.Title>
                <List
                  dataSource={report?.unrepliedTop10 ?? []}
                  locale={{ emptyText: t("waMonitor.report.noUnreplied") }}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{item.displayName}</Typography.Text>
                        <Typography.Text type="secondary">{item.lastMessagePreview || item.chatJid}</Typography.Text>
                        <Typography.Text type="secondary">
                          {t("waMonitor.report.waiting", { value: formatDuration(item.waitingSeconds) })}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            )
          },
          {
            key: "reply-pool",
            label: t("waMonitor.insightTabs.replyPool"),
            children: (
              <Card title={t("waMonitor.replyPool.title")} extra={<MessageOutlined />} loading={replyPoolLoading}>
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  {t("waMonitor.replyPool.description")}
                </Typography.Text>
                <List
                  dataSource={replyPool}
                  locale={{ emptyText: t("waMonitor.replyPool.empty") }}
                  renderItem={(row) => (
                    <List.Item>
                      <Space direction="vertical" size={2} style={{ width: "100%" }}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <Typography.Text strong>{row.displayName}</Typography.Text>
                          <Tag>{row.conversationType === "group" ? t("waMonitor.replyPool.group") : t("waMonitor.replyPool.direct")}</Tag>
                        </Space>
                        <Typography.Text type="secondary">{row.accountDisplayName}</Typography.Text>
                        <Typography.Text type="secondary">{row.lastMessagePreview || row.chatJid}</Typography.Text>
                        <Space size={8}>
                          <Tag>{t("waMonitor.replyPool.unread", { count: row.unreadCount })}</Tag>
                          <Tag>{t("waMonitor.replyPool.waiting", { value: formatDuration(row.waitingSeconds) })}</Tag>
                          <Typography.Text type="secondary">{row.currentReplierName ?? t("waMonitor.replyPool.unassigned")}</Typography.Text>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            )
          }
        ]}
      />
    </Space>
  );
}
