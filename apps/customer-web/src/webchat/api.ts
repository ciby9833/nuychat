import type { WebchatClientContext, WebchatMessagesResponse, WebchatSession, WebchatAttachment } from "./types";
import { resolveApiBase } from "./config";

const API_BASE = resolveApiBase();

export class WebchatApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "WebchatApiError";
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let detail = "";
  try {
    const payload = (await response.json()) as { message?: string };
    detail = payload?.message ? `: ${payload.message}` : "";
  } catch {
    try {
      const text = await response.text();
      detail = text ? `: ${text.slice(0, 140)}` : "";
    } catch {
      detail = "";
    }
  }
  throw new WebchatApiError(response.status, `${response.status} ${response.statusText}${detail}`);
}

export async function createWebchatSession(input: {
  publicKey: string;
  customerRef?: string;
  displayName?: string;
  client?: WebchatClientContext;
}): Promise<WebchatSession> {
  const response = await fetch(`${API_BASE}/api/webchat/public/${encodeURIComponent(input.publicKey)}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerRef: input.customerRef,
      displayName: input.displayName,
      client: input.client
    })
  });
  await assertOk(response);

  return response.json() as Promise<WebchatSession>;
}

export async function fetchWebchatMessages(input: {
  publicKey: string;
  customerRef: string;
  since?: string;
}): Promise<WebchatMessagesResponse> {
  const query = new URLSearchParams({ customerRef: input.customerRef });
  if (input.since) {
    query.set("since", input.since);
  }

  const response = await fetch(
    `${API_BASE}/api/webchat/public/${encodeURIComponent(input.publicKey)}/messages?${query.toString()}`
  );
  await assertOk(response);

  return response.json() as Promise<WebchatMessagesResponse>;
}

export async function sendWebchatMessage(input: {
  publicKey: string;
  customerRef: string;
  displayName?: string;
  text?: string;
  attachments?: WebchatAttachment[];
  replyToMessageId?: string;
  reactionEmoji?: string;
  reactionToMessageId?: string;
  client?: WebchatClientContext;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/api/webchat/public/${encodeURIComponent(input.publicKey)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  await assertOk(response);
}

export async function uploadWebchatAttachment(input: {
  publicKey: string;
  file: File;
}): Promise<WebchatAttachment> {
  const formData = new FormData();
  formData.append("file", input.file);

  const response = await fetch(`${API_BASE}/api/webchat/public/${encodeURIComponent(input.publicKey)}/upload`, {
    method: "POST",
    body: formData
  });
  await assertOk(response);

  const payload = await response.json() as {
    url: string;
    mimeType: string;
    fileName: string;
    fileSize: number;
  };

  return {
    name: payload.fileName,
    mimeType: payload.mimeType,
    size: payload.fileSize,
    url: payload.url
  };
}
