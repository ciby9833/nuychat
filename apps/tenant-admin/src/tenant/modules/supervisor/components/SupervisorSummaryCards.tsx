/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台 -> 概览统计
 * 文件职责: 展示主管工作台顶部监控指标，以及刷新和广播快捷入口。
 * 主要交互文件:
 * - ../SupervisorTab.tsx: 负责传入刷新与广播动作。
 * - ../hooks/useSupervisorData.ts: 提供概览数据与加载状态。
 */

import { Card, Col, Row, Statistic } from "antd";
import { useTranslation } from "react-i18next";

import type { SupervisorOverview } from "../types";

type SupervisorSummaryCardsProps = {
  overview: SupervisorOverview | null;
  loading: boolean;
  onRefresh: () => void;
  onBroadcastOpen: () => void;
};

export function SupervisorSummaryCards({
  overview,
  loading,
  onRefresh,
  onBroadcastOpen
}: SupervisorSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("supervisorModule.summary.title")}
      extra={
        <Row gutter={8} wrap={false}>
          <Col>
            <a
              onClick={(event) => {
                event.preventDefault();
                onRefresh();
              }}
            >
              {loading ? t("supervisorModule.summary.refreshing") : t("supervisorModule.summary.refresh")}
            </a>
          </Col>
          <Col>
            <a
              onClick={(event) => {
                event.preventDefault();
                onBroadcastOpen();
              }}
            >
              {t("supervisorModule.summary.broadcast")}
            </a>
          </Col>
        </Row>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.waitingQueue")} value={overview?.waitingQueue ?? 0} /></Col>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.onlineAgents")} value={overview?.onlineAgents ?? 0} /></Col>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.aiProcessing")} value={overview?.aiProcessing ?? 0} /></Col>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.todayConversations")} value={overview?.todayConversations ?? 0} /></Col>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.slaBreaches")} value={overview?.slaBreaches ?? 0} /></Col>
        <Col xs={12} md={8} lg={4}><Statistic title={t("supervisorModule.summary.todayCsat")} value={overview?.avgCsatToday ?? 0} precision={2} suffix="★" /></Col>
      </Row>
    </Card>
  );
}
