/**
 * 菜单路径与名称: 座席工作台 / 工作台主页 / 会话与技能辅助状态管理
 * 文件职责: 负责会话列表、详情、消息、技能推荐、技能辅助卡片、工单草稿与工作台交互状态。
 * 主要交互文件:
 * - ../pages/DashboardPage.tsx: 消费整个工作台视图模型。
 * - ../components/TimelinePanel.tsx: 消费技能辅助、消息时间线和手动技能执行状态。
 * - ../components/MessageComposer.tsx: 消费自动技能辅助卡片并插入回复。
 * - ../components/SkillAssistCard.tsx: 展示本 hook 产出的技能辅助数据。
 * - ../api.ts: 提供会话、消息、技能辅助、工单等接口。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import i18next from "i18next";

import {
  apiFetch,
  apiPut,
  apiPost,
  getWaWorkbenchRuntime,
  getWaWorkbenchSummary,
  getConversationMessage,
  getRealtimeReplay,
  markConversationRead,
  logoutSession,
  listConversationMessages,
  listConversationsPaginated,
  registerSessionUpdater,
  switchTenantSession,
  unregisterSessionUpdater,
  listConversationTickets,
  listMyTasks,
  addConversationTaskComment,
  getConversationTaskDetail,
  createConversationTicket,
  patchTicket,
  executeSkill as apiExecuteSkill,
  listConversationAiTraces,
  listConversationSkillSchemas,
  getConversationCustomer360,
  listColleagues,
  transferConversation,
  uploadFile,
  requestConversationSkillAssist
} from "../api";
import { API_BASE_URL } from "../api";
import { readSession, writeSession } from "../session";
import type {
  AgentColleague,
  Customer360Data,
  ConversationDetail,
  ConversationItem,
  ConversationSkillRecommendationResponse,
  CopilotData,
  MessageItem,
  MessageAttachment,
  PaginatedMessagesResponse,
  MyTaskListItem,
  LeftPanelMode,
  RightTab,
  SideView,
  Session,
  TicketDetail,
  Ticket,
  SkillExecuteResult,
  ComposerSkillAssist,
  AiTrace,
  SkillSchema,
  ConversationViewSummaries
} from "../types";

const EMPTY_VIEW_SUMMARIES: ConversationViewSummaries = {
  all: { totalConversations: 0, unreadMessages: 0, unreadConversations: 0 },
  mine: { totalConversations: 0, unreadMessages: 0, unreadConversations: 0 },
  follow_up: { totalConversations: 0, unreadMessages: 0, unreadConversations: 0 }
};

function clampUnreadSummary(
  summary: ConversationViewSummaries,
  deltaMessages: number,
  deltaConversations: number
): ConversationViewSummaries {
  return {
    all: {
      ...summary.all,
      unreadMessages: Math.max(0, summary.all.unreadMessages + deltaMessages),
      unreadConversations: Math.max(0, summary.all.unreadConversations + deltaConversations)
    },
    mine: {
      ...summary.mine,
      unreadMessages: Math.max(0, summary.mine.unreadMessages + deltaMessages),
      unreadConversations: Math.max(0, summary.mine.unreadConversations + deltaConversations)
    },
    follow_up: {
      ...summary.follow_up,
      unreadMessages: Math.max(0, summary.follow_up.unreadMessages + deltaMessages),
      unreadConversations: Math.max(0, summary.follow_up.unreadConversations + deltaConversations)
    }
  };
}

export function useWorkspaceDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const isLoggedIn = !!session?.accessToken;
  const sessionRef = useRef(session);

  const tenantId = session?.tenantId ?? "";
  const tenantSlug = session?.tenantSlug ?? "";
  const agentId = session?.agentId ?? null;
  const seatEnabled = Boolean(agentId);
  const waSeatEnabled = Boolean(session?.waSeatEnabled);
  const [waRuntimeAvailable, setWaRuntimeAvailable] = useState(false);
  const [waRuntimeChecked, setWaRuntimeChecked] = useState(!session?.waSeatEnabled);
  const [waUnreadMessages, setWaUnreadMessages] = useState(0);
  const memberships = session?.memberships ?? [];
  const workspaceMemberships = memberships.filter((membership) => membership.agentId || membership.waSeatEnabled);

  // ── selectedIdRef: always reflects latest selectedId without forcing socket teardown ──
  const selectedIdRef = useRef<string | null>(null);
  const effectiveViewRef = useRef<SideView>("all");
  const loadConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const loadMyTasksRef = useRef<(() => Promise<void>) | null>(null);
  const lastActivityPostAtRef = useRef(0);
  const lastRealtimeEventIdRef = useRef<string | null>(
    typeof window !== "undefined" ? window.sessionStorage.getItem("nuychat.lastRealtimeEventId") : null
  );
  const waUnreadRefreshTimerRef = useRef<number | null>(null);
  const waConversationUnreadRef = useRef<Map<string, number>>(new Map());

  const [socketStatus, setSocketStatus] = useState("connecting");
  const [view, setView] = useState<SideView>("all");
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>("conversations");
  const [rightTab, setRightTab] = useState<RightTab>("copilot");
  const [searchText, setSearchText] = useState("");
  const [taskSearchText, setTaskSearchText] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "vip" | "premium" | "standard">("all");

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [viewSummaries, setViewSummaries] = useState<ConversationViewSummaries>(EMPTY_VIEW_SUMMARIES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUnreadAnchorCount, setSelectedUnreadAnchorCount] = useState(0);
  const [selectedUnreadAnchorMessageId, setSelectedUnreadAnchorMessageId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const oldestMessageCursorRef = useRef<string | null>(null);
  const [copilot, setCopilot] = useState<CopilotData | null>(null);
  const [skillRecommendation, setSkillRecommendation] = useState<ConversationSkillRecommendationResponse | null>(null);
  const [reply, setReply] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewHint, setViewHint] = useState<string>("");

  // ── Tickets ─────────────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketDetailsById, setTicketDetailsById] = useState<Record<string, TicketDetail>>({});
  const [ticketLoading, setTicketLoading] = useState(false);
  const [myTasks, setMyTasks] = useState<MyTaskListItem[]>([]);
  const [myTasksLoading, setMyTasksLoading] = useState(false);
  const [taskDraft, setTaskDraft] = useState<{ sourceMessageId: string | null; sourceMessagePreview: string | null } | null>(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState<Array<"open" | "in_progress" | "done" | "cancelled">>(["open", "in_progress"]);
  const [taskCustomerSearchText, setTaskCustomerSearchText] = useState("");
  const [taskRecentDays, setTaskRecentDays] = useState(3);

  // ── Skill execute ────────────────────────────────────────────────────────────
  const [skillExecuting, setSkillExecuting] = useState<string | null>(null);
  const [lastSkillResult, setLastSkillResult] = useState<SkillExecuteResult | null>(null);
  const [composerSkillAssist, setComposerSkillAssist] = useState<ComposerSkillAssist | null>(null);
  const autoSkillLookupKeyRef = useRef<string | null>(null);
  const autoSkillLookupAttemptsRef = useRef<Map<string, number>>(new Map());
  const [composerAiSuggestions, setComposerAiSuggestions] = useState<string[]>([]);

  // ── AI Traces ────────────────────────────────────────────────────────────────
  const [aiTraces, setAiTraces] = useState<AiTrace[]>([]);
  const [customer360, setCustomer360] = useState<Customer360Data | null>(null);

  // ── Skill schemas ─────────────────────────────────────────────────────────
  const [skillSchemas, setSkillSchemas] = useState<SkillSchema[]>([]);

  // ── Colleagues (for transfer dialog) ────────────────────────────────────
  const [colleagues, setColleagues] = useState<AgentColleague[]>([]);

  const effectiveView: SideView = view === "mine" && !agentId ? "all" : view;

  useEffect(() => {
    if (!session?.waSeatEnabled) {
      setWaRuntimeAvailable(false);
      setWaRuntimeChecked(true);
      setWaUnreadMessages(0);
      return;
    }
    setWaRuntimeChecked(false);
    let cancelled = false;
    void getWaWorkbenchRuntime(session)
      .then((runtime) => {
        if (!cancelled) {
          setWaRuntimeAvailable(Boolean(runtime.available));
          setWaRuntimeChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWaRuntimeAvailable(false);
          setWaRuntimeChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const refreshWaUnreadMessages = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession?.waSeatEnabled) {
      setWaUnreadMessages(0);
      return;
    }
    try {
      const summary = await getWaWorkbenchSummary(currentSession);
      setWaUnreadMessages(Number(summary.totalUnreadMessages ?? 0));
    } catch {
      setWaUnreadMessages(0);
    }
  }, []);

  const scheduleWaUnreadRefresh = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession?.waSeatEnabled) return;
    if (waUnreadRefreshTimerRef.current !== null) return;
    waUnreadRefreshTimerRef.current = window.setTimeout(() => {
      waUnreadRefreshTimerRef.current = null;
      void refreshWaUnreadMessages();
    }, 300);
  }, [refreshWaUnreadMessages]);

  const loadConversations = useCallback(async () => {
    if (!session || !seatEnabled) {
      setConversations([]);
      setViewSummaries(EMPTY_VIEW_SUMMARIES);
      setHasMoreConversations(false);
      oldestCursorRef.current = null;
      return;
    }
    loadingRef.current = true;
    setConversationsLoading(true);
    try {
      const data = await listConversationsPaginated(session, { view: effectiveView });
      const items = data.conversations.map(mapConversationRow);
      setConversations(items);
      setViewSummaries(data.viewSummaries ?? EMPTY_VIEW_SUMMARIES);
      setHasMoreConversations(data.hasMore);
      oldestCursorRef.current = data.nextCursor;
    } catch {
      setConversations([]);
      setViewSummaries(EMPTY_VIEW_SUMMARIES);
      setHasMoreConversations(false);
      oldestCursorRef.current = null;
    } finally {
      loadingRef.current = false;
      setConversationsLoading(false);
    }
  }, [effectiveView, seatEnabled, session]);

  loadConversationsRef.current = loadConversations;

  const rememberRealtimeEventId = useCallback((eventId?: string | null) => {
    if (!eventId) return;
    lastRealtimeEventIdRef.current = eventId;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nuychat.lastRealtimeEventId", eventId);
    }
  }, []);

  const clearConversationUnreadLocal = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const target = prev.find((item) => item.conversationId === conversationId);
      const unreadBefore = target?.unreadCount ?? 0;
      if (unreadBefore <= 0) return prev;
      setViewSummaries((current) => clampUnreadSummary(current, -unreadBefore, -1));
      return prev.map((item) => (
        item.conversationId === conversationId
          ? { ...item, unreadCount: 0 }
          : item
      ));
    });
  }, []);

  const syncConversationReadIfVisible = useCallback(async (conversationId: string) => {
    if (!sessionRef.current) return;
    if (document.hidden) return;
    try {
      await markConversationRead(conversationId, sessionRef.current);
      clearConversationUnreadLocal(conversationId);
    } catch {
      // noop
    }
  }, [clearConversationUnreadLocal]);

  const loadMoreConversations = useCallback(async () => {
    if (!session || !seatEnabled || loadingRef.current) return;
    const cursor = oldestCursorRef.current;
    if (!cursor) return; // null cursor means no more pages
    loadingRef.current = true;
    setConversationsLoading(true);
    try {
      const data = await listConversationsPaginated(session, { view: effectiveView, before: cursor });
      const items = data.conversations.map(mapConversationRow);
      setViewSummaries(data.viewSummaries ?? EMPTY_VIEW_SUMMARIES);
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.conversationId));
        const newOnes = items.filter((c) => !existingIds.has(c.conversationId));
        return [...prev, ...newOnes];
      });
      setHasMoreConversations(data.hasMore);
      oldestCursorRef.current = data.nextCursor;
    } catch {
      // keep existing data on error
    } finally {
      loadingRef.current = false;
      setConversationsLoading(false);
    }
  }, [effectiveView, seatEnabled, session]);

  const loadDetail = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const r = await apiFetch<Record<string, unknown>>(`/api/conversations/${id}`, session);
      setDetail({
        ...readClientMeta(r.customer_metadata),
        conversationId: String(r.conversation_id),
        caseId: (r.case_id as string | null | undefined) ?? null,
        caseStatus: (r.case_status as string | null | undefined) ?? null,
        caseType: (r.case_type as string | null | undefined) ?? null,
        caseTitle: (r.case_title as string | null | undefined) ?? null,
        caseSummary: (r.case_summary as string | null | undefined) ?? null,
        caseOpenedAt: (r.case_opened_at as string | null | undefined) ?? null,
        caseLastActivityAt: (r.case_last_activity_at as string | null | undefined) ?? null,
        channelType: String(r.channel_type),
        channelId: String(r.channel_id ?? ""),
        status: String(r.status ?? "open"),
        operatingMode: String(r.operating_mode ?? "ai_first"),
        customerId: String(r.customer_id ?? ""),
        customerName: (r.customer_name as string | null) ?? null,
        customerTier: String(r.customer_tier ?? "standard"),
        customerLanguage: String(r.customer_language ?? "id"),
        customerRef: String(r.customer_ref ?? ""),
        assignedAgentId: (r.assigned_agent_id as string | null | undefined) ?? null
      });
    } catch {
      setDetail(null);
    }
  }, [seatEnabled, session]);

  const appendOrReplaceMessage = useCallback((message: MessageItem) => {
    setMessages((current) => {
      const next = [...current];
      const existingIndex = next.findIndex((item) => item.message_id === message.message_id);
      if (existingIndex >= 0) {
        next[existingIndex] = message;
      } else {
        next.push(message);
      }
      next.sort((a, b) => {
        if (a.created_at !== b.created_at) {
          return a.created_at < b.created_at ? -1 : 1;
        }
        return a.message_id < b.message_id ? -1 : 1;
      });
      return next;
    });
  }, []);

  const replaceMessageStatus = useCallback((messageId: string, patch: Partial<MessageItem>) => {
    setMessages((current) => current.map((message) => (
      message.message_id === messageId ? { ...message, ...patch } : message
    )));
  }, []);

  const applyMessagesPage = useCallback((page: PaginatedMessagesResponse, mode: "replace" | "prepend") => {
    oldestMessageCursorRef.current = page.nextBefore;
    setMessagesHasMore(page.hasMore);
    if (mode === "replace") {
      setSelectedUnreadAnchorMessageId(page.unreadAnchorMessageId ?? null);
      setSelectedUnreadAnchorCount(page.unreadCountSnapshot ?? 0);
    }
    setMessages((current) => {
      if (mode === "replace") {
        return page.items;
      }
      const seen = new Set(current.map((item) => item.message_id));
      const older = page.items.filter((item) => !seen.has(item.message_id));
      return [...older, ...current];
    });
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    setMessagesLoading(true);
    try {
      const page = await listConversationMessages(id, session, { limit: 40 });
      applyMessagesPage(page, "replace");
    } catch {
      setMessages([]);
      setMessagesHasMore(false);
      oldestMessageCursorRef.current = null;
    } finally {
      setMessagesLoading(false);
    }
  }, [applyMessagesPage, seatEnabled, session]);

  const loadOlderMessages = useCallback(async () => {
    if (!session || !seatEnabled || !selectedId || messagesLoadingMore) return;
    const before = oldestMessageCursorRef.current;
    if (!before) return;
    setMessagesLoadingMore(true);
    try {
      const page = await listConversationMessages(selectedId, session, { before, limit: 50 });
      applyMessagesPage(page, "prepend");
    } finally {
      setMessagesLoadingMore(false);
    }
  }, [applyMessagesPage, messagesLoadingMore, seatEnabled, selectedId, session]);

  const fetchAndMergeMessage = useCallback(async (conversationId: string, messageId: string) => {
    if (!session || !seatEnabled) return;
    try {
      const message = await getConversationMessage(conversationId, messageId, session);
      appendOrReplaceMessage(message);
    } catch {
      // noop
    }
  }, [appendOrReplaceMessage, seatEnabled, session]);

  const loadCopilot = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await apiFetch<CopilotData>(`/api/conversations/${id}/copilot`, session);
      setCopilot(data);
      setComposerAiSuggestions(data.suggestions ?? []);
    } catch {
      setCopilot(null);
      setComposerAiSuggestions([]);
    }
  }, [seatEnabled, session]);

  const loadSkillRecommendation = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await apiFetch<ConversationSkillRecommendationResponse>(`/api/conversations/${id}/skills/recommendations?actor=agent`, session);
      setSkillRecommendation(data);
    } catch {
      setSkillRecommendation(null);
    }
  }, [seatEnabled, session]);

  const loadTickets = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await listConversationTickets(id, session);
      setTickets(data.tickets);
      const details = await Promise.all(
        data.tickets.map(async (ticket) => {
          try {
            const detail = await getConversationTaskDetail(id, ticket.ticketId, session);
            return [ticket.ticketId, detail] as const;
          } catch {
            return null;
          }
        })
      );
      setTicketDetailsById(Object.fromEntries(details.filter((item): item is readonly [string, TicketDetail] => Boolean(item))));
    } catch {
      setTickets([]);
      setTicketDetailsById({});
    }
  }, [seatEnabled, session]);

  const refreshTicketDetail = useCallback(async (conversationId: string, ticketId: string) => {
    if (!session || !seatEnabled) return;
    try {
      const detail = await getConversationTaskDetail(conversationId, ticketId, session);
      setTicketDetailsById((prev) => ({ ...prev, [ticketId]: detail }));
    } catch {
      // noop
    }
  }, [seatEnabled, session]);

  const loadMyTasks = useCallback(async () => {
    if (!session?.agentId) {
      setMyTasks([]);
      return;
    }
    setMyTasksLoading(true);
    try {
      const createdFrom = taskRecentDays >= 9999
        ? undefined
        : new Date(Date.now() - taskRecentDays * 24 * 60 * 60 * 1000).toISOString();
      const data = await listMyTasks(session, {
        status: taskStatusFilter || undefined,
        taskSearch: taskSearchText.trim() || undefined,
        customerSearch: taskCustomerSearchText.trim() || undefined,
        createdFrom,
        limit: 100
      });
      setMyTasks(data.tasks);
    } catch {
      setMyTasks([]);
    } finally {
      setMyTasksLoading(false);
    }
  }, [session, taskCustomerSearchText, taskRecentDays, taskSearchText, taskStatusFilter]);

  loadMyTasksRef.current = loadMyTasks;

  const loadAiTraces = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await listConversationAiTraces(id, session);
      setAiTraces(data.traces);
    } catch {
      setAiTraces([]);
    }
  }, [seatEnabled, session]);

  const loadSkillSchemas = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await listConversationSkillSchemas(id, session);
      setSkillSchemas(data.schemas);
    } catch {
      setSkillSchemas([]);
    }
  }, [seatEnabled, session]);

  const loadCustomer360 = useCallback(async (id: string) => {
    if (!session || !seatEnabled) return;
    try {
      const data = await getConversationCustomer360(id, session);
      setCustomer360(data);
    } catch {
      setCustomer360(null);
    }
  }, [seatEnabled, session]);

  const loadColleagues = useCallback(async () => {
    if (!session?.agentId) return;
    try {
      const data = await listColleagues(session);
      setColleagues(data.agents);
    } catch {
      setColleagues([]);
    }
  }, [session]);

  const handleConversationUpdatedEvent = useCallback((ev: Partial<ConversationItem> & {
    eventId?: string;
    conversationId: string;
    occurredAt: string;
  }) => {
    rememberRealtimeEventId(ev.eventId);
    setConversations((prev) => {
      const existing = prev.find((c) => c.conversationId === ev.conversationId);
      if (!existing) {
        const next = {
          conversationId: ev.conversationId,
          channelType: String(ev.channelType ?? ""),
          status: String(ev.status ?? "open"),
          lastMessagePreview: ev.lastMessagePreview ?? null,
          occurredAt: ev.occurredAt,
          lastMessageAt: typeof ev.lastMessagePreview !== "undefined" ? ev.occurredAt : ev.occurredAt,
          queueStatus: ev.queueStatus,
          assignedAgentId: ev.assignedAgentId ?? null,
          unreadCount: typeof ev.unreadCount === "number" ? ev.unreadCount : 0,
          customerName: null,
          customerTier: "standard",
          customerRef: ""
        } satisfies ConversationItem;

        if (seatEnabled && shouldIncludeConversationInView(next, effectiveViewRef.current, agentId)) {
          void loadConversationsRef.current?.();
        }
        return prev;
      }

      const merged = {
        ...existing,
        ...ev,
        lastMessageAt: typeof ev.lastMessagePreview !== "undefined"
          ? ev.occurredAt
          : existing.lastMessageAt ?? existing.occurredAt
      };
      return seatEnabled ? syncConversationForView(prev, merged, effectiveViewRef.current, agentId) : prev;
    });
    if (ev.conversationId === selectedIdRef.current) {
      void loadDetail(ev.conversationId);
      if (typeof ev.unreadCount !== "number" || ev.unreadCount > 0) {
        void syncConversationReadIfVisible(ev.conversationId);
      }
    }
  }, [agentId, rememberRealtimeEventId, loadDetail, seatEnabled, syncConversationReadIfVisible]);

  const handleMessageReceivedEvent = useCallback((ev: { eventId?: string; conversationId: string; messageId?: string }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      if (ev.messageId) {
        void fetchAndMergeMessage(ev.conversationId, ev.messageId);
      }
      void loadCopilot(ev.conversationId);
      void loadSkillRecommendation(ev.conversationId);
      void syncConversationReadIfVisible(ev.conversationId);
    }
  }, [fetchAndMergeMessage, loadCopilot, loadSkillRecommendation, rememberRealtimeEventId, syncConversationReadIfVisible]);

  const handleMessageSentEvent = useCallback((ev: { eventId?: string; conversationId: string; messageId?: string }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      clearConversationUnreadLocal(ev.conversationId);
      if (ev.messageId) {
        void fetchAndMergeMessage(ev.conversationId, ev.messageId);
      }
      void loadAiTraces(ev.conversationId);
    }
  }, [clearConversationUnreadLocal, fetchAndMergeMessage, loadAiTraces, rememberRealtimeEventId]);

  const handleMessageUpdatedEvent = useCallback((ev: {
    eventId?: string;
    conversationId: string;
    messageId?: string;
    messageStatus?: string;
    occurredAt?: string;
  }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      if (ev.messageId) {
        replaceMessageStatus(ev.messageId, {
          message_status: ev.messageStatus ?? null,
          status_sent_at: ev.messageStatus === "sent" ? (ev.occurredAt ?? null) : undefined,
          status_delivered_at: ev.messageStatus === "delivered" ? (ev.occurredAt ?? null) : undefined,
          status_read_at: ev.messageStatus === "read" ? (ev.occurredAt ?? null) : undefined,
          status_failed_at: ev.messageStatus === "failed" ? (ev.occurredAt ?? null) : undefined,
          status_deleted_at: ev.messageStatus === "deleted" ? (ev.occurredAt ?? null) : undefined
        });
        void fetchAndMergeMessage(ev.conversationId, ev.messageId);
      }
    }
  }, [fetchAndMergeMessage, rememberRealtimeEventId, replaceMessageStatus]);

  const handleTaskUpdatedEvent = useCallback((ev: {
    eventId?: string;
    conversationId?: string | null;
  }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId && ev.conversationId === selectedIdRef.current) {
      void loadTickets(ev.conversationId);
    }
    void loadMyTasksRef.current?.();
  }, [loadTickets, rememberRealtimeEventId]);

  const replayRealtimeGap = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    try {
      const { events } = await getRealtimeReplay(currentSession, {
        afterEventId: lastRealtimeEventIdRef.current,
        limit: 200
      });
      for (const item of events) {
        if (item.event === "conversation.updated") {
          handleConversationUpdatedEvent(item.payload as Partial<ConversationItem> & {
            eventId?: string;
            conversationId: string;
            occurredAt: string;
          });
        } else if (item.event === "message.received") {
          handleMessageReceivedEvent(item.payload as { eventId?: string; conversationId: string; messageId?: string });
        } else if (item.event === "message.sent") {
          handleMessageSentEvent(item.payload as { eventId?: string; conversationId: string; messageId?: string });
        } else if (item.event === "message.updated") {
          handleMessageUpdatedEvent(item.payload as {
            eventId?: string;
            conversationId: string;
            messageId?: string;
            messageStatus?: string;
            occurredAt?: string;
          });
        } else if (item.event === "task.updated") {
          handleTaskUpdatedEvent(item.payload as { eventId?: string; conversationId?: string | null });
        }
      }
    } catch {
      // noop
    }
  }, [handleConversationUpdatedEvent, handleMessageReceivedEvent, handleMessageSentEvent, handleMessageUpdatedEvent, handleTaskUpdatedEvent]);

  // ── Keep selectedIdRef in sync — NEVER put selectedId in socket effect deps ──
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    effectiveViewRef.current = effectiveView;
  }, [effectiveView]);

  // ── Load conversations whenever session or view changes ──────────────────────
  // Separated from socket setup so view-switching doesn't tear down the socket.
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void refreshWaUnreadMessages();
  }, [refreshWaUnreadMessages, session?.membershipId, session?.tenantId, session?.waSeatEnabled]);

  // ── Persistent socket — only recreated when session (login/logout) changes ───
  // Uses selectedIdRef.current so handlers always see the current selection
  // without including selectedId in the dependency array.
  // Auth is a CALLBACK (not a static object) so every reconnection attempt
  // reads the latest token from sessionRef.current rather than a stale closure value.
  useEffect(() => {
    if (!session) return;

    const socket = io(API_BASE_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      auth: (cb: (data: Record<string, unknown>) => void) => {
        cb({ token: sessionRef.current?.accessToken ?? session.accessToken });
      }
    });

    socket.on("connect", () => {
      setSocketStatus("connected");
      console.debug("[WS] Socket connected, id=", socket.id);
      void replayRealtimeGap();
      if (seatEnabled) {
        void loadConversationsRef.current?.();
      }
      if (sessionRef.current?.waSeatEnabled) {
        scheduleWaUnreadRefresh();
      }
      if (seatEnabled && selectedIdRef.current) {
        void loadDetail(selectedIdRef.current);
        void loadMessages(selectedIdRef.current);
        void loadCopilot(selectedIdRef.current);
        void loadSkillRecommendation(selectedIdRef.current);
        void loadAiTraces(selectedIdRef.current);
      }
    });

    socket.on("disconnect", (reason) => {
      setSocketStatus("disconnected");
      console.debug("[WS] Socket disconnected, reason=", reason);
    });

    socket.on("connect_error", (err) => {
      setSocketStatus("error");
      console.warn("[WS] Socket connect_error:", err.message);
    });

    // Server emits this immediately after successful auth — confirms we are in the tenant room
    socket.on("connection.ready", (data: { tenantId: string | null; agentId: string | null; socketId: string }) => {
      console.debug("[WS] Connection ready:", data);
      void replayRealtimeGap();
      if (seatEnabled) {
        void loadConversationsRef.current?.();
      }
      if (sessionRef.current?.waSeatEnabled) {
        scheduleWaUnreadRefresh();
      }
    });
    socket.on("conversation.updated", handleConversationUpdatedEvent);
    socket.on("message.received", handleMessageReceivedEvent);
    socket.on("message.sent", handleMessageSentEvent);
    socket.on("message.updated", handleMessageUpdatedEvent);
    socket.on("task.updated", handleTaskUpdatedEvent);
    socket.on("wa.conversation.updated", (event: { conversation: { waConversationId: string; unreadCount: number } }) => {
      const previousUnread = waConversationUnreadRef.current.get(event.conversation.waConversationId);
      waConversationUnreadRef.current.set(event.conversation.waConversationId, event.conversation.unreadCount);
      if (previousUnread == null) return;
      if (previousUnread === event.conversation.unreadCount) return;
      scheduleWaUnreadRefresh();
    });

    return () => {
      socket.close();
    };
    // selectedId intentionally NOT in deps — use selectedIdRef.current instead.
    // loadConversations intentionally NOT in deps — has its own effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleConversationUpdatedEvent, handleMessageReceivedEvent, handleMessageSentEvent, handleMessageUpdatedEvent, handleTaskUpdatedEvent, loadAiTraces, loadCopilot, loadDetail, loadMessages, loadSkillRecommendation, replayRealtimeGap, scheduleWaUnreadRefresh, seatEnabled, session]);

  useEffect(() => {
    if (!session) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (seatEnabled) {
        void loadConversationsRef.current?.();
      }
      if (seatEnabled && selectedIdRef.current) {
        void loadDetail(selectedIdRef.current);
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [seatEnabled, session, loadDetail, loadMessages]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const postAgentActivity = useCallback(async (reason: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastActivityPostAtRef.current < 15_000) {
      return;
    }

    const currentSession = sessionRef.current;
    if (!currentSession?.agentId) return;

    lastActivityPostAtRef.current = now;
    try {
      await apiPost("/api/agent/activity", { reason }, currentSession);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    registerSessionUpdater((next) => {
      setSession(next);
      sessionRef.current = next;
    });
    return () => unregisterSessionUpdater();
  }, []);

  useEffect(() => {
    if (!seatEnabled) return;
    if (!isLoggedIn) return;
    let initialized = false;
    const tick = async () => {
      const s = sessionRef.current;
      if (!s?.agentId) return;
      try {
        if (!initialized) {
          initialized = true;
          await apiPost("/api/agent/heartbeat", { status: "online" }, s);
          return;
        }
        await apiPost("/api/agent/heartbeat", {}, s);
      } catch {
        // noop
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isLoggedIn, seatEnabled]);

  useEffect(() => {
    if (!seatEnabled) return;
    if (!isLoggedIn) return;

    const onInteractiveEvent = () => {
      if (document.hidden) return;
      void postAgentActivity("ui");
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void postAgentActivity("visible", true);
      }
    };

    window.addEventListener("mousemove", onInteractiveEvent);
    window.addEventListener("keydown", onInteractiveEvent);
    window.addEventListener("click", onInteractiveEvent);
    window.addEventListener("focus", onInteractiveEvent);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", onInteractiveEvent);
      window.removeEventListener("keydown", onInteractiveEvent);
      window.removeEventListener("click", onInteractiveEvent);
      window.removeEventListener("focus", onInteractiveEvent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isLoggedIn, postAgentActivity, seatEnabled]);

  // Load colleagues list once on login (used for transfer dialog)
  useEffect(() => {
    if (!seatEnabled) return;
    void loadColleagues();
  }, [loadColleagues, seatEnabled]);

  useEffect(() => {
    if (!seatEnabled) return;
    if (leftPanelMode !== "tasks") return;
    void loadMyTasks();
  }, [leftPanelMode, loadMyTasks, seatEnabled]);

  useEffect(() => {
    if (!seatEnabled) {
      setSelectedUnreadAnchorCount(0);
      setSelectedUnreadAnchorMessageId(null);
      setDetail(null);
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesLoading(false);
      setMessagesLoadingMore(false);
      oldestMessageCursorRef.current = null;
      setCopilot(null);
      setComposerAiSuggestions([]);
      setSkillRecommendation(null);
      setTickets([]);
      setTicketDetailsById({});
      setLastSkillResult(null);
      setAiTraces([]);
      setSkillSchemas([]);
      setCustomer360(null);
      setComposerSkillAssist(null);
      autoSkillLookupKeyRef.current = null;
      return;
    }
    if (!selectedId) {
      setSelectedUnreadAnchorCount(0);
      setSelectedUnreadAnchorMessageId(null);
      setDetail(null);
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesLoading(false);
      setMessagesLoadingMore(false);
      oldestMessageCursorRef.current = null;
      setCopilot(null);
      setComposerAiSuggestions([]);
      setSkillRecommendation(null);
      setTickets([]);
      setTicketDetailsById({});
      setLastSkillResult(null);
      setAiTraces([]);
      setSkillSchemas([]);
      setCustomer360(null);
      setComposerSkillAssist(null);
      autoSkillLookupKeyRef.current = null;
      return;
    }

    void loadDetail(selectedId);
    void loadMessages(selectedId);
    void loadSkillRecommendation(selectedId);
    void loadTickets(selectedId);
    void loadAiTraces(selectedId);
    void loadSkillSchemas(selectedId);
    void loadCustomer360(selectedId);
    void postAgentActivity("open_conversation", true);
    void syncConversationReadIfVisible(selectedId);
  }, [loadAiTraces, loadCopilot, loadCustomer360, loadDetail, loadMessages, loadSkillRecommendation, loadSkillSchemas, loadTickets, postAgentActivity, seatEnabled, selectedId, syncConversationReadIfVisible]);

  const filteredConversations = useMemo(() => {
    return conversations
      .filter((c) => {
        const q = searchText.trim().toLowerCase();
        const hitSearch =
          q.length === 0 ||
          (c.customerName ?? "").toLowerCase().includes(q) ||
          (c.customerRef ?? "").toLowerCase().includes(q) ||
          (c.lastMessagePreview ?? "").toLowerCase().includes(q);

        const tier = (c.customerTier ?? "standard").toLowerCase();
        const hitTier = tierFilter === "all" || tier === tierFilter;
        return hitSearch && hitTier;
      })
      .sort((a, b) => {
        const aUnread = a.unreadCount ?? 0;
        const bUnread = b.unreadCount ?? 0;
        if ((aUnread > 0) !== (bUnread > 0)) {
          return aUnread > 0 ? -1 : 1;
        }
        const aTime = a.lastMessageAt ?? a.occurredAt;
        const bTime = b.lastMessageAt ?? b.occurredAt;
        return aTime < bTime ? 1 : aTime > bTime ? -1 : 0;
      });
  }, [conversations, searchText, tierFilter]);

  const filteredMyTasks = useMemo(() => {
    return myTasks;
  }, [myTasks]);

  const unreadConversations = useMemo(
    () => filteredConversations.filter((conversation) => (conversation.unreadCount ?? 0) > 0),
    [filteredConversations]
  );
  const totalUnreadMessages = viewSummaries.all.unreadMessages;

  useEffect(() => {
    if (selectedId && !filteredConversations.some((c) => c.conversationId === selectedId)) {
      setSelectedUnreadAnchorCount(0);
      setSelectedUnreadAnchorMessageId(null);
      setSelectedId(filteredConversations[0]?.conversationId ?? null);
      return;
    }

    if (!selectedId && filteredConversations[0]?.conversationId) {
      setSelectedUnreadAnchorCount(0);
      setSelectedUnreadAnchorMessageId(null);
      setSelectedId(filteredConversations[0].conversationId);
    }
  }, [effectiveView, filteredConversations, selectedId]);

  const handleViewChange = useCallback((next: SideView) => {
    if (next === "mine" && !agentId) {
      setView("all");
      setViewHint("当前账号未绑定 Agent Profile，已自动切换到“全部”视图。");
      window.setTimeout(() => setViewHint(""), 3000);
      return;
    }

    setView(next);
    setViewHint("");
  }, [agentId]);

  const openTaskConversation = useCallback((task: MyTaskListItem) => {
    if (!task.conversationId) return;
    setLeftPanelMode("conversations");
    setSelectedUnreadAnchorCount(0);
    setSelectedUnreadAnchorMessageId(null);
    setSelectedId(task.conversationId);
    setRightTab("orders");
    void syncConversationReadIfVisible(task.conversationId);
  }, [syncConversationReadIfVisible]);

  const openConversation = useCallback(async (conversationId: string) => {
    setLeftPanelMode("conversations");
    setSelectedUnreadAnchorCount(0);
    setSelectedUnreadAnchorMessageId(null);
    setSelectedId(conversationId);

    void syncConversationReadIfVisible(conversationId);
  }, [syncConversationReadIfVisible]);

  const sendReply = useCallback(async (textOverride?: string) => {
    const payload = (textOverride ?? reply).trim();
    if (!session || !selectedId || (!payload && pendingAttachments.length === 0)) return;
    await postAgentActivity("reply", true);
    await apiPost(
      `/api/conversations/${selectedId}/reply`,
      {
        text: payload || undefined,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
        replyToMessageId: replyTargetMessageId ?? undefined
      },
      session
    );
    setReply("");
    setPendingAttachments([]);
    setReplyTargetMessageId(null);
    clearConversationUnreadLocal(selectedId);
  }, [clearConversationUnreadLocal, pendingAttachments, postAgentActivity, reply, replyTargetMessageId, selectedId, session]);

  const sendReaction = useCallback(async (targetMessageId: string, emoji: string) => {
    if (!session || !selectedId) return;
    await postAgentActivity("reply", true);
    await apiPost(
      `/api/conversations/${selectedId}/reply`,
      {
        reactionEmoji: emoji,
        reactionToMessageId: targetMessageId
      },
      session
    );
  }, [postAgentActivity, selectedId, session]);

  const handleUploadFiles = useCallback(async (
    files: File[],
    options?: {
      onProgress?: (fileKey: string, progress: number) => void;
      onError?: (fileKey: string, error: string) => void;
    }
  ) => {
    if (!session) return;
    const uploaded = await Promise.allSettled(files.map(async (file) => {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
      try {
        return await uploadFile(session, file, {
          onProgress: (progress) => options?.onProgress?.(fileKey, progress)
        });
      } catch (error) {
        options?.onError?.(fileKey, (error as Error).message);
        throw error;
      }
    }));
    const succeeded = uploaded
      .filter((result): result is PromiseFulfilledResult<MessageAttachment> => result.status === "fulfilled")
      .map((result) => result.value);
    if (succeeded.length > 0) {
      setPendingAttachments((current) => [...current, ...succeeded]);
    }
  }, [session]);

  const removePendingAttachment = useCallback((index: number) => {
    setPendingAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const doHandoff = useCallback(async () => {
    if (!session || !selectedId) return;
    setActionLoading("handoff");
    await postAgentActivity("handoff", true);
    await apiPost(`/api/conversations/${selectedId}/handoff`, { reason: "Agent initiated handoff" }, session);
    await Promise.all([loadDetail(selectedId), loadConversations()]);
    setActionLoading(null);
  }, [loadConversations, loadDetail, postAgentActivity, selectedId, session]);

  const doAssign = useCallback(async () => {
    if (!session || !selectedId) return;
    setActionLoading("assign");
    await postAgentActivity("assign", true);
    await apiPost(`/api/conversations/${selectedId}/assign`, {}, session);
    await Promise.all([loadDetail(selectedId), loadConversations()]);
    setActionLoading(null);
  }, [loadConversations, loadDetail, postAgentActivity, selectedId, session]);

  const doTransfer = useCallback(async (targetAgentId: string, reason = "Agent transferred conversation") => {
    if (!session || !selectedId) return;
    setActionLoading("transfer");
    try {
      await postAgentActivity("transfer", true);
      const result = await transferConversation(selectedId, targetAgentId, reason, session);
      // Update copilot with the AI snapshot returned by the transfer endpoint
      if (result.copilot) setCopilot(result.copilot);
      // Reload conversation list so my-assigned-to-me list updates
      await Promise.all([loadDetail(selectedId), loadConversations()]);
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, postAgentActivity, selectedId, session]);

  const doResolve = useCallback(async () => {
    if (!session || !selectedId) return;
    setActionLoading("resolve");
    try {
      await postAgentActivity("resolve", true);
      await apiPost(`/api/conversations/${selectedId}/resolve`, {}, session);
      await Promise.all([loadDetail(selectedId), loadConversations()]);
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, postAgentActivity, selectedId, session]);

  useEffect(() => {
    setTaskDraft(null);
  }, [selectedId]);

  useEffect(() => {
    if (!session || !selectedId) return;

    const latestCustomerMessage = [...messages]
      .reverse()
      .find((message) =>
        message.direction === "inbound"
        && message.sender_type === "customer"
        && typeof message.content?.text === "string"
        && message.content.text.trim().length > 0
      );

    if (!latestCustomerMessage) {
      setComposerSkillAssist(null);
      autoSkillLookupKeyRef.current = null;
      autoSkillLookupAttemptsRef.current.clear();
      void loadCopilot(selectedId);
      return;
    }

    const sourceText = latestCustomerMessage.content.text?.trim() ?? "";
    const lookupKey = `${selectedId}:${latestCustomerMessage.message_id}:${sourceText}`;
    if (autoSkillLookupKeyRef.current === lookupKey) {
      return;
    }
    const attemptCount = autoSkillLookupAttemptsRef.current.get(lookupKey) ?? 0;
    if (attemptCount >= 2) {
      return;
    }
    autoSkillLookupKeyRef.current = lookupKey;
    autoSkillLookupAttemptsRef.current.set(lookupKey, attemptCount + 1);

    setComposerSkillAssist({
      skillName: "pending",
      title: i18next.t("skillAssist.loadingTitle"),
      sourceMessageId: latestCustomerMessage.message_id,
      sourceMessagePreview: sourceText,
      status: "loading"
    });
    setCopilot(null);
    setComposerAiSuggestions([]);

    void requestConversationSkillAssist(selectedId, latestCustomerMessage.message_id, session)
      .then((response) => {
        if (!response.assist) {
          setComposerSkillAssist(null);
          void loadCopilot(selectedId);
          return;
        }

        setComposerSkillAssist({
          skillName: response.assist.skillName,
          title: humanizeSkillAssistTitle(response.assist.skillName),
          sourceMessageId: response.assist.sourceMessageId,
          sourceMessagePreview: response.assist.sourceMessagePreview,
          status: "ready",
          parameters: response.assist.parameters,
          result: response.assist.result
        });
        void loadCopilot(selectedId);
      })
      .catch((error) => {
        setComposerSkillAssist(null);
        autoSkillLookupKeyRef.current = null;
        setComposerSkillAssist({
          skillName: "skill_assist",
          title: i18next.t("skillAssist.fallbackTitle"),
          sourceMessageId: latestCustomerMessage.message_id,
          sourceMessagePreview: sourceText,
          status: "error",
          error: (error as Error).message
        });
        void loadCopilot(selectedId);
      });
  }, [loadCopilot, messages, selectedId, session]);

  // Note: explicit "reopen" is no longer surfaced in the UI.
  // Sending a message to a resolved conversation is sufficient — the outbound
  // worker transparently reactivates it and assigns it to the sending agent.
  // The conversation is the chat thread; async tasks carry execution history.

  const onSwitchTenant = useCallback(async (membershipId: string) => {
    if (!session || membershipId === session.membershipId) return;
    const next = await switchTenantSession(session, membershipId);
    if (!next.agentId && !next.waSeatEnabled) {
      setViewHint("当前租户未开通客服或WhatsApp工作台权限。");
      window.setTimeout(() => setViewHint(""), 3000);
      return;
    }
    writeSession(next);
    setSession(next);
    setSelectedId(null);
    setConversations([]);
    setViewSummaries(EMPTY_VIEW_SUMMARIES);
    setDetail(null);
    setMessages([]);
    setMessagesHasMore(false);
    setMessagesLoading(false);
    setMessagesLoadingMore(false);
    oldestMessageCursorRef.current = null;
    setCopilot(null);
    setSkillRecommendation(null);
    setPendingAttachments([]);
    setReplyTargetMessageId(null);
    setView("all");
  }, [session]);

  const onLogout = useCallback(async () => {
    if (!session) return;
    try {
      await logoutSession(session, false);
    } finally {
      localStorage.removeItem("nuychat.authSession");
      setSession(null);
      navigate("/");
    }
  }, [navigate, session]);

  useEffect(() => {
    if (!isLoggedIn) {
      localStorage.removeItem("nuychat.authSession");
      navigate("/", { replace: true });
      return;
    }
    if (session && !session.agentId && !session.waSeatEnabled) {
      localStorage.removeItem("nuychat.authSession");
      navigate("/", { replace: true });
    }
  }, [isLoggedIn, navigate, session]);

  const isAssignedToMe = !!agentId && detail?.assignedAgentId === agentId;
  const selectedConversation = filteredConversations.find((c) => c.conversationId === selectedId) ?? null;

  const updatePreferredSkills = useCallback(
    async (preferredSkills: string[]) => {
      if (!session || !selectedId) return;
      await apiPut(`/api/conversations/${selectedId}/skills/preferences`, { preferredSkills }, session);
      await loadSkillRecommendation(selectedId);
    },
    [loadSkillRecommendation, selectedId, session]
  );

  const applyTopRecommendedSkills = useCallback(async () => {
    const top = (skillRecommendation?.recommendations ?? []).slice(0, 3).map((item) => item.skillName);
    if (top.length === 0) return;
    await updatePreferredSkills(top);
  }, [skillRecommendation, updatePreferredSkills]);

  // ── Task handlers ────────────────────────────────────────────────────────────

  const doCreateTicket = useCallback(
    async (input: { title: string; description?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null; sourceMessageId?: string | null; requiresCustomerReply?: boolean }) => {
      if (!session || !selectedId) return;
      setTicketLoading(true);
      try {
        const ticket = await createConversationTicket(selectedId, input, session);
        setTickets((prev) => [ticket, ...prev]);
        await refreshTicketDetail(selectedId, ticket.ticketId);
        setTaskDraft(null);
      } finally {
        setTicketLoading(false);
      }
    },
    [selectedId, session]
  );

  const doPatchTicket = useCallback(
    async (
      ticketId: string,
      input: {
        status?: string;
        priority?: string;
        assigneeId?: string | null;
        dueAt?: string | null;
        requiresCustomerReply?: boolean;
        customerReplyStatus?: "pending" | "sent" | "waived" | null;
        sendCustomerReply?: boolean;
        customerReplyBody?: string | null;
      }
    ) => {
      if (!session || !selectedId) return;
      setTicketLoading(true);
      try {
        const ticket = await patchTicket(ticketId, { conversationId: selectedId, ...input }, session);
        setTickets((prev) => prev.map((item) => (item.ticketId === ticket.ticketId ? ticket : item)));
        await refreshTicketDetail(selectedId, ticket.ticketId);
      } finally {
        setTicketLoading(false);
      }
    },
    [selectedId, session]
  );

  const doAddTicketComment = useCallback(
    async (ticketId: string, body: string) => {
      if (!session || !selectedId) return;
      setTicketLoading(true);
      try {
        const ticket = await addConversationTaskComment(selectedId, ticketId, body, session);
        setTickets((prev) => prev.map((item) => (item.ticketId === ticket.ticketId ? ticket : item)));
        await refreshTicketDetail(selectedId, ticket.ticketId);
      } finally {
        setTicketLoading(false);
      }
    },
    [selectedId, session]
  );

  // ── Skill execute handler ────────────────────────────────────────────────────

  const doExecuteSkill = useCallback(
    async (skillName: string, parameters: Record<string, unknown> = {}) => {
      if (!session || !selectedId) return;
      setSkillExecuting(skillName);
      setLastSkillResult(null);
      try {
        const result = await apiExecuteSkill(selectedId, skillName, parameters, session);
        setLastSkillResult(result);
        // The message.sent socket event will automatically refresh messages,
        // copilot and skill recommendations — no manual reload needed.
      } finally {
        setSkillExecuting(null);
      }
    },
    [selectedId, session]
  );

  const onManualSkillAssist = useCallback(
    async (messageId: string, skillSlug: string) => {
      if (!session || !selectedId || !messageId || !skillSlug) return null;
      const response = await requestConversationSkillAssist(selectedId, messageId, session, skillSlug);
      if (!response.assist) return null;
      return {
        skillName: response.assist.skillName,
        title: humanizeSkillAssistTitle(response.assist.skillName),
        sourceMessageId: response.assist.sourceMessageId,
        sourceMessagePreview: response.assist.sourceMessagePreview,
        status: "ready" as const,
        parameters: response.assist.parameters,
        result: response.assist.result
      };
    },
    [selectedId, session]
  );

  return {
    session,
    isLoggedIn,
    tenantId,
    tenantSlug,
    agentId,
    waSeatEnabled,
    waRuntimeAvailable,
    waRuntimeChecked,
    waUnreadMessages,
    memberships: workspaceMemberships,
    socketStatus,
    view,
    leftPanelMode,
    rightTab,
    searchText,
    taskSearchText,
    taskCustomerSearchText,
    taskStatusFilter,
    taskRecentDays,
    tierFilter,
    conversations,
    filteredConversations,
    unreadConversations,
    myTasks,
    filteredMyTasks,
    viewSummaries,
    totalUnreadMessages,
    hasMoreConversations,
    conversationsLoading,
    myTasksLoading,
    loadMyTasks,
    loadMoreConversations,
    selectedId,
    selectedUnreadAnchorCount,
    selectedUnreadAnchorMessageId,
    detail,
    messages,
    messagesHasMore,
    messagesLoading,
    messagesLoadingMore,
    copilot,
    skillRecommendation,
    composerAiSuggestions,
    reply,
    pendingAttachments,
    replyTargetMessageId,
    actionLoading,
    viewHint,
    isAssignedToMe,
    selectedConversation,
    setLeftPanelMode,
    setRightTab,
    setSearchText,
    setTaskSearchText,
    setTaskCustomerSearchText,
    setTaskStatusFilter,
    setTaskRecentDays,
    setTierFilter,
    setSelectedId,
    openConversation,
    openTaskConversation,
    loadOlderMessages,
    setReply,
    setPendingAttachments,
    setReplyTargetMessageId,
    removePendingAttachment,
    handleViewChange,
    sendReply,
    sendReaction,
    handleUploadFiles,
    updatePreferredSkills,
    applyTopRecommendedSkills,
    doAssign,
    doHandoff,
    doTransfer,
    doResolve,
    colleagues,
    onSwitchTenant,
    onLogout,
    tickets,
    ticketDetailsById,
    ticketLoading,
    taskDraft,
    doCreateTicket,
    doPatchTicket,
    doAddTicketComment,
    setTaskDraft,
    skillExecuting,
    lastSkillResult,
    composerSkillAssist,
    onManualSkillAssist,
    doExecuteSkill,
    aiTraces,
    skillSchemas,
    customer360
  };
}

export type WorkspaceDashboardVM = ReturnType<typeof useWorkspaceDashboard>;

function humanizeSkillAssistTitle(skillName: string) {
  if (skillName === "cargo_trace") return i18next.t("skillAssist.skillTitles.cargo_trace");
  if (skillName === "track_shipment") return i18next.t("skillAssist.skillTitles.track_shipment");
  if (skillName === "lookup_order") return i18next.t("skillAssist.skillTitles.lookup_order");
  if (skillName === "search_knowledge_base") return i18next.t("skillAssist.skillTitles.search_knowledge_base");
  return skillName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim() || i18next.t("skillAssist.fallbackTitle");
}

function mapConversationRow(r: Record<string, unknown>): ConversationItem {
  return {
    ...readClientMeta(r.customer_metadata),
    conversationId: String(r.conversation_id),
    caseId: (r.case_id as string | null | undefined) ?? null,
    caseStatus: (r.case_status as string | null | undefined) ?? null,
    caseTitle: (r.case_title as string | null | undefined) ?? null,
    channelType: String(r.channel_type),
    status: String(r.status ?? "open"),
    lastMessagePreview: (r.last_message_preview as string | null) ?? null,
    occurredAt: String(r.last_message_at ?? new Date().toISOString()),
    lastMessageAt: String(r.last_message_at ?? new Date().toISOString()),
    unreadCount: Number(r.unread_count ?? 0),
    queueStatus: (r.queue_status as string | undefined) ?? undefined,
    assignedAgentId: (r.assigned_agent_id as string | null | undefined) ?? null,
    assignedAgentName: (r.assigned_agent_name as string | null | undefined) ?? null,
    assignedAgentEmployeeNo: (r.assigned_agent_employee_no as string | null | undefined) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    customerTier: String(r.customer_tier ?? "standard"),
    customerRef: String(r.customer_ref ?? ""),
    customerTags: Array.isArray(r.customer_tags) ? (r.customer_tags as string[]) : [],
    hasMyOpenTicket: Boolean(r.has_pending_case_work ?? r.has_my_open_ticket)
  };
}

function sortConversations(
  items: ConversationItem[],
  previousOrder: string[] = []
): ConversationItem[] {
  const previousIndex = new Map(previousOrder.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aTime = a.lastMessageAt ?? a.occurredAt;
    const bTime = b.lastMessageAt ?? b.occurredAt;
    if (aTime !== bTime) {
      return aTime < bTime ? 1 : -1;
    }
    return (previousIndex.get(a.conversationId) ?? Number.MAX_SAFE_INTEGER)
      - (previousIndex.get(b.conversationId) ?? Number.MAX_SAFE_INTEGER);
  });
}

function shouldIncludeConversationInView(
  conversation: ConversationItem,
  view: SideView,
  agentId: string | null
): boolean {
  if (view === "mine") {
    return !!agentId && conversation.assignedAgentId === agentId;
  }

  if (view === "follow_up") {
    // Follow-up view is now driven by pending case work owned by me.
    return Boolean(conversation.hasMyOpenTicket);
  }

  if (!agentId) return true;

  return conversation.assignedAgentId === agentId;
}

function syncConversationForView(
  current: ConversationItem[],
  nextItem: ConversationItem,
  view: SideView,
  agentId: string | null
): ConversationItem[] {
  if (!shouldIncludeConversationInView(nextItem, view, agentId)) {
    return current.filter((c) => c.conversationId !== nextItem.conversationId);
  }

  const existingIndex = current.findIndex((item) => item.conversationId === nextItem.conversationId);
  if (existingIndex < 0) {
    return sortConversations([nextItem, ...current], current.map((item) => item.conversationId));
  }

  const existing = current[existingIndex];
  const replaced = current.map((item) => (
    item.conversationId === nextItem.conversationId ? nextItem : item
  ));

  const existingTime = existing.lastMessageAt ?? existing.occurredAt;
  const nextTime = nextItem.lastMessageAt ?? nextItem.occurredAt;
  if (existingTime === nextTime) {
    return replaced;
  }

  return sortConversations(replaced, current.map((item) => item.conversationId));
}

function readClientMeta(raw: unknown): {
  clientDevice: string | null;
  clientSource: string | null;
  clientAppId: string | null;
} {
  const parsed = parseJsonObject(raw);
  const webClient = parseJsonObject(parsed.webClient);
  return {
    clientDevice: readString(webClient.deviceType),
    clientSource: readString(webClient.source),
    clientAppId: readString(webClient.appId)
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}
