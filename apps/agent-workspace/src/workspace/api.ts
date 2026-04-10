/**
 * API client for the agent workspace.
 *
 * All fetch helpers implement a silent-refresh pattern:
 *   1. Make the request with the current access token.
 *   2. On 401, try POST /api/auth/refresh once.
 *      - Success → write the new session to localStorage, notify the
 *        session-update callback registered via `registerSessionUpdater`,
 *        then retry the original request.
 *      - Failure → clear localStorage and redirect to the login page.
 *   3. Any other non-OK status throws an error as usual.
 *
 * This gives users a transparent 24-hour session: the 1-hour access token
 * is silently refreshed until the 24-hour DB session expires.
 */

import { apiHeaders, writeSession } from "./session";
import type {
  ConversationPreviewDetail,
  ConversationViewSummaries,
  MessageAttachment,
  MessageItem,
  PaginatedMessagesResponse,
  RealtimeReplayEvent,
  Session,
  WaWorkbenchSummary,
  WaRuntimeStatus
} from "./types";

export const API_BASE_URL = readRequiredEnv("VITE_API_BASE_URL");

function readRequiredEnv(name: "VITE_API_BASE_URL"): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.replace(/\/$/, "");
}

export function resolveApiUrl(path: string): string {
  return /^(?:https?:|data:|blob:)/i.test(path) ? path : `${API_BASE_URL}${path}`;
}

// ─── Session-update registry ──────────────────────────────────────────────────

let _sessionUpdater: ((s: Session) => void) | null = null;

export function registerSessionUpdater(fn: (s: Session) => void): void {
  _sessionUpdater = fn;
}

export function unregisterSessionUpdater(): void {
  _sessionUpdater = null;
}

// ─── Internal refresh logic ───────────────────────────────────────────────────

let _refreshInFlight: Promise<Session | null> | null = null;

async function tryRefreshSession(session: Session): Promise<Session | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      const next: Session = {
        ...session,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken
      };

      writeSession(next);
      _sessionUpdater?.(next);
      return next;
    } catch {
      return null;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

function goToLogin(): void {
  localStorage.removeItem("nuychat.authSession");
  window.location.href = "/";
}

// ─── Public fetch helpers ─────────────────────────────────────────────────────

export async function apiFetch<T>(path: string, session: Session): Promise<T> {
  let res = await fetch(`${API_BASE_URL}${path}`, {
    headers: apiHeaders(session)
  });

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await fetch(`${API_BASE_URL}${path}`, { headers: apiHeaders(next) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function getWaWorkbenchRuntime(session: Session) {
  return apiFetch<WaRuntimeStatus>("/api/wa/workbench/runtime", session);
}

export function getWaWorkbenchSummary(session: Session) {
  return apiFetch<WaWorkbenchSummary>("/api/wa/workbench/summary", session);
}

export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<void> {
  const makeRequest = (s: Session) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: apiHeaders(s),
      body: JSON.stringify(body)
    });

  let res = await makeRequest(session);

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await makeRequest(next);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function apiPatch(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<void> {
  const makeRequest = (s: Session) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: apiHeaders(s),
      body: JSON.stringify(body)
    });

  let res = await makeRequest(session);

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await makeRequest(next);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function apiPut(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<void> {
  const makeRequest = (s: Session) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: apiHeaders(s),
      body: JSON.stringify(body)
    });

  let res = await makeRequest(session);

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await makeRequest(next);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function apiPostJson<T>(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<T> {
  const makeRequest = (s: Session) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: apiHeaders(s),
      body: JSON.stringify(body)
    });

  let res = await makeRequest(session);

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await makeRequest(next);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPatchJson<T>(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<T> {
  const makeRequest = (s: Session) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: apiHeaders(s),
      body: JSON.stringify(body)
    });

  let res = await makeRequest(session);

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await makeRequest(next);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── File upload ──────────────────────────────────────────────────────────────

export type UploadResult = MessageAttachment;

export async function uploadFile(
  session: Session,
  file: File,
  options?: { onProgress?: (progress: number) => void }
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const makeRequest = (s: Session) => new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl("/api/upload"));
    xhr.setRequestHeader("Authorization", `Bearer ${s.accessToken}`);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options?.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new Error("UPLOAD_401"));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } catch {
        reject(new Error("Upload failed: invalid response"));
      }
    };
    xhr.send(formData);
  });

  try {
    return await makeRequest(session);
  } catch (error) {
    if ((error as Error).message !== "UPLOAD_401") throw error;
    const next = await tryRefreshSession(session);
    if (next) {
      return makeRequest(next);
    }
    goToLogin();
    throw new Error("Session expired");
  }
}

// ─── Auth helpers (bypass refresh interceptor) ────────────────────────────────

export async function switchTenantSession(
  session: Session,
  membershipId: string
): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/api/auth/switch-tenant`, {
    method: "POST",
    headers: apiHeaders(session),
    body: JSON.stringify({ membershipId })
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    user: {
      identityId: string;
      email: string;
      role: string;
      tenantId: string;
      tenantSlug: string;
      membershipId: string;
      agentId?: string | null;
      waSeatEnabled?: boolean;
    };
    memberships: Session["memberships"];
  };

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    identityId: data.user.identityId,
    email: data.user.email,
    role: data.user.role,
    tenantId: data.user.tenantId,
    tenantSlug: data.user.tenantSlug,
    membershipId: data.user.membershipId,
    agentId: data.user.agentId ?? null,
    waSeatEnabled: data.user.waSeatEnabled ?? false,
    memberships: data.memberships
  };
}

export async function logoutSession(session: Session, allSessions = false): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: apiHeaders(session),
    body: JSON.stringify({ allSessions })
  });
}

// ─── Paginated conversations ──────────────────────────────────────────────────

type RawConversationsPage = {
  conversations: Record<string, unknown>[];
  hasMore: boolean;
  nextCursor: string | null;
  viewSummaries: ConversationViewSummaries;
};

export async function listConversationsPaginated(
  session: Session,
  params: { view?: string; before?: string; limit?: number }
): Promise<RawConversationsPage> {
  const qs = new URLSearchParams({ view: params.view ?? "all" });
  if (params.before) qs.set("before", params.before);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<RawConversationsPage>(`/api/conversations?${qs}`, session);
}

export function markConversationRead(conversationId: string, session: Session): Promise<void> {
  return apiPost(`/api/conversations/${conversationId}/read`, {}, session);
}

export function getConversationPreview(
  conversationId: string,
  session: Session
): Promise<ConversationPreviewDetail> {
  return apiFetch<ConversationPreviewDetail>(`/api/conversations/${conversationId}/preview`, session);
}

export function listConversationMessages(
  conversationId: string,
  session: Session,
  params: { before?: string | null; limit?: number } = {}
): Promise<PaginatedMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.before) qs.set("before", params.before);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<PaginatedMessagesResponse>(
    `/api/conversations/${conversationId}/messages${qs.size ? `?${qs.toString()}` : ""}`,
    session
  );
}

export function getConversationMessage(
  conversationId: string,
  messageId: string,
  session: Session
): Promise<MessageItem> {
  return apiFetch<MessageItem>(`/api/conversations/${conversationId}/messages/${messageId}`, session);
}

export function getRealtimeReplay(
  session: Session,
  params: { afterEventId?: string | null; limit?: number } = {}
): Promise<{ events: RealtimeReplayEvent[] }> {
  const qs = new URLSearchParams();
  if (params.afterEventId) qs.set("afterEventId", params.afterEventId);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<{ events: RealtimeReplayEvent[] }>(
    `/api/realtime/replay${qs.size ? `?${qs.toString()}` : ""}`,
    session
  );
}

// ─── Task API helpers ─────────────────────────────────────────────────────────

import type { Ticket, TicketDetail, TicketNote, SkillExecuteResult, AiTrace, SkillSchema, Customer360Data, MyTaskListItem } from "./types";

type RawTask = {
  taskId: string;
  caseId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  ownerAgentId: string | null;
  ownerName: string | null;
  ownerEmployeeNo: string | null;
  requiresCustomerReply: boolean;
  customerReplyStatus: "pending" | "sent" | "waived" | null;
  customerReplyMessageId: string | null;
  customerReplySentAt: string | null;
  dueAt: string | null;
  creatorType: string;
  creatorIdentityId: string | null;
  creatorName: string | null;
  sourceMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

function mapTicket(task: RawTask): Ticket {
  return {
    ticketId: task.taskId,
    conversationId: task.conversationId,
    caseId: task.caseId,
    sourceMessageId: task.sourceMessageId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.ownerAgentId,
    assigneeName: task.ownerName,
    assigneeEmployeeNo: task.ownerEmployeeNo,
    requiresCustomerReply: task.requiresCustomerReply,
    customerReplyStatus: task.customerReplyStatus,
    customerReplyMessageId: task.customerReplyMessageId,
    customerReplySentAt: task.customerReplySentAt,
    slaDeadlineAt: task.dueAt,
    slaStatus: "none" as const,
    resolvedAt: task.completedAt,
    closedAt: task.cancelledAt,
    createdByType: task.creatorType,
    createdById: task.creatorIdentityId,
    createdByName: task.creatorName,
    sourceMessagePreview: task.sourceMessagePreview,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function mapTicketNote(note: {
  commentId: string;
  taskId: string;
  body: string;
  isInternal: boolean;
  authorType: string;
  authorIdentityId: string | null;
  authorAgentId: string | null;
  authorName: string | null;
  authorEmployeeNo: string | null;
  createdAt: string;
}): TicketNote {
  return {
    noteId: note.commentId,
    ticketId: note.taskId,
    body: note.body,
    isInternal: note.isInternal,
    authorType: note.authorType,
    authorId: note.authorIdentityId,
    authorAgentId: note.authorAgentId,
    authorName: note.authorName,
    authorEmployeeNo: note.authorEmployeeNo,
    createdAt: note.createdAt
  };
}

export function listConversationTickets(conversationId: string, session: Session): Promise<{ tickets: Ticket[] }> {
  return apiFetch<{ tasks: RawTask[] }>(`/api/conversations/${conversationId}/tasks`, session).then((data) => ({
    tickets: data.tasks.map(mapTicket)
  }));
}

export function getConversationTaskDetail(
  conversationId: string,
  ticketId: string,
  session: Session
): Promise<TicketDetail> {
  return apiFetch<{
    task: RawTask;
    comments: Array<{
      commentId: string;
      taskId: string;
      body: string;
      isInternal: boolean;
      authorType: string;
      authorIdentityId: string | null;
      authorAgentId: string | null;
      authorName: string | null;
      authorEmployeeNo: string | null;
      createdAt: string;
    }>;
  }>(`/api/conversations/${conversationId}/tasks/${ticketId}`, session).then((data) => ({
    task: mapTicket(data.task),
    comments: data.comments.map(mapTicketNote)
  }));
}

export function createConversationTicket(
  conversationId: string,
  input: { title: string; description?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null; sourceMessageId?: string | null; requiresCustomerReply?: boolean },
  session: Session
): Promise<Ticket> {
  const payload: Record<string, unknown> = {
    title: input.title,
    note: input.description ?? "",
    priority: input.priority ?? "normal",
    assigneeAgentId: input.assigneeId ?? session.agentId ?? null,
    requiresCustomerReply: input.requiresCustomerReply ?? false
  };

  if (input.dueAt !== undefined) payload.dueAt = input.dueAt;
  if (input.sourceMessageId !== undefined) payload.sourceMessageId = input.sourceMessageId;

  return apiPostJson<{ task: RawTask }>(
    `/api/conversations/${conversationId}/tasks`,
    payload,
    session
  ).then((data) => mapTicket(data.task));
}

export function patchTicket(
  ticketId: string,
  input: {
    conversationId: string;
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    dueAt?: string | null;
    note?: string;
    requiresCustomerReply?: boolean;
    customerReplyStatus?: "pending" | "sent" | "waived" | null;
    sendCustomerReply?: boolean;
    customerReplyBody?: string | null;
  },
  session: Session
): Promise<Ticket> {
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.assigneeId !== undefined) payload.assigneeAgentId = input.assigneeId;
  if (input.dueAt !== undefined) payload.dueAt = input.dueAt;
  if (input.requiresCustomerReply !== undefined) payload.requiresCustomerReply = input.requiresCustomerReply;
  if (input.customerReplyStatus !== undefined) payload.customerReplyStatus = input.customerReplyStatus;
  if (input.sendCustomerReply !== undefined) payload.sendCustomerReply = input.sendCustomerReply;
  if (input.customerReplyBody !== undefined) payload.customerReplyBody = input.customerReplyBody;

  return apiPatchJson<{ task: RawTask }>(`/api/conversations/${input.conversationId}/tasks/${ticketId}`, payload, session).then((data) => mapTicket(data.task));
}

export function addConversationTaskComment(
  conversationId: string,
  ticketId: string,
  body: string,
  session: Session
): Promise<Ticket> {
  return apiPostJson<{ task: RawTask }>(`/api/conversations/${conversationId}/tasks/${ticketId}/comments`, { body }, session).then((data) => mapTicket(data.task));
}

export function listMyTasks(
  session: Session,
  input: {
    status?: string[];
    search?: string;
    taskSearch?: string;
    customerSearch?: string;
    createdFrom?: string;
    limit?: number;
  } = {}
): Promise<{ tasks: MyTaskListItem[] }> {
  const params = new URLSearchParams();
  if (input.status?.length) params.set("status", input.status.join(","));
  if (input.search) params.set("search", input.search);
  if (input.taskSearch) params.set("taskSearch", input.taskSearch);
  if (input.customerSearch) params.set("customerSearch", input.customerSearch);
  if (input.createdFrom) params.set("createdFrom", input.createdFrom);
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();

  return apiFetch<{ tasks: Array<RawTask & {
    customerName: string | null;
    customerRef: string | null;
    caseTitle: string | null;
    caseStatus: string | null;
    conversationStatus: string | null;
    channelType: string | null;
    conversationLastMessagePreview: string | null;
    conversationLastMessageAt: string | null;
  }> }>(`/api/tasks/mine${query ? `?${query}` : ""}`, session).then((data) => ({
    tasks: data.tasks.map((task) => ({
      ...mapTicket(task),
      customerName: task.customerName,
      customerRef: task.customerRef,
      caseTitle: task.caseTitle,
      caseStatus: task.caseStatus,
      conversationStatus: task.conversationStatus,
      channelType: task.channelType,
      conversationLastMessagePreview: task.conversationLastMessagePreview,
      conversationLastMessageAt: task.conversationLastMessageAt
    }))
  }));
}

// ─── AI Trace helper ──────────────────────────────────────────────────────────

export function listConversationAiTraces(
  conversationId: string,
  session: Session
): Promise<{ traces: AiTrace[] }> {
  return apiFetch<{ traces: AiTrace[] }>(`/api/conversations/${conversationId}/ai-traces`, session);
}

// ─── Skill schemas helper ─────────────────────────────────────────────────────

export function listConversationSkillSchemas(
  conversationId: string,
  session: Session
): Promise<{ schemas: SkillSchema[] }> {
  return apiFetch<{ schemas: SkillSchema[] }>(
    `/api/conversations/${conversationId}/executors/schemas`,
    session
  );
}

export function getConversationCustomer360(
  conversationId: string,
  session: Session
): Promise<Customer360Data> {
  return apiFetch<Customer360Data>(`/api/conversations/${conversationId}/customer-360`, session);
}

// ─── Transfer + colleagues helpers ───────────────────────────────────────────

import type { AgentColleague, CopilotData } from "./types";

export function listColleagues(session: Session): Promise<{ agents: AgentColleague[] }> {
  return apiFetch<{ agents: AgentColleague[] }>("/api/agent/colleagues", session);
}

export type TransferResult = {
  success: boolean;
  transferredAt: string;
  targetAgentId: string;
  copilot: CopilotData | null;
};

export function transferConversation(
  conversationId: string,
  targetAgentId: string,
  reason: string,
  session: Session
): Promise<TransferResult> {
  return apiPostJson<TransferResult>(
    `/api/conversations/${conversationId}/transfer`,
    { targetAgentId, reason },
    session
  );
}

// ─── Skill execute helper ─────────────────────────────────────────────────────

export function executeSkill(
  conversationId: string,
  skillName: string,
  parameters: Record<string, unknown>,
  session: Session
): Promise<SkillExecuteResult> {
  return apiPostJson<SkillExecuteResult>(
    `/api/conversations/${conversationId}/executors/execute`,
    { executorName: skillName, parameters },
    session
  );
}

export function requestConversationSkillAssist(
  conversationId: string,
  sourceMessageId: string | null,
  session: Session,
  skillSlug?: string | null
): Promise<{
  assist: {
    skillName: string;
    sourceMessageId: string;
    sourceMessagePreview: string;
    parameters: Record<string, unknown>;
    result: Record<string, unknown>;
  } | null;
}> {
  return apiPostJson(
    `/api/conversations/${conversationId}/skills/assist`,
    { sourceMessageId, skillSlug: skillSlug ?? undefined },
    session
  );
}
