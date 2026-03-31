/**
 * 菜单路径与名称: 客户中心 -> Overview / 概览
 * 文件职责: 概览模块主入口，负责串联顶部统计卡片与会话状态分布表。
 * 主要交互文件:
 * - ./hooks/useOverviewData.ts: 负责概览数据加载、错误状态与状态分布派生。
 * - ./components/OverviewSummaryCards.tsx: 展示顶部三张核心统计卡片。
 * - ./components/OverviewStatusTable.tsx: 展示会话状态分布表与加载/错误态。
 * - ../../api.ts: 提供概览数据接口能力。
 */

import { Row } from "antd";

import { OverviewStatusTable } from "./components/OverviewStatusTable";
import { OverviewSummaryCards } from "./components/OverviewSummaryCards";
import { useOverviewData } from "./hooks/useOverviewData";

export function OverviewTab() {
  const data = useOverviewData();

  return (
    <Row gutter={[16, 16]}>
      <OverviewSummaryCards data={data.data} />
      <OverviewStatusTable rows={data.statusRows} error={data.error} loading={!data.data && !data.error} />
    </Row>
  );
}
