// 作用: 渠道配置管理主入口（筛选 + 卡片列表 + 详情 + 编辑弹窗）
// 菜单路径: 客户中心 -> 渠道配置
// 作者：吴川

import { Alert, Space } from "antd";

import { ChannelDetail } from "./components/ChannelDetail";
import { ChannelGrid } from "./components/ChannelGrid";
import { useChannelsData } from "./hooks/useChannelsData";
import { ChannelEditModal } from "./modals/ChannelEditModal";

export function ChannelsTab() {
  const data = useChannelsData();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {data.error ? <Alert type="error" showIcon message={data.error} /> : null}

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
      />

      <ChannelDetail
        selectedChannel={data.selectedChannel}
        selectedWebInfo={data.selectedWebInfo}
        selectedWebhookInfo={data.selectedWebhookInfo}
        whatsAppSetup={data.whatsAppSetup}
        binding={data.binding}
        onBindWhatsApp={(row) => { void data.onBindWhatsApp(row); }}
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
