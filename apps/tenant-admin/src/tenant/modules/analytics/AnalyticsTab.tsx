/**
 * 菜单路径与名称: 客户中心 -> Analytics / 数据统计
 * 文件职责: 统计模块主入口，负责串联日期筛选、刷新动作、摘要卡片与事件明细表。
 * 主要交互文件:
 * - ./hooks/useAnalyticsData.ts: 负责日期状态、日报查询、加载态与错误态。
 * - ./components/AnalyticsSummary.tsx: 展示日报汇总指标卡片。
 * - ./components/AnalyticsEventTable.tsx: 展示事件类型明细表格。
 * - ./types.ts: 统一导出 analytics 模块使用的日报类型，便于后续继续内聚。
 * - ../../api.ts: 提供 getTenantAnalyticsDailyReport 接口请求能力。
 * - ../../types.ts: 当前日报类型源定义仍在租户公共类型文件中。
 */

import { CalendarOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, DatePicker, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import { AnalyticsEventTable } from "./components/AnalyticsEventTable";
import { AnalyticsSummary } from "./components/AnalyticsSummary";
import { useAnalyticsData } from "./hooks/useAnalyticsData";

const { Title } = Typography;

export function AnalyticsTab() {
  const { t } = useTranslation();
  const data = useAnalyticsData(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <CalendarOutlined style={{ fontSize: 18 }} />
        <Title level={4} style={{ margin: 0 }}>{t("analytics.title")}</Title>
        <DatePicker
          value={dayjs(data.date)}
          onChange={(value) => {
            if (value) data.setDate(value.format("YYYY-MM-DD"));
          }}
          allowClear={false}
          style={{ marginLeft: 12 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => { void data.load(data.date); }} loading={data.loading}>
          {t("common.refresh")}
        </Button>
        {data.error ? <Tag color="red">{data.error}</Tag> : null}
      </div>

      <AnalyticsSummary summary={data.report?.summary} loading={data.loading} />

      <AnalyticsEventTable
        date={data.date}
        rows={data.report?.events ?? []}
        loading={data.loading}
        error={data.error}
      />
    </div>
  );
}
