import type { AdminSession, LoginResponse } from "./types";

const SESSION_KEY = "nuychat.authSession";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuid(value: unknown): value is string {
  return isNonEmptyString(value) && UUID_PATTERN.test(value.trim());
}

function isValidSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AdminSession>;
  if (
    !isNonEmptyString(session.accessToken) ||
    !isNonEmptyString(session.refreshToken) ||
    !isUuid(session.identityId) ||
    !isNonEmptyString(session.email) ||
    !isNonEmptyString(session.role) ||
    !isUuid(session.tenantId) ||
    !isNonEmptyString(session.tenantSlug) ||
    !isUuid(session.membershipId) ||
    !Array.isArray(session.memberships)
  ) {
    return false;
  }

  return session.memberships.every((membership) => (
    membership &&
    typeof membership === "object" &&
    isUuid((membership as { membershipId?: unknown }).membershipId) &&
    isUuid((membership as { tenantId?: unknown }).tenantId) &&
    isNonEmptyString((membership as { tenantSlug?: unknown }).tenantSlug) &&
    isNonEmptyString((membership as { tenantName?: unknown }).tenantName) &&
    isNonEmptyString((membership as { role?: unknown }).role) &&
    typeof (membership as { isDefault?: unknown }).isDefault === "boolean"
  ));
}

export function readTenantSession(): AdminSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSession(parsed)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
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
