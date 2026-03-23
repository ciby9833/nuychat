import type { AdminSession, LoginResponse } from "./types";

const SESSION_KEY = "nuychat.authSession";

export function readTenantSession(): AdminSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function writeTenantSession(data: LoginResponse): AdminSession {
  const session: AdminSession = {
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearTenantSession() {
  localStorage.removeItem(SESSION_KEY);
}
