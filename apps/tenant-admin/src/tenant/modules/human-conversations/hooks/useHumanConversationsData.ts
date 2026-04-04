import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getHumanConversationDetail, listHumanConversations, listSupervisorAgents } from "../../../api";
import type { DatePreset, HumanConversationDetail, HumanConversationListItem, Scope, SupervisorAgentStatus } from "../types";

export function useHumanConversationsData() {
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<HumanConversationListItem[]>([]);
  const [agents, setAgents] = useState<SupervisorAgentStatus[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [selectedScope, setSelectedScope] = useState<Scope>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([dayjs(), dayjs()]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [detail, setDetail] = useState<HumanConversationDetail | null>(null);
  const [interveneText, setInterveneText] = useState("");
  const [transferAgentId, setTransferAgentId] = useState("");
  const [error, setError] = useState("");
  const selectedConversationRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("tenant-admin.human-conversations.intent");
    if (!raw) return;
    window.sessionStorage.removeItem("tenant-admin.human-conversations.intent");
    try {
      const parsed = JSON.parse(raw) as { conversationId?: string; scope?: Scope };
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
          : currentId
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
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  useEffect(() => {
    void loadDetail(selectedConversationId);
  }, [loadDetail, selectedConversationId]);

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

  return {
    loading,
    detailLoading,
    saving,
    items,
    agents,
    selectedAgentId,
    selectedScope,
    datePreset,
    customRange,
    selectedConversationId,
    detail,
    interveneText,
    transferAgentId,
    error,
    currentItem,
    renderMessages,
    reactionsByTarget,
    summary,
    onlineAgents,
    isEndedConversation,
    setSaving,
    setSelectedAgentId,
    setSelectedScope,
    setDatePreset,
    setCustomRange,
    setSelectedConversationId,
    setInterveneText,
    setTransferAgentId,
    setError,
    loadList,
    loadDetail
  };
}
