// 作用: AI 会话监控主入口（三栏布局：会话列表 + 聊天详情 + 监控干预）
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

import { Alert } from "antd";

import { ChatTimeline } from "./components/ChatTimeline";
import { ConversationList } from "./components/ConversationList";
import { FilterBar } from "./components/FilterBar";
import { MonitorPanel } from "./components/MonitorPanel";
import { useAIConversationsData } from "./hooks/useAIConversationsData";
import { S } from "./styles";

export function AIConversationsTab() {
  const data = useAIConversationsData();

  return (
    <div style={S.root}>
      {data.error ? <Alert type="error" showIcon message={data.error} style={{ margin: 8, borderRadius: 8 }} /> : null}

      <FilterBar
        aiAgents={data.aiAgents}
        selectedAiAgentId={data.selectedAiAgentId}
        onAiAgentChange={data.setSelectedAiAgentId}
        selectedStatus={data.selectedStatus}
        onStatusChange={data.setSelectedStatus}
        datePreset={data.datePreset}
        onDatePresetChange={data.setDatePreset}
        customRange={data.customRange}
        onCustomRangeChange={data.setCustomRange}
        summary={data.summary}
        loading={data.loading}
        onRefresh={() => void data.loadList(false)}
      />

      <div style={S.body}>
        <ConversationList
          items={data.items}
          selectedConversationId={data.selectedConversationId}
          loading={data.loading}
          onSelect={data.setSelectedConversationId}
        />

        <ChatTimeline
          detail={data.detail}
          currentItem={data.currentItem}
          detailLoading={data.detailLoading}
        />

        <MonitorPanel
          detail={data.detail}
          currentItem={data.currentItem}
          onlineAgents={data.onlineAgents}
          saving={data.saving}
          interveneText={data.interveneText}
          onInterveneTextChange={data.setInterveneText}
          transferAgentId={data.transferAgentId}
          onTransferAgentIdChange={data.setTransferAgentId}
          onIntervene={() => void data.handleIntervene()}
          onTransfer={() => void data.handleTransfer()}
          onForceClose={() => void data.handleForceClose()}
        />
      </div>
    </div>
  );
}
