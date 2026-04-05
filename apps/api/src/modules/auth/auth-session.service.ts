import crypto from "node:crypto";

import type { FastifyRequest } from "fastify";

import { db, withTenantTransaction } from "../../infra/db/client.js";

export type AccessPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  role: string;
  waSeatEnabled?: boolean;
  agentId?: string | null;
  sessionId: string;
  type: "access";
  scope?: string;
};

export type RefreshPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  role: string;
  waSeatEnabled?: boolean;
  agentId?: string | null;
  sessionId: string;
  jti: string;
  type: "refresh";
};

type SessionRow = {
  session_id: string;
  identity_id: string;
  membership_id: string;
  tenant_id: string;
  refresh_jti: string;
  status: string;
  expires_at: Date;
};

export type AuthSessionListItem = {
  sessionId: string;
  identityId: string;
  membershipId: string;
  tenantId: string;
  status: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdIp: string | null;
  createdUserAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

type MembershipRow = {
  membership_id: string;
  tenant_id: string;
  role: string;
  wa_seat_enabled: boolean;
  tenant_slug: string;
  tenant_name: string;
  is_default: boolean;
};

type ActiveMembershipRow = {
  membership_id: string;
  tenant_id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export async function createAuthSession(input: {
  identityId: string;
  membershipId: string;
  tenantId: string;
  refreshJti: string;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
}) {
  const [row] = await db("auth_sessions")
    .insert({
      identity_id: input.identityId,
      membership_id: input.membershipId,
      tenant_id: input.tenantId,
      refresh_jti: input.refreshJti,
      status: "active",
      expires_at: input.expiresAt,
      created_ip: input.ip ?? null,
      created_user_agent: input.userAgent ?? null,
      last_used_at: new Date()
    })
    .returning(["session_id"]);

  return row.session_id as string;
}

export async function getActiveSession(sessionId: string): Promise<SessionRow | null> {
  const row = await db<SessionRow>("auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await revokeSession(sessionId, "expired");
    return null;
  }

  return row;
}

export async function rotateRefreshToken(sessionId: string, refreshJti: string, expiresAt: Date): Promise<void> {
  await db("auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ refresh_jti: refreshJti, expires_at: expiresAt, last_used_at: new Date(), updated_at: new Date() });
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await db("auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });
}

export async function revokeAllIdentitySessions(identityId: string, reason: string): Promise<void> {
  await db("auth_sessions")
    .where({ identity_id: identityId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });
}

export async function revokeIdentitySessionById(identityId: string, sessionId: string, reason: string): Promise<boolean> {
  const affected = await db("auth_sessions")
    .where({ identity_id: identityId, session_id: sessionId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });

  return Number(affected) > 0;
}

export async function revokeAuthSessionById(sessionId: string, reason: string): Promise<boolean> {
  const affected = await db("auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });

  return Number(affected) > 0;
}

export async function revokeAuthSessionsByFilter(filter: {
  identityId?: string;
  tenantId?: string;
  reason: string;
}): Promise<number> {
  const qb = db("auth_sessions").where({ status: "active" });
  if (filter.identityId) qb.andWhere({ identity_id: filter.identityId });
  if (filter.tenantId) qb.andWhere({ tenant_id: filter.tenantId });

  const affected = await qb.update({
    status: "revoked",
    revoked_at: new Date(),
    revoke_reason: filter.reason,
    updated_at: new Date()
  });

  return Number(affected);
}

export async function listIdentitySessions(identityId: string): Promise<AuthSessionListItem[]> {
  const rows = await db("auth_sessions")
    .where({ identity_id: identityId })
    .select(
      "session_id",
      "identity_id",
      "membership_id",
      "tenant_id",
      "status",
      "expires_at",
      "last_used_at",
      "revoked_at",
      "revoke_reason",
      "created_ip",
      "created_user_agent",
      "created_at",
      "updated_at"
    )
    .orderBy("created_at", "desc");

  return rows.map((r) => ({
    sessionId: r.session_id,
    identityId: r.identity_id,
    membershipId: r.membership_id,
    tenantId: r.tenant_id,
    status: r.status,
    expiresAt: new Date(r.expires_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    revokeReason: r.revoke_reason ?? null,
    createdIp: r.created_ip ?? null,
    createdUserAgent: r.created_user_agent ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString()
  }));
}

export async function assertActiveAccessPayload(payload: AccessPayload): Promise<void> {
  const row = await getActiveSession(payload.sessionId);
  if (!row) throw new Error("Session expired or revoked");
  if (row.identity_id !== payload.sub) throw new Error("Session identity mismatch");
  if (row.membership_id !== payload.membershipId) throw new Error("Session membership mismatch");
  if (row.tenant_id !== payload.tenantId) throw new Error("Session tenant mismatch");

  const activeMembership = await getActiveMembership(payload.sub, payload.membershipId, payload.tenantId);
  if (!activeMembership) {
    await revokeSession(payload.sessionId, "membership_or_tenant_inactive");
    throw new Error("Membership inactive or tenant disabled");
  }

  await db("auth_sessions")
    .where({ session_id: payload.sessionId })
    .update({ last_used_at: new Date(), updated_at: new Date() });
}

export async function assertActiveRefreshPayload(payload: RefreshPayload): Promise<void> {
  const row = await getActiveSession(payload.sessionId);
  if (!row) throw new Error("Session expired or revoked");
  if (row.identity_id !== payload.sub) throw new Error("Session identity mismatch");
  if (row.membership_id !== payload.membershipId) throw new Error("Session membership mismatch");
  if (row.tenant_id !== payload.tenantId) throw new Error("Session tenant mismatch");
  if (row.refresh_jti !== payload.jti) throw new Error("Refresh token rotated or invalid");

  const activeMembership = await getActiveMembership(payload.sub, payload.membershipId, payload.tenantId);
  if (!activeMembership) {
    await revokeSession(payload.sessionId, "membership_or_tenant_inactive");
    throw new Error("Membership inactive or tenant disabled");
  }
}

export async function getIdentityMemberships(identityId: string): Promise<MembershipRow[]> {
  return db("tenant_memberships as tm")
    .join("tenants as t", "t.tenant_id", "tm.tenant_id")
    .where({
      "tm.identity_id": identityId,
      "tm.status": "active",
      "t.status": "active"
    })
    .select(
      "tm.membership_id",
      "tm.tenant_id",
      "tm.role",
      "tm.wa_seat_enabled",
      "tm.is_default",
      "t.slug as tenant_slug",
      "t.name as tenant_name"
    )
    .orderBy("tm.is_default", "desc")
    .orderBy("tm.created_at", "asc") as Promise<MembershipRow[]>;
}

export async function getAgentIdByMembership(tenantId: string, membershipId: string): Promise<string | null> {
  if (!isUuid(tenantId) || !isUuid(membershipId)) {
    return null;
  }

  const row = await withTenantTransaction(tenantId, async (trx) => trx("agent_profiles")
    .where({ tenant_id: tenantId, membership_id: membershipId })
    .select("agent_id")
    .first());

  return (row?.agent_id as string | undefined) ?? null;
}

export function newJti() {
  return crypto.randomUUID();
}

export function refreshExpiryDate(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function readRequestMeta(req: FastifyRequest) {
  const ip = req.ip;
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  return { ip, userAgent };
}

async function getActiveMembership(identityId: string, membershipId: string, tenantId: string): Promise<ActiveMembershipRow | null> {
  if (!isUuid(identityId) || !isUuid(membershipId) || !isUuid(tenantId)) {
    return null;
  }

  const row = await db("tenant_memberships as tm")
    .join("tenants as t", "t.tenant_id", "tm.tenant_id")
    .where({
      "tm.identity_id": identityId,
      "tm.membership_id": membershipId,
      "tm.tenant_id": tenantId,
      "tm.status": "active",
      "t.status": "active"
    })
    .select("tm.membership_id", "tm.tenant_id")
    .first<ActiveMembershipRow>();

  return row ?? null;
}
