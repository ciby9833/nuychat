/**
 * 菜单路径与名称: 客户中心 -> 调度审计
 * 文件职责: 模块主入口，负责串联筛选栏、运营建议、执行列表与详情抽屉。
 * 主要交互文件:
 * - ./components/FilterBar.tsx
 * - ./components/ExecutionTable.tsx
 * - ./components/SuggestionGroup.tsx
 * - ./hooks/useDispatchAuditData.ts
 * - ./modals/DetailDrawer.tsx
 */

import { Card, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { ExecutionTable } from "./components/ExecutionTable";
import { FilterBar } from "./components/FilterBar";
import { SuggestionGroup } from "./components/SuggestionGroup";
import { useDispatchAuditData } from "./hooks/useDispatchAuditData";
import { DetailDrawer } from "./modals/DetailDrawer";

export function DispatchAuditTab() {
  const { t } = useTranslation();
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

      <Card title={t("dispatchAudit.ops.title")}>
        {data.suggestions.aiAgents.length === 0 && data.suggestions.teams.length === 0 && data.suggestions.customerSegments.length === 0 ? (
          <Typography.Text type="secondary">{t("dispatchAudit.ops.empty")}</Typography.Text>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <SuggestionGroup title={t("dispatchAudit.ops.aiAgents")} items={data.suggestions.aiAgents} />
            <SuggestionGroup title={t("dispatchAudit.ops.teams")} items={data.suggestions.teams} />
            <SuggestionGroup title={t("dispatchAudit.ops.customerSegments")} items={data.suggestions.customerSegments} />
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
