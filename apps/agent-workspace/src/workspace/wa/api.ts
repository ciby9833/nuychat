/**
 * 功能名称: WA 工作台 API
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 封装 WA 账号、会话、接管、发送消息和上传接口。
 * 交互页面:
 * - ./hooks/useWaWorkspace.ts: 统一通过此文件访问后端 WA workbench 接口。
 */

import { API_BASE_URL, apiFetch, apiPostJson } from "../api";
import type { Session } from "../types";
import type { WaAccountItem, WaContactItem, WaConversationDetail, WaConversationItem } from "./types";

export function listWaWorkbenchAccounts(session: Session) {
  return apiFetch<WaAccountItem[]>("/api/wa/workbench/accounts", session);
}

export function listWaWorkbenchConversations(
  session: Session,
  input?: { accountId?: string | null; assignedToMe?: boolean; type?: string | null; archived?: boolean }
) {
  const params = new URLSearchParams();
  if (input?.accountId) params.set("accountId", input.accountId);
  if (input?.assignedToMe) params.set("assignedToMe", "true");
  if (input?.type) params.set("type", input.type);
  if (input?.archived) params.set("archived", "true");
  return apiFetch<WaConversationItem[]>(`/api/wa/workbench/conversations${params.toString() ? `?${params}` : ""}`, session);
}

export function getWaWorkbenchConversationDetail(session: Session, waConversationId: string) {
  return apiFetch<WaConversationDetail>(`/api/wa/workbench/conversations/${waConversationId}`, session);
}

export function takeoverWaConversation(session: Session, waConversationId: string, reason?: string) {
  return apiPostJson<{ lockStatus: string; activeMembershipId: string }>(
    `/api/wa/workbench/conversations/${waConversationId}/takeover`,
    { reason: reason ?? null },
    session
  );
}

export function releaseWaConversation(session: Session, waConversationId: string, reason?: string) {
  return apiPostJson<{ lockStatus: string }>(
    `/api/wa/workbench/conversations/${waConversationId}/release`,
    { reason: reason ?? null },
    session
  );
}

export function archiveWaConversation(session: Session, waConversationId: string, archive: boolean) {
  return apiPostJson<{ archived: boolean }>(
    `/api/wa/workbench/conversations/${waConversationId}/archive`,
    { archive },
    session
  );
}

export function forceAssignWaConversation(
  session: Session,
  waConversationId: string,
  memberId: string,
  reason?: string
) {
  return apiPostJson<{ lockStatus: string; activeMembershipId: string }>(
    `/api/wa/workbench/conversations/${waConversationId}/force-assign`,
    { memberId, reason: reason ?? null },
    session
  );
}

export function sendWaTextMessage(
  session: Session,
  waConversationId: string,
  input: { clientMessageId: string; text: string; quotedMessageId?: string | null; mentionJids?: string[] | null }
) {
  return apiPostJson<{ jobId: string; waMessageId: string }>(
    `/api/wa/workbench/conversations/${waConversationId}/messages`,
    {
      clientMessageId: input.clientMessageId,
      type: "text",
      text: input.text,
      quotedMessageId: input.quotedMessageId ?? null,
      mentionJids: input.mentionJids ?? null
    },
    session
  );
}

export function sendWaMediaMessage(
  session: Session,
  waConversationId: string,
  input: {
    clientMessageId: string;
    type: "image" | "video" | "audio" | "document";
    text?: string | null;
    quotedMessageId?: string | null;
    mentionJids?: string[] | null;
    attachment: { url: string; mimeType: string; fileName: string };
  }
) {
  return apiPostJson<{ jobId: string; waMessageId: string }>(
    `/api/wa/workbench/conversations/${waConversationId}/messages`,
    input,
    session
  );
}

export function sendWaReaction(
  session: Session,
  waMessageId: string,
  input: { conversationId: string; emoji: string }
) {
  return apiPostJson<{ jobId: string }>(
    `/api/wa/workbench/messages/${waMessageId}/reaction`,
    input,
    session
  );
}

export function editWaMessage(
  session: Session,
  waMessageId: string,
  input: { text: string; mentionJids?: string[] | null }
) {
  return apiFetch<{ edited: boolean }>(`/api/wa/workbench/messages/${waMessageId}`, session, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: input.text,
      mentionJids: input.mentionJids ?? null
    })
  });
}

export function deleteWaMessage(session: Session, waMessageId: string, scope: "me" | "everyone") {
  return apiFetch<{ deleted: boolean; scope: string }>(
    `/api/wa/workbench/messages/${waMessageId}?scope=${encodeURIComponent(scope)}`,
    session,
    { method: "DELETE" }
  );
}

export function loadMoreWaMessages(
  session: Session,
  waConversationId: string,
  input: { beforeSeq: number; limit?: number }
) {
  const params = new URLSearchParams({ beforeSeq: String(input.beforeSeq) });
  if (input.limit) params.set("limit", String(input.limit));
  return apiFetch<{ messages: import("./types").WaMessageItem[]; hasMore: boolean }>(
    `/api/wa/workbench/conversations/${waConversationId}/messages?${params}`,
    session
  );
}

export function listWaWorkbenchContacts(
  session: Session,
  input: { accountId: string; search?: string | null }
) {
  const params = new URLSearchParams({ accountId: input.accountId });
  if (input.search) params.set("search", input.search);
  return apiFetch<WaContactItem[]>(`/api/wa/workbench/contacts?${params}`, session);
}

export function openWaWorkbenchContactConversation(
  session: Session,
  input: { accountId: string; contactId: string }
) {
  return apiPostJson<WaConversationDetail>(
    `/api/wa/workbench/contacts/${input.contactId}/open`,
    { accountId: input.accountId },
    session
  );
}

export function triggerWaAccountSync(session: Session, waAccountId: string) {
  return apiPostJson<{ ok: boolean; message: string }>(
    `/api/wa/workbench/accounts/${waAccountId}/sync`,
    {},
    session
  );
}

export async function uploadWaAttachment(session: Session, file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/wa/workbench/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<{ url: string; mimeType: string; fileName: string }>;
}
