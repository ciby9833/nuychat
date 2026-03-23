// 作用: AI 会话监控右栏 - 会话信息、人工介入、转交操作、AI Trace
// 菜单路径: 客户中心 -> AI 会话监控 -> 监控与干预面板
// 作者：吴川

import { Button, Input, Select, Tag, Typography } from "antd";

import type { AIConversationDetail, AIConversationListItem, SupervisorAgentStatus } from "../../../types";
import { formatTime } from "../helpers";
import { S } from "../styles";

export function MonitorPanel({
  detail,
  currentItem,
  onlineAgents,
  saving,
  interveneText,
  onInterveneTextChange,
  transferAgentId,
  onTransferAgentIdChange,
  onIntervene,
  onTransfer,
  onForceClose
}: {
  detail: AIConversationDetail | null;
  currentItem: AIConversationListItem | null;
  onlineAgents: SupervisorAgentStatus[];
  saving: boolean;
  interveneText: string;
  onInterveneTextChange: (v: string) => void;
  transferAgentId: string;
  onTransferAgentIdChange: (v: string) => void;
  onIntervene: () => void;
  onTransfer: () => void;
  onForceClose: () => void;
}) {
  if (!detail || !currentItem) {
    return (
      <div style={S.rightCol}>
        <div style={{ ...S.chatEmpty, padding: 40 }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <span>选择会话查看监控信息</span>
        </div>
      </div>
    );
  }

  const conv = detail.conversation;

  return (
    <div style={S.rightCol}>
      <div style={S.rightSection}>
        <div style={S.rightTitle}>会话信息</div>
        <div style={S.infoRow}><span>AI 座席</span><span style={{ fontWeight: 500 }}>{conv?.aiAgentName ?? "-"}</span></div>
        <div style={S.infoRow}><span>客户等级</span><Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{conv?.customerTier ?? "standard"}</Tag></div>
        <div style={S.infoRow}>
          <span>当前处理</span>
          <Tag color={conv?.currentHandlerType === "human" ? "blue" : "green"} style={{ margin: 0, fontSize: 11 }}>
            {conv?.currentHandlerType === "human" ? "人工" : "AI"}
          </Tag>
        </div>
        <div style={S.infoRow}><span>会话状态</span><span>{conv?.status ?? "-"}</span></div>
        {conv?.assignedAgentName ? <div style={S.infoRow}><span>人工坐席</span><span style={{ fontWeight: 500 }}>{conv.assignedAgentName}</span></div> : null}
        <div style={S.infoRow}><span>最近 AI 回复</span><span style={{ fontSize: 11 }}>{conv?.lastAiResponseAt ? formatTime(conv.lastAiResponseAt) : "暂无"}</span></div>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>人工介入</div>
        <Input.TextArea
          rows={3} value={interveneText} onChange={(e) => onInterveneTextChange(e.target.value)}
          placeholder="输入消息直接发送给客户…" style={{ marginBottom: 8, borderRadius: 8 }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onIntervene(); } }}
        />
        <Button type="primary" block onClick={onIntervene} loading={saving} disabled={!interveneText.trim()}>
          发送人工消息
        </Button>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>转交与操作</div>
        <div style={S.actionBtnGroup}>
          <Select size="small" showSearch style={{ width: "100%" }} placeholder="选择在线坐席"
            value={transferAgentId || undefined} onChange={onTransferAgentIdChange}
            options={onlineAgents.map((a) => ({ value: a.agentId, label: `${a.displayName} (${a.activeConversations})` }))}
          />
          <Button block onClick={onTransfer} loading={saving} disabled={!transferAgentId}>转给人工坐席</Button>
          <Button block danger onClick={onForceClose} loading={saving}>强制关闭会话</Button>
        </div>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>AI Trace ({detail.traces.length})</div>
        {detail.traces.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无 AI Trace 记录</Typography.Text>
        ) : (
          detail.traces.slice(0, 5).map((trace) => (
            <div key={trace.traceId} style={S.traceCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <Tag style={{ fontSize: 10, margin: 0 }}>{trace.supervisor}</Tag>
                <span style={{ fontSize: 10, color: "#bbb" }}>{trace.totalDurationMs}ms</span>
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>技能: {trace.skillsCalled.length > 0 ? trace.skillsCalled.join(", ") : "无"}</div>
              {trace.handoffReason ? <div style={{ fontSize: 11, color: "#d48806", marginTop: 2 }}>转人工: {trace.handoffReason}</div> : null}
              {trace.error ? <div style={{ fontSize: 11, color: "#cf1322", marginTop: 2 }}>错误: {trace.error}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
