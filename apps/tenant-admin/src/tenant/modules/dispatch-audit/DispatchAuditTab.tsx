// 作用: 调度审计主入口（筛选 + 运营建议 + 执行列表 + 详情抽屉）
// 菜单路径: 客户中心 -> 调度审计
// 作者：吴川

import { Card, Space, Typography } from "antd";

import { ExecutionTable } from "./components/ExecutionTable";
import { FilterBar } from "./components/FilterBar";
import { SuggestionGroup } from "./components/SuggestionGroup";
import { useDispatchAuditData } from "./hooks/useDispatchAuditData";
import { DetailDrawer } from "./modals/DetailDrawer";

export function DispatchAuditTab() {
  const data = useDispatchAuditData();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <FilterBar
        stats={data.stats}
        caseId={data.caseId}
        conversationId={data.conversationId}
        triggerType={data.triggerType}
        datePreset={data.datePreset}
        customRange={data.customRange}
        loading={data.loading}
        onCaseIdChange={data.setCaseId}
        onConversationIdChange={data.setConversationId}
        onTriggerTypeChange={data.setTriggerType}
        onDatePresetChange={data.setDatePreset}
        onCustomRangeChange={data.setCustomRange}
        onRefresh={() => { void data.load(); }}
      />

      <Card title="调度运营建议">
        {data.suggestions.aiAgents.length === 0 && data.suggestions.teams.length === 0 && data.suggestions.customerSegments.length === 0 ? (
          <Typography.Text type="secondary">当前时间范围内暂无明显建议。</Typography.Text>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <SuggestionGroup title="按 AI 座席" items={data.suggestions.aiAgents} />
            <SuggestionGroup title="按团队" items={data.suggestions.teams} />
            <SuggestionGroup title="按客户等级 / 渠道" items={data.suggestions.customerSegments} />
          </Space>
        )}
      </Card>

      <ExecutionTable
        items={data.items}
        loading={data.loading}
        onOpenDetail={(id) => { void data.openDetail(id); }}
      />

      <DetailDrawer
        open={data.drawerOpen}
        loading={data.detailLoading}
        selected={data.selected}
        onClose={data.closeDetail}
      />
    </Space>
  );
}
