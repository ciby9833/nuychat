/**
 * 菜单路径与名称: 客户中心 -> CSAT / 满意度调查
 * 文件职责: CSAT 模块主入口，负责串联统计概览、调查任务筛选、任务列表、结果筛选与结果列表。
 * 主要交互文件:
 * - ./hooks/useCsatData.ts: 负责调查数据、结果数据、坐席列表、分页查询与状态更新。
 * - ./components/CsatSummaryCards.tsx: 展示调查总量、待发送、已响应、平均满意度。
 * - ./components/CsatSurveyFilterBar.tsx: 展示调查任务筛选栏。
 * - ./components/CsatSurveyTable.tsx: 展示调查任务列表与状态操作。
 * - ./components/CsatResponseFilterBar.tsx: 展示满意度结果筛选栏。
 * - ./components/CsatResponseTable.tsx: 展示满意度结果列表。
 * - ./types.ts: 统一导出 CSAT 模块类型与筛选条件类型。
 * - ../../api.ts: 提供 listCsatSurveys、listCsatResponses、patchCsatSurveyStatus、listAgents 接口能力。
 */

import { Space, Typography } from "antd";

import { CsatResponseFilterBar } from "./components/CsatResponseFilterBar";
import { CsatResponseTable } from "./components/CsatResponseTable";
import { CsatSummaryCards } from "./components/CsatSummaryCards";
import { CsatSurveyFilterBar } from "./components/CsatSurveyFilterBar";
import { CsatSurveyTable } from "./components/CsatSurveyTable";
import { useCsatData } from "./hooks/useCsatData";

export function CsatTab() {
  const data = useCsatData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <CsatSummaryCards
        summary={{
          total: data.surveySummary.total,
          scheduled: data.surveySummary.scheduled,
          responded: data.surveySummary.responded
        }}
        averageRating={data.averageRating}
      />

      <CsatSurveyFilterBar
        loading={data.loading}
        surveyFilter={data.surveyFilter}
        responseFilter={data.responseFilter}
        onSurveyFilterChange={(updater) => data.setSurveyFilter(updater)}
        onRefresh={() => { void data.load(data.surveyFilter, data.responseFilter); }}
      />

      <CsatSurveyTable
        loading={data.loading}
        surveys={data.surveys}
        onMarkSent={(row) => { void data.markSurveySent(row); }}
        onPageChange={(page, pageSize) => { void data.loadSurveyPage(page, pageSize); }}
      />

      <CsatResponseFilterBar
        loading={data.loading}
        agents={data.agents}
        responseFilter={data.responseFilter}
        onResponseFilterChange={(updater) => data.setResponseFilter(updater)}
        onSubmit={() => { void data.load(data.surveyFilter, data.responseFilter); }}
      />

      <CsatResponseTable
        loading={data.loading}
        responses={data.responses}
        onPageChange={(page, pageSize) => { void data.loadResponsePage(page, pageSize); }}
      />

      <Typography.Text type="secondary">
        调查在会话解决后自动创建，默认延迟 10 分钟进入待发送。
      </Typography.Text>
    </Space>
  );
}
