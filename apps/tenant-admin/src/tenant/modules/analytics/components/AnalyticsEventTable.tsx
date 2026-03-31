/**
 * 菜单路径与名称: 客户中心 -> Analytics / 数据统计 -> 事件明细
 * 文件职责: 展示指定日期的 analytics 事件类型明细与原始事件类型。
 * 主要交互文件:
 * - ../AnalyticsTab.tsx
 * - ../types.ts
 * - ../../../i18n/locales/en/modules/analytics.ts
 * - ../../../i18n/locales/zh/modules/analytics.ts
 * - ../../../i18n/locales/id/modules/analytics.ts
 */

import { Card, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { DailyReportRow } from "../types";

type AnalyticsEventTableProps = {
  date: string;
  rows: DailyReportRow[];
  loading: boolean;
  error: string;
};

export function AnalyticsEventTable({ date, rows, loading, error }: AnalyticsEventTableProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("analytics.eventDetail", { date })}>
      {!error && rows.length === 0 && !loading ? (
        <Typography.Text type="secondary" style={{ display: "block", textAlign: "center", padding: "24px 0" }}>
          {t("analytics.noEvents")}
        </Typography.Text>
      ) : null}

      <Table<DailyReportRow>
        rowKey="eventType"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: t("analytics.col.eventType"),
            dataIndex: "eventType",
            render: (value: string) => (
              <Tag color="blue">{t(`analytics.events.${value}`, { defaultValue: value })}</Tag>
            )
          },
          {
            title: t("analytics.col.rawType"),
            dataIndex: "eventType",
            render: (value: string) => (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {value}
              </Typography.Text>
            )
          },
          {
            title: t("analytics.col.count"),
            dataIndex: "count",
            align: "right",
            render: (value: number) => <strong>{Number(value).toLocaleString()}</strong>
          }
        ]}
      />
    </Card>
  );
}
