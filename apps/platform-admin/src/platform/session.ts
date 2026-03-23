import type { LoginResponse, PlatformSession } from "./types";

const SESSION_KEY = "nuychat.platformSession";

export function readSession(): PlatformSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformSession;
  } catch {
    return null;
  }
}

export function writeSession(data: LoginResponse): PlatformSession {
  const session: PlatformSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    identityId: data.user.identityId,
    email: data.user.email,
    role: data.user.role
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
