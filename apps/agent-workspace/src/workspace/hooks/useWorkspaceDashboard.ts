import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

import {
  apiFetch,
  apiPut,
  apiPost,
  getRealtimeReplay,
  markConversationRead,
  logoutSession,
  listConversationsPaginated,
  registerSessionUpdater,
  switchTenantSession,
  unregisterSessionUpdater,
  listConversationTickets,
  createConversationTicket,
  executeSkill as apiExecuteSkill,
  listConversationAiTraces,
  listConversationSkillSchemas,
  getConversationCustomer360,
  listColleagues,
  transferConversation,
  uploadFile
} from "../api";
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
  RightTab,
  SideView,
  Session,
  Ticket,
  SkillExecuteResult,
  AiTrace,
  SkillSchema
} from "../types";

export function useWorkspaceDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const isLoggedIn = !!session?.accessToken;
  const sessionRef = useRef(session);

  const tenantId = session?.tenantId ?? "";
  const tenantSlug = session?.tenantSlug ?? "";
  const agentId = session?.agentId ?? null;
  const memberships = session?.memberships ?? [];
  const workspaceMemberships = memberships.filter((membership) => membership.agentId);

  // ── selectedIdRef: always reflects latest selectedId without forcing socket teardown ──
  const selectedIdRef = useRef<string | null>(null);
  const effectiveViewRef = useRef<SideView>("all");
  const loadConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const lastActivityPostAtRef = useRef(0);
  const lastRealtimeEventIdRef = useRef<string | null>(
    typeof window !== "undefined" ? window.sessionStorage.getItem("nuychat.lastRealtimeEventId") : null
  );

  const [socketStatus, setSocketStatus] = useState("connecting");
  const [view, setView] = useState<SideView>("all");
  const [rightTab, setRightTab] = useState<RightTab>("copilot");
  const [searchText, setSearchText] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "vip" | "premium" | "standard">("all");

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [copilot, setCopilot] = useState<CopilotData | null>(null);
  const [skillRecommendation, setSkillRecommendation] = useState<ConversationSkillRecommendationResponse | null>(null);
  const [reply, setReply] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewHint, setViewHint] = useState<string>("");

  // ── Tickets ─────────────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);

  // ── Skill execute ────────────────────────────────────────────────────────────
  const [skillExecuting, setSkillExecuting] = useState<string | null>(null);
  const [lastSkillResult, setLastSkillResult] = useState<SkillExecuteResult | null>(null);

  // ── AI Traces ────────────────────────────────────────────────────────────────
  const [aiTraces, setAiTraces] = useState<AiTrace[]>([]);
  const [customer360, setCustomer360] = useState<Customer360Data | null>(null);

  // ── Skill schemas ─────────────────────────────────────────────────────────
  const [skillSchemas, setSkillSchemas] = useState<SkillSchema[]>([]);

  // ── Colleagues (for transfer dialog) ────────────────────────────────────
  const [colleagues, setColleagues] = useState<AgentColleague[]>([]);

  const effectiveView: SideView = view === "mine" && !agentId ? "all" : view;

  const loadConversations = useCallback(async () => {
    if (!session) return;
    loadingRef.current = true;
    setConversationsLoading(true);
    try {
      const data = await listConversationsPaginated(session, { view: effectiveView });
      const items = data.conversations.map(mapConversationRow);
      setConversations(items);
      setHasMoreConversations(data.hasMore);
      oldestCursorRef.current = data.nextCursor;
    } catch {
      setConversations([]);
      setHasMoreConversations(false);
      oldestCursorRef.current = null;
    } finally {
      loadingRef.current = false;
      setConversationsLoading(false);
    }
  }, [effectiveView, session]);

  loadConversationsRef.current = loadConversations;

  const rememberRealtimeEventId = useCallback((eventId?: string | null) => {
    if (!eventId) return;
    lastRealtimeEventIdRef.current = eventId;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nuychat.lastRealtimeEventId", eventId);
    }
  }, []);

  const clearConversationUnreadLocal = useCallback((conversationId: string) => {
    setConversations((prev) => prev.map((item) => (
      item.conversationId === conversationId
        ? { ...item, unreadCount: 0 }
        : item
    )));
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
    if (!session || loadingRef.current) return;
    const cursor = oldestCursorRef.current;
    if (!cursor) return; // null cursor means no more pages
    loadingRef.current = true;
    setConversationsLoading(true);
    try {
      const data = await listConversationsPaginated(session, { view: effectiveView, before: cursor });
      const items = data.conversations.map(mapConversationRow);
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
  }, [effectiveView, session]);

  const loadDetail = useCallback(async (id: string) => {
    if (!session) return;
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
  }, [session]);

  const loadMessages = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const rows = await apiFetch<MessageItem[]>(`/api/conversations/${id}/messages`, session);
      setMessages(rows);
    } catch {
      setMessages([]);
    }
  }, [session]);

  const loadCopilot = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await apiFetch<CopilotData>(`/api/conversations/${id}/copilot`, session);
      setCopilot(data);
    } catch {
      setCopilot(null);
    }
  }, [session]);

  const loadSkillRecommendation = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await apiFetch<ConversationSkillRecommendationResponse>(`/api/conversations/${id}/skills/recommendations?actor=agent`, session);
      setSkillRecommendation(data);
    } catch {
      setSkillRecommendation(null);
    }
  }, [session]);

  const loadTickets = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await listConversationTickets(id, session);
      setTickets(data.tickets);
    } catch {
      setTickets([]);
    }
  }, [session]);

  const loadAiTraces = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await listConversationAiTraces(id, session);
      setAiTraces(data.traces);
    } catch {
      setAiTraces([]);
    }
  }, [session]);

  const loadSkillSchemas = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await listConversationSkillSchemas(id, session);
      setSkillSchemas(data.schemas);
    } catch {
      setSkillSchemas([]);
    }
  }, [session]);

  const loadCustomer360 = useCallback(async (id: string) => {
    if (!session) return;
    try {
      const data = await getConversationCustomer360(id, session);
      setCustomer360(data);
    } catch {
      setCustomer360(null);
    }
  }, [session]);

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

        if (shouldIncludeConversationInView(next, effectiveViewRef.current, agentId)) {
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
      return syncConversationForView(prev, merged, effectiveViewRef.current, agentId);
    });
    if (ev.conversationId === selectedIdRef.current) {
      void loadDetail(ev.conversationId);
      void loadMessages(ev.conversationId);
      if (typeof ev.unreadCount !== "number" || ev.unreadCount > 0) {
        void syncConversationReadIfVisible(ev.conversationId);
      }
    }
  }, [agentId, rememberRealtimeEventId, loadDetail, loadMessages, syncConversationReadIfVisible]);

  const handleMessageReceivedEvent = useCallback((ev: { eventId?: string; conversationId: string }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      void loadMessages(ev.conversationId);
      void loadCopilot(ev.conversationId);
      void loadSkillRecommendation(ev.conversationId);
      void syncConversationReadIfVisible(ev.conversationId);
    }
  }, [loadCopilot, loadMessages, loadSkillRecommendation, rememberRealtimeEventId, syncConversationReadIfVisible]);

  const handleMessageSentEvent = useCallback((ev: { eventId?: string; conversationId: string }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      clearConversationUnreadLocal(ev.conversationId);
      void loadMessages(ev.conversationId);
      void loadAiTraces(ev.conversationId);
    }
  }, [clearConversationUnreadLocal, loadAiTraces, loadMessages, rememberRealtimeEventId]);

  const handleMessageUpdatedEvent = useCallback((ev: { eventId?: string; conversationId: string }) => {
    rememberRealtimeEventId(ev.eventId);
    if (ev.conversationId === selectedIdRef.current) {
      void loadMessages(ev.conversationId);
    }
  }, [loadMessages, rememberRealtimeEventId]);

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
          handleMessageReceivedEvent(item.payload as { eventId?: string; conversationId: string });
        } else if (item.event === "message.sent") {
          handleMessageSentEvent(item.payload as { eventId?: string; conversationId: string });
        } else if (item.event === "message.updated") {
          handleMessageUpdatedEvent(item.payload as { eventId?: string; conversationId: string });
        }
      }
    } catch {
      // noop
    }
  }, [handleConversationUpdatedEvent, handleMessageReceivedEvent, handleMessageSentEvent, handleMessageUpdatedEvent]);

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

  // ── Persistent socket — only recreated when session (login/logout) changes ───
  // Uses selectedIdRef.current so handlers always see the current selection
  // without including selectedId in the dependency array.
  // Auth is a CALLBACK (not a static object) so every reconnection attempt
  // reads the latest token from sessionRef.current rather than a stale closure value.
  useEffect(() => {
    if (!session) return;

    const socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
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
      void loadConversationsRef.current?.();
      if (selectedIdRef.current) {
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
      void loadConversationsRef.current?.();
    });
    socket.on("conversation.updated", handleConversationUpdatedEvent);
    socket.on("message.received", handleMessageReceivedEvent);
    socket.on("message.sent", handleMessageSentEvent);
    socket.on("message.updated", handleMessageUpdatedEvent);

    return () => {
      socket.close();
    };
    // selectedId intentionally NOT in deps — use selectedIdRef.current instead.
    // loadConversations intentionally NOT in deps — has its own effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleConversationUpdatedEvent, handleMessageReceivedEvent, handleMessageSentEvent, handleMessageUpdatedEvent, loadAiTraces, loadCopilot, loadDetail, loadMessages, loadSkillRecommendation, replayRealtimeGap, session]);

  useEffect(() => {
    if (!session) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadConversationsRef.current?.();
      if (selectedIdRef.current) {
        void loadDetail(selectedIdRef.current);
        void loadMessages(selectedIdRef.current);
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [session, loadDetail, loadMessages]);

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
  }, [isLoggedIn]);

  useEffect(() => {
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
  }, [isLoggedIn, postAgentActivity]);

  // Load colleagues list once on login (used for transfer dialog)
  useEffect(() => {
    void loadColleagues();
  }, [loadColleagues]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setMessages([]);
      setCopilot(null);
      setSkillRecommendation(null);
      setTickets([]);
      setLastSkillResult(null);
      setAiTraces([]);
      setSkillSchemas([]);
      setCustomer360(null);
      return;
    }

    void loadDetail(selectedId);
    void loadMessages(selectedId);
    void loadCopilot(selectedId);
    void loadSkillRecommendation(selectedId);
    void loadTickets(selectedId);
    void loadAiTraces(selectedId);
    void loadSkillSchemas(selectedId);
    void loadCustomer360(selectedId);
    void postAgentActivity("open_conversation", true);
    void syncConversationReadIfVisible(selectedId);
  }, [loadAiTraces, loadCopilot, loadCustomer360, loadDetail, loadMessages, loadSkillRecommendation, loadSkillSchemas, loadTickets, postAgentActivity, selectedId, syncConversationReadIfVisible]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchText.trim().toLowerCase();
      const hitSearch =
        q.length === 0 ||
        (c.customerName ?? "").toLowerCase().includes(q) ||
        (c.customerRef ?? "").toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(q);

      const tier = (c.customerTier ?? "standard").toLowerCase();
      const hitTier = tierFilter === "all" || tier === tierFilter;
      return hitSearch && hitTier;
    });
  }, [conversations, searchText, tierFilter]);

  useEffect(() => {
    if (selectedId && !filteredConversations.some((c) => c.conversationId === selectedId)) {
      setSelectedId(filteredConversations[0]?.conversationId ?? null);
      return;
    }

    if (!selectedId && filteredConversations[0]?.conversationId) {
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

  const openConversation = useCallback(async (conversationId: string) => {
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
    await loadMessages(selectedId);
  }, [clearConversationUnreadLocal, loadMessages, pendingAttachments, postAgentActivity, reply, replyTargetMessageId, selectedId, session]);

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
    await loadMessages(selectedId);
  }, [loadMessages, postAgentActivity, selectedId, session]);

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

  // Note: explicit "reopen" is no longer surfaced in the UI.
  // Sending a message to a resolved conversation is sufficient — the outbound
  // worker transparently reactivates it and assigns it to the sending agent.
  // The conversation is the chat thread; async tasks carry execution history.

  const onSwitchTenant = useCallback(async (membershipId: string) => {
    if (!session || membershipId === session.membershipId) return;
    const next = await switchTenantSession(session, membershipId);
    if (!next.agentId) {
      setViewHint("未开通接待资格，无法进入客服工作台。");
      window.setTimeout(() => setViewHint(""), 3000);
      return;
    }
    writeSession(next);
    setSession(next);
    setSelectedId(null);
    setConversations([]);
    setDetail(null);
    setMessages([]);
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
    if (session && !session.agentId) {
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
    async (input: { title: string; description?: string; priority?: string }) => {
      if (!session || !selectedId) return;
      setTicketLoading(true);
      try {
        const ticket = await createConversationTicket(selectedId, input, session);
        setTickets((prev) => [ticket, ...prev]);
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

  return {
    session,
    isLoggedIn,
    tenantId,
    tenantSlug,
    agentId,
    memberships: workspaceMemberships,
    socketStatus,
    view,
    rightTab,
    searchText,
    tierFilter,
    conversations,
    filteredConversations,
    hasMoreConversations,
    conversationsLoading,
    loadMoreConversations,
    selectedId,
    detail,
    messages,
    copilot,
    skillRecommendation,
    reply,
    pendingAttachments,
    replyTargetMessageId,
    actionLoading,
    viewHint,
    isAssignedToMe,
    selectedConversation,
    setRightTab,
    setSearchText,
    setTierFilter,
    setSelectedId,
    openConversation,
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
    ticketLoading,
    doCreateTicket,
    skillExecuting,
    lastSkillResult,
    doExecuteSkill,
    aiTraces,
    skillSchemas,
    customer360
  };
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
