/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理
 * 文件职责: 质检模块主入口，负责串联筛选区、统计区、质检记录列表、新建质检弹窗与维度配置弹窗。
 * 主要交互文件:
 * - ./hooks/useQaData.ts: 负责质检记录、评分规则、候选会话、坐席列表加载，以及新建/发布/规则更新动作。
 * - ./components/QaFilterBar.tsx: 展示筛选条件和顶部操作入口。
 * - ./components/QaStatsCard.tsx: 展示质检数量、平均分、维度数量统计。
 * - ./components/QaReviewsTable.tsx: 展示质检记录列表与状态切换。
 * - ./modals/QaCreateModal.tsx: 承载新建质检记录表单。
 * - ./modals/QaRulesModal.tsx: 承载质检维度配置表单。
 * - ./types.ts: 统一导出 qa 模块使用的类型与表单类型。
 * - ../../api.ts: 提供质检列表、评分规则、候选会话与质检操作接口能力。
 */

import { Space } from "antd";

import { QaFilterBar } from "./components/QaFilterBar";
import { QaReviewsTable } from "./components/QaReviewsTable";
import { QaStatsCard } from "./components/QaStatsCard";
import { useQaData } from "./hooks/useQaData";
import { QaCreateModal } from "./modals/QaCreateModal";
import { QaRulesModal } from "./modals/QaRulesModal";

export function QaTab() {
  const data = useQaData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <QaFilterBar
        loading={data.loading}
        agents={data.agents}
        filters={data.filters}
        onFiltersChange={(updater) => data.setFilters(updater)}
        onRefresh={() => { void data.load(data.filters); }}
        onOpenRules={data.openRules}
        onOpenCreate={data.openCreate}
      />

      <QaStatsCard
        total={data.reviews?.total ?? 0}
        averageScore={data.averageScore}
        ruleCount={data.rules.length}
      />

      <QaReviewsTable
        loading={data.loading}
        reviews={data.reviews}
        onToggleStatus={(row) => { void data.toggleStatus(row); }}
        onPageChange={(page, pageSize) => { void data.loadReviewPage(page, pageSize); }}
      />

      <QaCreateModal
        open={data.createOpen}
        saving={data.saving}
        conversations={data.conversations}
        form={data.createForm}
        onCancel={() => data.setCreateOpen(false)}
        onOk={() => { void data.submitCreate(); }}
      />

      <QaRulesModal
        open={data.rulesOpen}
        saving={data.saving}
        form={data.rulesForm}
        onCancel={() => data.setRulesOpen(false)}
        onOk={() => { void data.submitRules(); }}
      />
    </Space>
  );
}
