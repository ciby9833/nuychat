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
import type { MessageAttachment, RealtimeReplayEvent, Session } from "./types";

export const API_BASE_URL = "http://localhost:3000";

export function resolveApiUrl(path: string): string {
  return /^(?:https?:|data:|blob:)/i.test(path) ? path : `${API_BASE_URL}${path}`;
}

// ─── Session-update registry ──────────────────────────────────────────────────
// DashboardPage registers its setSession() here so the refresh interceptor
// can keep the React state in sync without prop drilling.

let _sessionUpdater: ((s: Session) => void) | null = null;

export function registerSessionUpdater(fn: (s: Session) => void): void {
  _sessionUpdater = fn;
}

export function unregisterSessionUpdater(): void {
  _sessionUpdater = null;
}

// ─── Internal refresh logic ───────────────────────────────────────────────────
// Deduplicated: concurrent 401s share one in-flight refresh promise.
let _refreshInFlight: Promise<Session | null> | null = null;

async function tryRefreshSession(session: Session): Promise<Session | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const res = await fetch("http://localhost:3000/api/auth/refresh", {
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
  let res = await fetch(`http://localhost:3000${path}`, {
    headers: apiHeaders(session)
  });

  if (res.status === 401) {
    const next = await tryRefreshSession(session);
    if (next) {
      res = await fetch(`http://localhost:3000${path}`, { headers: apiHeaders(next) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    }
    goToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<void> {
  const makeRequest = (s: Session) =>
    fetch(`http://localhost:3000${path}`, {
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
    fetch(`http://localhost:3000${path}`, {
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
    fetch(`http://localhost:3000${path}`, {
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

// ── apiPostJson — like apiPost but returns the JSON response body ─────────────
export async function apiPostJson<T>(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<T> {
  const makeRequest = (s: Session) =>
    fetch(`http://localhost:3000${path}`, {
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

// ── apiPatchJson — like apiPatch but returns JSON ─────────────────────────────
export async function apiPatchJson<T>(
  path: string,
  body: Record<string, unknown>,
  session: Session
): Promise<T> {
  const makeRequest = (s: Session) =>
    fetch(`http://localhost:3000${path}`, {
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
  const res = await fetch("http://localhost:3000/api/auth/switch-tenant", {
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
    memberships: data.memberships
  };
}

export async function logoutSession(session: Session, allSessions = false): Promise<void> {
  await fetch("http://localhost:3000/api/auth/logout", {
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

/**
 * Reopen a resolved/closed conversation for follow-up.
 * `assignToSelf: true` (default) assigns it to the calling agent immediately.
 */
export function reopenConversation(
  conversationId: string,
  session: Session,
  assignToSelf = true
): Promise<{ success: boolean; status: string; assignedAgentId: string | null }> {
  return apiPostJson<{ success: boolean; status: string; assignedAgentId: string | null }>(
    `/api/conversations/${conversationId}/reopen`,
    { assignToSelf },
    session
  );
}

// ─── Task API helpers ─────────────────────────────────────────────────────────

import type { Ticket, SkillExecuteResult, AiTrace, SkillSchema, Customer360Data } from "./types";

export function listConversationTickets(conversationId: string, session: Session): Promise<{ tickets: Ticket[] }> {
  return apiFetch<{ tasks: Array<{
    taskId: string;
    taskType: string;
    title: string;
    source: string;
    status: "queued" | "running" | "published" | "failed";
    resultSummary: string | null;
    createdAt: string;
  }> }>(`/api/conversations/${conversationId}/tasks`, session).then((data) => ({
    tickets: data.tasks.map((task) => ({
      ticketId: task.taskId,
      conversationId,
      caseId: null,
      title: task.title,
      description: task.resultSummary ?? null,
      status: task.status,
      priority: "normal" as const,
      assigneeId: null,
      slaDeadlineAt: null,
      slaStatus: "none" as const,
      resolvedAt: task.status === "published" ? task.createdAt : null,
      closedAt: task.status === "failed" ? task.createdAt : null,
      createdByType: task.source,
      createdById: null,
      createdAt: task.createdAt,
      updatedAt: task.createdAt
    }))
  }));
}

export function createConversationTicket(
  conversationId: string,
  input: { title: string; description?: string; priority?: string },
  session: Session
): Promise<Ticket> {
  return apiPostJson<{ queued: boolean }>(
    `/api/conversations/${conversationId}/tasks`,
    { title: input.title, note: input.description ?? "" },
    session
  ).then(async () => {
    const data = await listConversationTickets(conversationId, session);
    const latest = data.tickets[0];
    if (!latest) {
      throw new Error("Task queued but not yet visible");
    }
    return latest;
  });
}

export function patchTicket(
  ticketId: string,
  input: { status?: string; priority?: string; assigneeId?: string | null; note?: string },
  session: Session
): Promise<Ticket> {
  return Promise.reject(new Error(`Task updates are not supported: ${ticketId}:${input.status ?? ""}:${session.tenantId}`));
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
    `/api/conversations/${conversationId}/skills/schemas`,
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
    `/api/conversations/${conversationId}/skills/execute`,
    { skillName, parameters },
    session
  );
}
