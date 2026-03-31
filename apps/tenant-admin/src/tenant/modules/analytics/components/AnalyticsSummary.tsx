/**
 * 菜单路径与名称: 客户中心 -> Analytics / 数据统计 -> 汇总卡片
 * 文件职责: 展示 analytics 日报汇总指标卡片。
 * 主要交互文件:
 * - ../AnalyticsTab.tsx
 * - ../types.ts
 * - ../../../i18n/locales/en/modules/analytics.ts
 * - ../../../i18n/locales/zh/modules/analytics.ts
 * - ../../../i18n/locales/id/modules/analytics.ts
 */

import { Card, Col, Row, Statistic } from "antd";
import { useTranslation } from "react-i18next";

import type { DailyReport } from "../types";

type AnalyticsSummaryProps = {
  summary?: DailyReport["summary"];
  loading: boolean;
};

const SUMMARY_ITEMS = [
  { key: "totalEvents", titleKey: "analytics.stats.totalEvents" },
  { key: "distinctCasesTouched", titleKey: "analytics.stats.casesTouched" },
  { key: "conversationsStarted", titleKey: "analytics.stats.convsStarted" },
  { key: "messagesReceived", titleKey: "analytics.stats.msgsReceived" },
  { key: "messagesSent", titleKey: "analytics.stats.msgsSent" },
  { key: "skillsExecuted", titleKey: "analytics.stats.skillsExecuted" },
  { key: "conversationsResolved", titleKey: "analytics.stats.convsResolved" }
] as const;

export function AnalyticsSummary({ summary, loading }: AnalyticsSummaryProps) {
  const { t } = useTranslation();

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {SUMMARY_ITEMS.map((item) => (
        <Col key={item.key} xs={12} sm={8} md={6} lg={4}>
          <Card size="small">
            <Statistic
              title={t(item.titleKey)}
              value={summary?.[item.key] ?? 0}
              loading={loading}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
