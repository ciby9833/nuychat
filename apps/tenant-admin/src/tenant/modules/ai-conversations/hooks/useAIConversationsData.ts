// 作用: AI 会话监控数据加载、筛选状态与操作 hook
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

import dayjs from "dayjs";
import { message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  forceCloseConversation,
  getAIConversationDetail,
  interveneConversation,
  listAIConversations,
  listSupervisorAgents,
  listTenantAIAgents,
  transferConversation
} from "../../../api";
import type { AIConversationDetail, AIConversationListItem, SupervisorAgentStatus, TenantAIAgent } from "../../../types";
import { sortAIConversations } from "../helpers";
import type { DatePreset, RangeValue } from "../types";

export function useAIConversationsData() {
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiAgents, setAiAgents] = useState<TenantAIAgent[]>([]);
  const [agents, setAgents] = useState<SupervisorAgentStatus[]>([]);
  const [items, setItems] = useState<AIConversationListItem[]>([]);
  const [selectedAiAgentId, setSelectedAiAgentId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<RangeValue>([dayjs(), dayjs()]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [detail, setDetail] = useState<AIConversationDetail | null>(null);
  const [interveneText, setInterveneText] = useState("");
  const [transferAgentId, setTransferAgentId] = useState<string>("");
  const [error, setError] = useState("");
  const selectedConversationRef = useRef("");

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const loadList = useCallback(async (keepSelection = true, preferredConversationId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [aiAgentData, conversationData, supervisorAgents] = await Promise.all([
        listTenantAIAgents(),
        listAIConversations({
          aiAgentId: selectedAiAgentId !== "all" ? selectedAiAgentId : undefined,
          status: selectedStatus !== "all" ? selectedStatus : undefined,
          datePreset,
          from: datePreset === "custom" ? customRange?.[0]?.format("YYYY-MM-DD") : undefined,
          to: datePreset === "custom" ? customRange?.[1]?.format("YYYY-MM-DD") : undefined
        }),
        listSupervisorAgents()
      ]);
      const activeAiAgents = aiAgentData.items.filter((a) => a.status === "active");
      setAiAgents(activeAiAgents);
      setItems(sortAIConversations(conversationData.items));
      setAgents(supervisorAgents);

      const currentId = preferredConversationId ?? selectedConversationRef.current;
      const nextId =
        keepSelection && currentId && conversationData.items.some((c) => c.conversationId === currentId)
          ? currentId
          : (conversationData.items[0]?.conversationId ?? "");
      setSelectedConversationId(nextId);
    } catch (err) {
      setError(`加载 AI 会话失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [customRange, datePreset, selectedAiAgentId, selectedStatus]);

  const loadDetail = useCallback(async (conversationId: string) => {
    if (!conversationId) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      const next = await getAIConversationDetail(conversationId);
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

  const summary = useMemo(() => {
    const handoff = items.filter((c) => c.handoffRequired).length;
    const transferred = items.filter((c) => c.currentHandlerType === "human").length;
    return { total: items.length, handoff, transferred };
  }, [items]);

  const currentItem = useMemo(
    () => items.find((c) => c.conversationId === selectedConversationId) ?? null,
    [items, selectedConversationId]
  );

  const handleIntervene = async () => {
    if (!selectedConversationId || !interveneText.trim()) { message.warning("请输入要发送给客户的内容"); return; }
    setSaving(true);
    try {
      await interveneConversation(selectedConversationId, interveneText.trim());
      setInterveneText("");
      message.success("人工介入消息已入队");
      await loadDetail(selectedConversationId);
      await loadList(true, selectedConversationId);
    } catch (err) { message.error(`介入失败: ${(err as Error).message}`); } finally { setSaving(false); }
  };

  const handleTransfer = async () => {
    if (!selectedConversationId || !transferAgentId) { message.warning("请选择目标人工坐席"); return; }
    setSaving(true);
    try {
      await transferConversation(selectedConversationId, transferAgentId);
      message.success("会话已转给人工坐席");
      await loadDetail(selectedConversationId);
      await loadList(true, selectedConversationId);
    } catch (err) { message.error(`转人工失败: ${(err as Error).message}`); } finally { setSaving(false); }
  };

  const handleForceClose = async () => {
    if (!selectedConversationId) return;
    setSaving(true);
    try {
      await forceCloseConversation(selectedConversationId, "closed from ai conversation monitor");
      message.success("会话已强制关闭");
      await loadList(false);
    } catch (err) { message.error(`关闭失败: ${(err as Error).message}`); } finally { setSaving(false); }
  };

  const onlineAgents = agents.filter((a) => a.status === "online" || a.status === "busy");

  return {
    loading, detailLoading, saving, error,
    aiAgents, agents, onlineAgents, items, detail, summary, currentItem,
    selectedAiAgentId, setSelectedAiAgentId,
    selectedStatus, setSelectedStatus,
    datePreset, setDatePreset,
    customRange, setCustomRange,
    selectedConversationId, setSelectedConversationId,
    interveneText, setInterveneText,
    transferAgentId, setTransferAgentId,
    loadList, handleIntervene, handleTransfer, handleForceClose
  };
}
