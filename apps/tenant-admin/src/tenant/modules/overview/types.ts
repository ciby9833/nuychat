/**
 * 菜单路径与名称: 客户中心 -> Overview / 概览
 * 文件职责: 统一导出 overview 模块依赖的概览数据与状态分布行类型。
 * 主要交互文件:
 * - ./OverviewTab.tsx
 * - ./hooks/useOverviewData.ts
 * - ./components/OverviewSummaryCards.tsx
 * - ./components/OverviewStatusTable.tsx
 */

import type { OverviewData } from "../../types";

export type { OverviewData };

export type StatusRow = {
  status: string;
  count: number;
};
