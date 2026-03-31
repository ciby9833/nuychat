import { Button, Input, Select, Tag } from "antd";

import { formatTime } from "../helpers";
import { S } from "../../ai-conversations/styles";
import type { HumanConversationDetail, HumanConversationListItem, SupervisorAgentStatus } from "../types";

type HumanConversationSidebarProps = {
  detail: HumanConversationDetail | null;
  currentItem: HumanConversationListItem | null;
  interveneText: string;
  transferAgentId: string;
  saving: boolean;
  onlineAgents: SupervisorAgentStatus[];
  isEndedConversation: boolean;
  onInterveneTextChange: (value: string) => void;
  onTransferAgentChange: (value: string) => void;
  onIntervene: () => void;
  onTransfer: () => void;
  onForceClose: () => void;
};

export function HumanConversationSidebar({
  detail,
  currentItem,
  interveneText,
  transferAgentId,
  saving,
  onlineAgents,
  isEndedConversation,
  onInterveneTextChange,
  onTransferAgentChange,
  onIntervene,
  onTransfer,
  onForceClose
}: HumanConversationSidebarProps) {
  if (!detail || !currentItem) {
    return (
      <div style={S.rightCol}>
        <div style={{ ...S.chatEmpty, padding: 40 }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <span>选择会话查看管理信息</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.rightCol}>
      <div style={S.rightSection}>
        <div style={S.rightTitle}>会话信息</div>
        <div style={S.infoRow}><span>当前负责人</span><span style={{ fontWeight: 500 }}>{detail.conversation.currentOwnerName ?? "-"}</span></div>
        <div style={S.infoRow}><span>预分配对象</span><span style={{ fontWeight: 500 }}>{detail.conversation.assignedAgentName ?? detail.conversation.assignedAiAgentName ?? "-"}</span></div>
        <div style={S.infoRow}><span>客户等级</span><Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{detail.conversation.customerTier ?? "standard"}</Tag></div>
        <div style={S.infoRow}><span>会话状态</span><span>{detail.conversation.status}</span></div>
        <div style={S.infoRow}><span>最后消息</span><span style={{ fontSize: 11 }}>{detail.conversation.lastMessageAt ? formatTime(detail.conversation.lastMessageAt) : "暂无"}</span></div>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>人工介入</div>
        <Input.TextArea
          rows={3}
          value={interveneText}
          onChange={(event) => onInterveneTextChange(event.target.value)}
          placeholder="输入消息直接发送给客户…"
          style={{ marginBottom: 8, borderRadius: 8 }}
          disabled={Boolean(isEndedConversation)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onIntervene();
            }
          }}
        />
        <Button type="primary" block onClick={onIntervene} loading={saving} disabled={!interveneText.trim() || Boolean(isEndedConversation)}>
          发送人工消息
        </Button>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>转接与操作</div>
        <div style={S.actionBtnGroup}>
          <Select
            size="small"
            showSearch
            style={{ width: "100%" }}
            placeholder="选择在线坐席"
            value={transferAgentId || undefined}
            onChange={onTransferAgentChange}
            disabled={Boolean(isEndedConversation)}
            options={onlineAgents.map((agent) => ({
              value: agent.agentId,
              label: `${agent.displayName} (${agent.activeConversations})`
            }))}
          />
          <Button block onClick={onTransfer} loading={saving} disabled={!transferAgentId || Boolean(isEndedConversation)}>转给人工坐席</Button>
          <Button block danger onClick={onForceClose} loading={saving} disabled={Boolean(isEndedConversation)}>强制关闭会话</Button>
        </div>
      </div>
    </div>
  );
}
