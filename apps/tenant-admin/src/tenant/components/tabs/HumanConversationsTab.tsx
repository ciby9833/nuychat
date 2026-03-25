import dayjs from "dayjs";
import { Alert, App, Button, DatePicker, Empty, Input, Select, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  forceCloseConversation,
  getHumanConversationDetail,
  interveneConversation,
  listHumanConversations,
  listSupervisorAgents,
  transferConversation
} from "../../api";
import type { HumanConversationDetail, HumanConversationListItem, SupervisorAgentStatus } from "../../types";
import { S } from "../../modules/ai-conversations/styles";

type DatePreset = "today" | "yesterday" | "last7d" | "custom";
type Scope = "all" | "waiting" | "exception" | "active" | "resolved";

const DATE_PRESET_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last7d", label: "最近7天" },
  { value: "custom", label: "自定义" }
] as const;

const SCOPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "waiting", label: "待处理" },
  { value: "active", label: "处理中" },
  { value: "exception", label: "异常" },
  { value: "resolved", label: "已解决" }
] as const;

function formatRelativeTime(value: string | null): string {
  if (!value) return "-";
  const target = dayjs(value);
  const diffMinutes = Math.abs(dayjs().diff(target, "minute"));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.abs(dayjs().diff(target, "hour"));
  if (diffHours < 24) return `${diffHours}小时前`;
  return target.format("MM-DD HH:mm");
}

function formatDateLabel(value: string): string {
  return dayjs(value).format("YYYY/MM/DD");
}

function formatTime(value: string): string {
  return dayjs(value).format("HH:mm:ss");
}

function isSameDay(a: string, b: string): boolean {
  return dayjs(a).isSame(dayjs(b), "day");
}

function statusColor(item: HumanConversationListItem): string {
  if (item.currentExceptionReason) return "high";
  if (item.waitingSeconds >= 300) return "attention";
  return "normal";
}

export function HumanConversationsTab() {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<HumanConversationListItem[]>([]);
  const [agents, setAgents] = useState<SupervisorAgentStatus[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<Scope>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([dayjs(), dayjs()]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [detail, setDetail] = useState<HumanConversationDetail | null>(null);
  const [interveneText, setInterveneText] = useState("");
  const [transferAgentId, setTransferAgentId] = useState<string>("");
  const [error, setError] = useState("");
  const selectedConversationRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("tenant-admin.human-conversations.intent");
    if (!raw) return;
    window.sessionStorage.removeItem("tenant-admin.human-conversations.intent");
    try {
      const parsed = JSON.parse(raw) as {
        conversationId?: string;
        scope?: Scope;
      };
      if (parsed.scope) setSelectedScope(parsed.scope);
      if (parsed.conversationId) setSelectedConversationId(parsed.conversationId);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const loadList = useCallback(async (keepSelection = true, preferredConversationId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [conversationData, supervisorAgents] = await Promise.all([
        listHumanConversations({
          agentId: selectedAgentId !== "all" ? selectedAgentId : undefined,
          scope: selectedScope,
          datePreset,
          from: datePreset === "custom" ? customRange[0]?.format("YYYY-MM-DD") : undefined,
          to: datePreset === "custom" ? customRange[1]?.format("YYYY-MM-DD") : undefined,
          page: 1,
          pageSize: 100
        }),
        listSupervisorAgents()
      ]);
      setItems(conversationData.items);
      setAgents(supervisorAgents);

      const currentId = preferredConversationId ?? selectedConversationRef.current;
      const nextId =
        keepSelection && currentId && conversationData.items.some((item) => item.conversationId === currentId)
          ? currentId
          : (selectedConversationRef.current && conversationData.items.some((item) => item.conversationId === selectedConversationRef.current)
            ? selectedConversationRef.current
            : (conversationData.items[0]?.conversationId ?? ""));
      setSelectedConversationId(nextId);
    } catch (err) {
      setError(`加载人工会话失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [customRange, datePreset, selectedAgentId, selectedScope]);

  const loadDetail = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const next = await getHumanConversationDetail(conversationId);
      setDetail(next);
      setTransferAgentId(next.conversation.assignedAgentId ?? "");
    } catch (err) {
      message.error(`加载会话详情失败: ${(err as Error).message}`);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadList(false); }, [loadList]);
  useEffect(() => { void loadDetail(selectedConversationId); }, [loadDetail, selectedConversationId]);

  const currentItem = useMemo(
    () => items.find((item) => item.conversationId === selectedConversationId) ?? null,
    [items, selectedConversationId]
  );
  const renderMessages = useMemo(
    () => detail?.messages.filter((msg) => !(msg.messageType === "reaction" && msg.reactionTargetMessageId)) ?? [],
    [detail?.messages]
  );
  const reactionsByTarget = useMemo(() => {
    const grouped = new Map<string, Array<{ emoji: string; count: number }>>();
    for (const msg of detail?.messages ?? []) {
      if (msg.messageType !== "reaction" || !msg.reactionTargetMessageId || !msg.reactionEmoji) continue;
      const current = grouped.get(msg.reactionTargetMessageId) ?? [];
      const existing = current.find((item) => item.emoji === msg.reactionEmoji);
      if (existing) existing.count += 1;
      else current.push({ emoji: msg.reactionEmoji, count: 1 });
      grouped.set(msg.reactionTargetMessageId, current);
    }
    return grouped;
  }, [detail?.messages]);

  const summary = useMemo(() => ({
    total: items.length,
    waiting: items.filter((item) => item.waitingSeconds > 0 && !item.hasFirstResponse).length,
    resolved: items.filter((item) => item.conversationStatus === "resolved" || item.conversationStatus === "closed").length
  }), [items]);

  const onlineAgents = useMemo(
    () => agents.filter((agent) => agent.status === "online" || agent.status === "busy"),
    [agents]
  );
  const isEndedConversation =
    detail?.conversation.status === "resolved" ||
    detail?.conversation.status === "closed" ||
    detail?.conversation.caseStatus === "resolved" ||
    detail?.conversation.caseStatus === "closed";

  const handleIntervene = useCallback(async () => {
    if (!selectedConversationId || !interveneText.trim()) {
      message.warning("请输入要发送给客户的内容");
      return;
    }
    setSaving(true);
    try {
      await interveneConversation(selectedConversationId, interveneText.trim());
      setInterveneText("");
      message.success("人工消息已发送");
      await loadDetail(selectedConversationId);
      await loadList(true, selectedConversationId);
    } catch (err) {
      message.error(`发送失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [interveneText, loadDetail, loadList, selectedConversationId]);

  const handleTransfer = useCallback(async () => {
    if (!selectedConversationId || !transferAgentId) {
      message.warning("请选择目标人工坐席");
      return;
    }
    setSaving(true);
    try {
      await transferConversation(selectedConversationId, transferAgentId);
      message.success("会话已转给人工坐席");
      await loadDetail(selectedConversationId);
      await loadList(true, selectedConversationId);
    } catch (err) {
      message.error(`转接失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [loadDetail, loadList, selectedConversationId, transferAgentId]);

  const handleForceClose = useCallback(async () => {
    if (!selectedConversationId) return;
    modal.confirm({
      title: "确认强制关闭会话？",
      content: "该操作会直接结束当前会话/事项，并清空当前处理状态。此操作通常只用于异常处理。",
      okText: "确认关闭",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        setSaving(true);
        try {
          await forceCloseConversation(selectedConversationId, "closed from human conversation manager");
          message.success("会话已强制关闭");
          await loadDetail(selectedConversationId);
          await loadList(true, selectedConversationId);
        } catch (err) {
          message.error(`关闭失败: ${(err as Error).message}`);
        } finally {
          setSaving(false);
        }
      }
    });
  }, [loadDetail, loadList, message, modal, selectedConversationId]);

  return (
    <div style={S.root}>
      {error ? <Alert type="error" showIcon message={error} style={{ margin: 8, borderRadius: 8 }} /> : null}

      <div style={S.filterBar}>
        <Select
          size="small"
          style={{ width: 180 }}
          value={selectedScope}
          onChange={(value) => setSelectedScope(value as Scope)}
          options={SCOPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Select
          size="small"
          style={{ width: 220 }}
          value={selectedAgentId}
          onChange={setSelectedAgentId}
          options={[{ value: "all", label: "全部人工坐席" }, ...agents.map((agent) => ({ value: agent.agentId, label: agent.displayName }))]}
        />
        <Select
          size="small"
          style={{ width: 110 }}
          value={datePreset}
          onChange={(value) => setDatePreset(value as DatePreset)}
          options={DATE_PRESET_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        {datePreset === "custom" ? (
          <DatePicker.RangePicker
            size="small"
            value={customRange}
            onChange={(value) => setCustomRange(value as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
            allowClear={false}
          />
        ) : null}
        <Button size="small" onClick={() => void loadList(false)} loading={loading}>刷新</Button>
        <div style={S.filterRight}>
          <span>会话 {summary.total}</span>
          <span style={{ color: "#d48806" }}>待接手 {summary.waiting}</span>
          <span style={{ color: "#52c41a" }}>已解决 {summary.resolved}</span>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.leftCol}>
          <div style={S.listHeader}>
            <span>人工会话</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: "#bbb" }}>{items.length} 条</span>
          </div>
          <div style={S.listScroll}>
            {items.length === 0 && !loading ? (
              <div style={{ padding: 40, textAlign: "center" }}><Empty description="暂无人工会话" /></div>
            ) : null}
            {items.map((item) => {
              const isSelected = item.conversationId === selectedConversationId;
              const initial = (item.customerName ?? item.customerRef ?? "?").slice(0, 1).toUpperCase();
              return (
                <div
                  key={item.conversationId}
                  style={S.listItem(isSelected)}
                  onClick={() => setSelectedConversationId(item.conversationId)}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f0f5ff"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={S.avatar(statusColor(item))}>{initial}</div>
                  <div style={S.listInfo}>
                    <div style={S.listRow}>
                      <span style={S.listName}>{item.customerName ?? item.customerRef ?? "匿名客户"}</span>
                      <span style={S.listTime}>{formatRelativeTime(item.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={S.listPreview}>{item.lastMessagePreview ?? item.caseTitle ?? "暂无消息"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                      {item.channelType ? <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.channelType.toUpperCase()}</Tag> : null}
                      {item.caseId ? <Tag color="blue" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>事项 {item.caseId.slice(0, 8)}</Tag> : null}
                      {item.currentResponsibleName ? <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>{item.currentResponsibleName}</Tag> : null}
                      {item.currentExceptionReason ? <Tag color="red" style={{ fontSize: 10, lineHeight: "16px", margin: 0, padding: "0 4px" }}>异常</Tag> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!detail || !currentItem ? (
          <div style={S.midCol}>
            <div style={S.chatEmpty}>
              <span style={{ fontSize: 40 }}>💬</span>
              <span>选择左侧会话查看详情</span>
            </div>
          </div>
        ) : (
          <div style={S.midCol}>
            <div style={S.chatHeader}>
              <div style={S.chatHeaderAvatar}>
                {(detail.conversation.customerName ?? detail.conversation.customerRef ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{detail.conversation.customerName ?? detail.conversation.customerRef ?? "匿名客户"}</div>
                <div style={{ fontSize: 11, color: "#8c8c8c" }}>
                  {(detail.conversation.channelType ?? "").toUpperCase()} · {detail.conversation.customerLanguage ?? "未知"} · {detail.conversation.caseTitle ?? "未命名事项"}
                </div>
              </div>
              <Space size={4}>
                {detail.conversation.caseStatus ? <Tag color="blue">{detail.conversation.caseStatus}</Tag> : null}
                {detail.conversation.queueStatus ? <Tag color="gold">{detail.conversation.queueStatus}</Tag> : null}
                {detail.conversation.currentOwnerName ? <Tag color="green">{detail.conversation.currentOwnerName}</Tag> : null}
              </Space>
            </div>

            {detail.conversation.caseSummary ? (
              <Alert type="info" showIcon message={detail.conversation.caseSummary} style={{ margin: "0 16px", marginTop: 8, borderRadius: 8 }} />
            ) : null}

            <div style={S.chatScroll}>
              {detailLoading ? (
                <div style={S.chatEmpty}><span>加载中…</span></div>
              ) : detail.messages.length === 0 ? (
                <div style={S.chatEmpty}><span style={{ fontSize: 32 }}>📭</span><span>暂无消息记录</span></div>
              ) : (
                renderMessages.map((msg, index) => {
                  const isOut = msg.direction === "outbound";
                  const previous = index > 0 ? renderMessages[index - 1] : null;
                  const showDate = !previous || !isSameDay(previous.createdAt, msg.createdAt);
                  const isAI = msg.senderType === "ai";
                  const attrColor = isAI ? "#52c41a" : msg.senderType === "agent" ? "#1677ff" : "#8c8c8c";
                  return (
                    <div key={msg.messageId}>
                      {showDate ? (
                        <div style={S.dateSep}>
                          <span style={{ background: "#e8e8e8", padding: "2px 12px", borderRadius: 10, fontSize: 11 }}>
                            {formatDateLabel(msg.createdAt)}
                          </span>
                        </div>
                      ) : null}
                      <div style={S.msgRow(isOut)}>
                        {msg.senderType !== "customer" ? (
                          <div style={{ ...S.msgAttr(isAI), color: attrColor }}>
                            {msg.senderName ?? (isAI ? "AI" : "人工")}
                          </div>
                        ) : null}
                        <div style={S.msgBubbleWrap(isOut)}>
                          <div style={S.msgBubble(isOut, msg.senderType)}>
                            {msg.replyToPreview ? (
                              <div style={S.replyPreview(isOut)}>
                                <div style={S.replyLabel(isOut)}>回复</div>
                                <div style={S.replyText(isOut)}>{msg.replyToPreview}</div>
                              </div>
                            ) : null}
                            {msg.preview}
                          </div>
                          {(reactionsByTarget.get(msg.messageId)?.length ?? 0) > 0 ? (
                            <div style={S.reactionStack(isOut)}>
                              {reactionsByTarget.get(msg.messageId)!.map((reaction) => (
                                <span key={`${msg.messageId}-${reaction.emoji}`} style={S.reactionChip}>
                                  <span>{reaction.emoji}</span>
                                  {reaction.count > 1 ? <span style={S.reactionCount}>{reaction.count}</span> : null}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div style={S.msgTime}>{formatTime(msg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {!detail || !currentItem ? (
          <div style={S.rightCol}>
            <div style={{ ...S.chatEmpty, padding: 40 }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <span>选择会话查看管理信息</span>
            </div>
          </div>
        ) : (
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
                onChange={(e) => setInterveneText(e.target.value)}
                placeholder="输入消息直接发送给客户…"
                style={{ marginBottom: 8, borderRadius: 8 }}
                disabled={Boolean(isEndedConversation)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleIntervene();
                  }
                }}
              />
              <Button type="primary" block onClick={() => void handleIntervene()} loading={saving} disabled={!interveneText.trim() || Boolean(isEndedConversation)}>
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
                  onChange={setTransferAgentId}
                  disabled={Boolean(isEndedConversation)}
                  options={onlineAgents.map((agent) => ({
                    value: agent.agentId,
                    label: `${agent.displayName} (${agent.activeConversations})`
                  }))}
                />
                <Button block onClick={() => void handleTransfer()} loading={saving} disabled={!transferAgentId || Boolean(isEndedConversation)}>转给人工坐席</Button>
                <Button block danger onClick={() => void handleForceClose()} loading={saving} disabled={Boolean(isEndedConversation)}>强制关闭会话</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
