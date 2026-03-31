import crypto from "node:crypto";

import type { FastifyRequest } from "fastify";

import { db } from "../../infra/db/client.js";

export type PlatformAccessPayload = {
  sub: string;
  scope: "platform";
  role: "platform_admin";
  sessionId: string;
  type: "access";
};

export type PlatformRefreshPayload = {
  sub: string;
  scope: "platform";
  role: "platform_admin";
  sessionId: string;
  jti: string;
  type: "refresh";
};

type SessionRow = {
  session_id: string;
  identity_id: string;
  refresh_jti: string;
  status: string;
  expires_at: Date;
};

export type PlatformSessionListItem = {
  sessionId: string;
  identityId: string;
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

export async function createPlatformSession(input: {
  identityId: string;
  refreshJti: string;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
}) {
  const [row] = await db("platform_auth_sessions")
    .insert({
      identity_id: input.identityId,
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

export async function rotatePlatformRefreshToken(sessionId: string, refreshJti: string, expiresAt: Date): Promise<void> {
  await db("platform_auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ refresh_jti: refreshJti, expires_at: expiresAt, last_used_at: new Date(), updated_at: new Date() });
}

export async function revokePlatformSession(sessionId: string, reason: string): Promise<void> {
  await db("platform_auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });
}

export async function revokeAllPlatformSessions(identityId: string, reason: string): Promise<void> {
  await db("platform_auth_sessions")
    .where({ identity_id: identityId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });
}

export async function revokePlatformSessionsByFilter(filter: {
  identityId?: string;
  reason: string;
}): Promise<number> {
  const qb = db("platform_auth_sessions").where({ status: "active" });
  if (filter.identityId) qb.andWhere({ identity_id: filter.identityId });

  const affected = await qb.update({
    status: "revoked",
    revoked_at: new Date(),
    revoke_reason: filter.reason,
    updated_at: new Date()
  });

  return Number(affected);
}

export async function revokePlatformSessionById(sessionId: string, reason: string): Promise<boolean> {
  const affected = await db("platform_auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .update({ status: "revoked", revoked_at: new Date(), revoke_reason: reason, updated_at: new Date() });

  return Number(affected) > 0;
}

export async function listPlatformSessions(filter?: {
  identityId?: string;
  status?: string;
}): Promise<PlatformSessionListItem[]> {
  const rows = await db("platform_auth_sessions")
    .modify((qb) => {
      if (filter?.identityId) qb.where("identity_id", filter.identityId);
      if (filter?.status) qb.where("status", filter.status);
    })
    .select(
      "session_id",
      "identity_id",
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

  return rows.map((r: any) => ({
    sessionId: r.session_id,
    identityId: r.identity_id,
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

export async function assertActivePlatformAccessPayload(payload: PlatformAccessPayload): Promise<void> {
  const row = await getActivePlatformSession(payload.sessionId);
  if (!row) throw new Error("Session expired or revoked");
  if (row.identity_id !== payload.sub) throw new Error("Session identity mismatch");

  await db("platform_auth_sessions")
    .where({ session_id: payload.sessionId })
    .update({ last_used_at: new Date(), updated_at: new Date() });
}

export async function assertActivePlatformRefreshPayload(payload: PlatformRefreshPayload): Promise<void> {
  const row = await getActivePlatformSession(payload.sessionId);
  if (!row) throw new Error("Session expired or revoked");
  if (row.identity_id !== payload.sub) throw new Error("Session identity mismatch");
  if (row.refresh_jti !== payload.jti) throw new Error("Refresh token rotated or invalid");
}

export function newPlatformJti() {
  return crypto.randomUUID();
}

export function platformRefreshExpiryDate(days = 1) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function readPlatformRequestMeta(req: FastifyRequest) {
  const ip = req.ip;
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  return { ip, userAgent };
}

async function getActivePlatformSession(sessionId: string): Promise<SessionRow | null> {
  const row = await db<SessionRow>("platform_auth_sessions")
    .where({ session_id: sessionId, status: "active" })
    .first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await revokePlatformSession(sessionId, "expired");
    return null;
  }

  return row;
}
