// 作用: AI 会话监控右栏 - 会话信息、人工介入、转交操作、AI Trace
// 菜单路径: 客户中心 -> AI 会话监控 -> 监控与干预面板
// 作者：吴川

import { Button, Input, Select, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  if (!detail || !currentItem) {
    return (
      <div style={S.rightCol}>
        <div style={{ ...S.chatEmpty, padding: 40 }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <span>{t("aiConversations.monitor.emptyTitle")}</span>
        </div>
      </div>
    );
  }

  const conv = detail.conversation;

  return (
    <div style={S.rightCol}>
      <div style={S.rightSection}>
        <div style={S.rightTitle}>{t("aiConversations.monitor.sectionInfo")}</div>
        <div style={S.infoRow}><span>{t("aiConversations.monitor.aiAgent")}</span><span style={{ fontWeight: 500 }}>{conv?.aiAgentName ?? "-"}</span></div>
        <div style={S.infoRow}><span>{t("aiConversations.monitor.customerTier")}</span><Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{conv?.customerTier ?? t("aiConversations.monitor.standard")}</Tag></div>
        <div style={S.infoRow}>
          <span>{t("aiConversations.monitor.currentHandler")}</span>
          <Tag color={conv?.currentHandlerType === "human" ? "blue" : "green"} style={{ margin: 0, fontSize: 11 }}>
            {conv?.currentHandlerType === "human" ? t("aiConversations.monitor.currentHandlerHuman") : t("aiConversations.monitor.currentHandlerAi")}
          </Tag>
        </div>
        <div style={S.infoRow}><span>{t("aiConversations.monitor.conversationStatus")}</span><span>{conv?.status ?? "-"}</span></div>
        {conv?.assignedAgentName ? <div style={S.infoRow}><span>{t("aiConversations.monitor.assignedAgent")}</span><span style={{ fontWeight: 500 }}>{conv.assignedAgentName}</span></div> : null}
        <div style={S.infoRow}><span>{t("aiConversations.monitor.lastAiReply")}</span><span style={{ fontSize: 11 }}>{conv?.lastAiResponseAt ? formatTime(conv.lastAiResponseAt) : t("aiConversations.monitor.none")}</span></div>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>{t("aiConversations.monitor.sectionIntervene")}</div>
        <Input.TextArea
          rows={3} value={interveneText} onChange={(e) => onInterveneTextChange(e.target.value)}
          placeholder={t("aiConversations.monitor.intervenePlaceholder")} style={{ marginBottom: 8, borderRadius: 8 }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onIntervene(); } }}
        />
        <Button type="primary" block onClick={onIntervene} loading={saving} disabled={!interveneText.trim()}>
          {t("aiConversations.monitor.sendHumanMessage")}
        </Button>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>{t("aiConversations.monitor.sectionActions")}</div>
        <div style={S.actionBtnGroup}>
          <Select size="small" showSearch style={{ width: "100%" }} placeholder={t("aiConversations.monitor.selectOnlineAgent")}
            value={transferAgentId || undefined} onChange={onTransferAgentIdChange}
            options={onlineAgents.map((a) => ({ value: a.agentId, label: `${a.displayName} (${a.activeConversations})` }))}
          />
          <Button block onClick={onTransfer} loading={saving} disabled={!transferAgentId}>{t("aiConversations.monitor.transferToAgent")}</Button>
          <Button block danger onClick={onForceClose} loading={saving}>{t("aiConversations.monitor.forceClose")}</Button>
        </div>
      </div>

      <div style={S.rightSection}>
        <div style={S.rightTitle}>{t("aiConversations.monitor.sectionTrace", { count: detail.traces.length })}</div>
        {detail.traces.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("aiConversations.monitor.noTrace")}</Typography.Text>
        ) : (
          detail.traces.slice(0, 5).map((trace) => (
            <div key={trace.traceId} style={S.traceCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <Tag style={{ fontSize: 10, margin: 0 }}>{trace.supervisor}</Tag>
                <span style={{ fontSize: 10, color: "#bbb" }}>{trace.totalDurationMs}ms</span>
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>{t("aiConversations.monitor.skills", { value: trace.skillsCalled.length > 0 ? trace.skillsCalled.join(", ") : t("aiConversations.monitor.noSkills") })}</div>
              {trace.handoffReason ? <div style={{ fontSize: 11, color: "#d48806", marginTop: 2 }}>{t("aiConversations.monitor.handoff", { reason: trace.handoffReason })}</div> : null}
              {trace.error ? <div style={{ fontSize: 11, color: "#cf1322", marginTop: 2 }}>{t("aiConversations.monitor.error", { error: trace.error })}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
