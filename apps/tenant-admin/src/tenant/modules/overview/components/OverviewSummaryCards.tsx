import { Card, Col, Row, Statistic } from "antd";
import { useTranslation } from "react-i18next";

import type { OverviewData } from "../types";

type OverviewSummaryCardsProps = {
  data: OverviewData | null;
};

export function OverviewSummaryCards({ data }: OverviewSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title={t("overview.totalConversations")} value={data?.conversations.total ?? 0} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title={t("overview.kbEntries")} value={data?.knowledgeBase.activeEntries ?? 0} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title={t("overview.agentCount")} value={data?.agents.total ?? 0} />
        </Card>
      </Col>
    </>
  );
}
