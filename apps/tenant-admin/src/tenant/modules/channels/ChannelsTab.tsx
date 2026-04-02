/**
 * 菜单路径与名称: 客户中心 -> 渠道配置
 * 文件职责: 渠道配置模块主入口，负责串联筛选、渠道列表、详情面板和编辑弹窗。
 * 主要交互文件:
 * - ./hooks/useChannelsData.ts: 提供渠道数据、筛选状态、保存与 WhatsApp 绑定动作。
 * - ./components/ChannelGrid.tsx: 渲染筛选区与渠道卡片列表。
 * - ./components/ChannelDetail.tsx: 渲染当前渠道详情。
 * - ./modals/ChannelEditModal.tsx: 承载 Web/Webhook 配置编辑表单。
 */

import { Alert, Space } from "antd";
import { useTranslation } from "react-i18next";

import { ChannelDetail } from "./components/ChannelDetail";
import { ChannelGrid } from "./components/ChannelGrid";
import { useChannelsData } from "./hooks/useChannelsData";
import { ChannelEditModal } from "./modals/ChannelEditModal";

export function ChannelsTab() {
  const { t } = useTranslation();
  const data = useChannelsData();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {data.error ? <Alert type="error" showIcon message={data.error} closable /> : null}

      <ChannelGrid
        filtered={data.filtered}
        typeFilter={data.typeFilter}
        statusFilter={data.statusFilter}
        typeOptions={data.typeOptions}
        selectedChannel={data.selectedChannel}
        binding={data.binding}
        onTypeFilterChange={data.setTypeFilter}
        onStatusFilterChange={data.setStatusFilter}
        onRefresh={() => { void data.load(); }}
        onSelect={data.setSelectedId}
        onEdit={data.openEdit}
        onBindWhatsApp={(row) => { void data.onBindWhatsApp(row); }}
        onCreateWhatsApp={() => { void data.onCreateWhatsApp(); }}
      />

      <ChannelDetail
        selectedChannel={data.selectedChannel}
        selectedWebInfo={data.selectedWebInfo}
        selectedWebhookInfo={data.selectedWebhookInfo}
        whatsAppSetup={data.whatsAppSetup}
        binding={data.binding}
        onBindWhatsApp={(row) => { void data.onBindWhatsApp(row); }}
        onUnbindWhatsApp={(row) => { void data.onUnbindWhatsApp(row); }}
        onDeleteWhatsApp={(row) => { void data.onDeleteWhatsApp(row); }}
        onEdit={data.openEdit}
      />

      <ChannelEditModal
        editing={data.editing}
        form={data.form}
        saving={data.saving}
        onClose={() => data.setEditing(null)}
        onSave={() => { void data.onSave(); }}
      />
    </Space>
  );
}
