import { Card, Col, Row, Statistic, Table, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { QaDashboardData } from "../types";

type Props = {
  dashboard: QaDashboardData | null;
  loading: boolean;
};

export function QaOverviewCards({ dashboard, loading }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.todayQaCount")} value={dashboard?.todayQaCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.autoPassRate")} value={dashboard?.autoPassRate ?? 0} suffix="%" /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.riskCaseCount")} value={dashboard?.riskCaseCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.sampleCaseCount")} value={dashboard?.sampleCaseCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.averageScore")} value={dashboard?.averageScore ?? 0} precision={1} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={loading}><Statistic title={t("qaModule.dashboard.aiVsHumanDiff")} value={dashboard?.aiVsHumanDiff ?? 0} precision={1} /></Card>
        </Col>
      </Row>

      <Card title={t("qaModule.dashboard.agentAverages")} loading={loading}>
        <Table
          rowKey={(row) => row.agentId ?? row.agentName}
          pagination={false}
          size="small"
          dataSource={dashboard?.agentAverages ?? []}
          locale={{ emptyText: t("qaModule.common.empty") }}
          columns={[
            { title: t("qaModule.dashboard.agent"), dataIndex: "agentName" },
            { title: t("qaModule.dashboard.score"), dataIndex: "averageScore", width: 120 },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {t("qaModule.dashboard.helper")}
        </Typography.Paragraph>
      </Card>
    </>
  );
}
