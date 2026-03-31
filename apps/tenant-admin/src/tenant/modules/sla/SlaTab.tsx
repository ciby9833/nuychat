/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理
 * 文件职责: SLA 模块主入口，负责串联违约统计、违约筛选、SLA 定义、触发策略与违约列表，以及相关编辑弹窗。
 * 主要交互文件:
 * - ./hooks/useSlaData.ts: 负责 SLA 定义、触发策略、违约数据加载，以及创建/编辑/启停/状态更新操作。
 * - ./components/SlaSummaryCards.tsx: 展示违约统计卡片。
 * - ./components/SlaBreachFilterBar.tsx: 展示违约查询筛选栏。
 * - ./components/SlaDefinitionsTable.tsx: 展示 SLA 定义列表与操作。
 * - ./components/SlaTriggerPoliciesTable.tsx: 展示触发策略列表与操作。
 * - ./components/SlaBreachesTable.tsx: 展示 SLA 违约记录列表与状态处置。
 * - ./modals/SlaDefinitionModal.tsx: 承载 SLA 定义编辑表单。
 * - ./modals/SlaTriggerPolicyModal.tsx: 承载触发策略编辑表单。
 * - ./helpers.tsx: 提供动作标签渲染与动作编辑器。
 * - ../../api.ts: 提供 SLA 定义、触发策略、违约记录相关接口能力。
 */

import { Space } from "antd";

import { SlaBreachFilterBar } from "./components/SlaBreachFilterBar";
import { SlaBreachesTable } from "./components/SlaBreachesTable";
import { SlaDefinitionsTable } from "./components/SlaDefinitionsTable";
import { SlaSummaryCards } from "./components/SlaSummaryCards";
import { SlaTriggerPoliciesTable } from "./components/SlaTriggerPoliciesTable";
import { useSlaData } from "./hooks/useSlaData";
import { SlaDefinitionModal } from "./modals/SlaDefinitionModal";
import { SlaTriggerPolicyModal } from "./modals/SlaTriggerPolicyModal";

export function SlaTab() {
  const data = useSlaData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <SlaSummaryCards summary={data.summary} />

      <SlaBreachFilterBar
        loading={data.loading}
        filters={data.filters}
        onFiltersChange={(updater) => data.setFilters(updater)}
        onRefresh={() => { void data.load(data.filters); }}
      />

      <SlaDefinitionsTable
        loading={data.loading}
        saving={data.saving}
        definitions={data.definitions}
        onCreate={data.openCreateDefinition}
        onEdit={data.openEditDefinition}
        onToggle={(item) => { void data.onToggleDefinition(item); }}
      />

      <SlaTriggerPoliciesTable
        loading={data.loading}
        saving={data.saving}
        triggerPolicies={data.triggerPolicies}
        onCreate={data.openCreateTriggerPolicy}
        onEdit={data.openEditTriggerPolicy}
        onToggle={(item) => { void data.onToggleTriggerPolicy(item); }}
      />

      <SlaBreachesTable
        loading={data.loading}
        breaches={data.breaches}
        onStatusChange={(item, status) => { void data.onUpdateBreachStatus(item, status); }}
        onPageChange={(page, pageSize) => { void data.loadBreachPage(page, pageSize); }}
      />

      <SlaDefinitionModal
        open={data.definitionOpen}
        saving={data.saving}
        editingDefinition={data.editingDefinition}
        form={data.definitionForm}
        onCancel={() => { data.setDefinitionOpen(false); data.setEditingDefinition(null); }}
        onOk={() => { void data.onSaveDefinition(); }}
      />

      <SlaTriggerPolicyModal
        open={data.triggerOpen}
        saving={data.saving}
        editingTriggerPolicy={data.editingTriggerPolicy}
        form={data.triggerForm}
        onCancel={() => { data.setTriggerOpen(false); data.setEditingTriggerPolicy(null); }}
        onOk={() => { void data.onSaveTriggerPolicy(); }}
      />
    </Space>
  );
}
