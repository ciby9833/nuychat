/**
 * 菜单路径与名称: 客户中心 -> Analytics / 数据统计
 * 文件职责: 统一导出 analytics 模块使用的日报类型，便于模块内部继续内聚。
 * 主要交互文件:
 * - ./AnalyticsTab.tsx
 * - ./components/AnalyticsSummary.tsx
 * - ./components/AnalyticsEventTable.tsx
 * - ./hooks/useAnalyticsData.ts
 */

export type { DailyReport, DailyReportRow } from "../../types";
