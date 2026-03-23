import type { Session } from "./types";

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem("nuychat.authSession");
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  localStorage.setItem("nuychat.authSession", JSON.stringify(session));
}

export function apiHeaders(session: Session): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`
  };
}
