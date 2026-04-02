import crypto from "node:crypto";
import { promisify } from "node:util";
import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import {
  assertActiveAccessPayload,
  assertActiveRefreshPayload,
  createAuthSession,
  getAgentIdByMembership,
  getIdentityMemberships,
  listIdentitySessions,
  newJti,
  readRequestMeta,
  roleUsesAgentProfile,
  refreshExpiryDate,
  revokeAllIdentitySessions,
  revokeIdentitySessionById,
  revokeSession,
  rotateRefreshToken,
  type AccessPayload,
  type RefreshPayload
} from "./auth-session.service.js";

const scrypt = promisify(crypto.scrypt);

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const RefreshBody = z.object({
  refreshToken: z.string().min(1)
});

const SwitchTenantBody = z.object({
  membershipId: z.string().uuid()
});

const LogoutBody = z.object({
  allSessions: z.boolean().optional().default(false)
});

const SessionIdParam = z.object({
  sessionId: z.string().uuid()
});

type IdentityRow = {
  identity_id: string;
  email: string;
  password_hash: string;
};

type Membership = {
  membership_id: string;
  tenant_id: string;
  role: string;
  tenant_slug: string;
  tenant_name: string;
  is_default: boolean;
};

export const authRoutes: FastifyPluginAsync = fp(async (app) => {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { email, password } = parsed.data;

    const identity = await db<IdentityRow>("identities")
      .where({ email, status: "active" } as any)
      .select("identity_id", "email", "password_hash")
      .first();

    if (!identity || !identity.password_hash) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, identity.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const memberships = await getIdentityMemberships(identity.identity_id);
    if (memberships.length === 0) {
      return reply.status(403).send({ error: "No active tenant membership" });
    }

    const activeMembership = memberships[0];
    const result = await issueTokensForMembership(req, reply, identity, activeMembership, memberships);
    return result;
  });

  app.post("/api/auth/refresh", async (req, reply) => {
    const parsed = RefreshBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    let payload: RefreshPayload;
    try {
      payload = app.jwt.verify<RefreshPayload>(parsed.data.refreshToken);
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }

    if (payload.type !== "refresh") {
      return reply.status(401).send({ error: "Invalid token type" });
    }

    try {
      await assertActiveRefreshPayload(payload);
    } catch {
      await revokeSession(payload.sessionId, "refresh_invalid");
      return reply.status(401).send({ error: "Refresh session invalid" });
    }

    const memberships = await getIdentityMemberships(payload.sub);
    const membership = memberships.find((m) => m.membership_id === payload.membershipId);
    if (!membership) {
      await revokeSession(payload.sessionId, "membership_inactive");
      return reply.status(403).send({ error: "Membership inactive" });
    }

    const nextRefreshJti = newJti();
    const nextExpires = refreshExpiryDate(1); // 24-hour sessions
    await rotateRefreshToken(payload.sessionId, nextRefreshJti, nextExpires);

    const agentId = roleUsesAgentProfile(membership.role)
      ? await getAgentIdByMembership(membership.tenant_id, membership.membership_id)
      : null;

    const accessToken = await reply.jwtSign(
      {
        sub: payload.sub,
        tenantId: membership.tenant_id,
        membershipId: membership.membership_id,
        role: membership.role,
        agentId,
        sessionId: payload.sessionId,
        type: "access"
      },
      { expiresIn: "1h" }
    );

    const refreshToken = await reply.jwtSign(
      {
        sub: payload.sub,
        tenantId: membership.tenant_id,
        membershipId: membership.membership_id,
        role: membership.role,
        agentId,
        sessionId: payload.sessionId,
        jti: nextRefreshJti,
        type: "refresh"
      },
      { expiresIn: "24h" }
    );

    return { accessToken, refreshToken };
  });

  app.post("/api/auth/switch-tenant", async (req, reply) => {
    const parsed = SwitchTenantBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const auth = await req.jwtVerify<AccessPayload>();

    if (auth.type !== "access") {
      return reply.status(401).send({ error: "Access token required" });
    }
    try {
      await assertActiveAccessPayload(auth);
    } catch {
      return reply.status(401).send({ error: "Session expired or revoked" });
    }

    const memberships = await getIdentityMemberships(auth.sub);
    const target = memberships.find((m) => m.membership_id === parsed.data.membershipId);
    if (!target) {
      return reply.status(403).send({ error: "Membership not found" });
    }

    await revokeSession(auth.sessionId, "tenant_switched");

    const identity = await db<IdentityRow>("identities")
      .where({ identity_id: auth.sub })
      .select("identity_id", "email", "password_hash")
      .first();

    if (!identity) {
      return reply.status(404).send({ error: "Identity not found" });
    }

    const result = await issueTokensForMembership(req, reply, identity, target, memberships);
    return result;
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const parsed = LogoutBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const payload = await req.jwtVerify<AccessPayload>();
    if (payload.type !== "access") {
      return reply.status(401).send({ error: "Access token required" });
    }
    try {
      await assertActiveAccessPayload(payload);
    } catch {
      return reply.status(401).send({ error: "Session expired or revoked" });
    }

    if (parsed.data.allSessions) {
      await revokeAllIdentitySessions(payload.sub, "logout_all");

      // Mark all agent profiles for this identity as offline
      const memberships = await getIdentityMemberships(payload.sub);
      await Promise.allSettled(
        memberships.map(async (m) => {
          const aid = roleUsesAgentProfile(m.role)
            ? await getAgentIdByMembership(m.tenant_id, m.membership_id)
            : null;
          if (!aid) return;
          await withTenantTransaction(m.tenant_id, async (trx) => {
            await trx("agent_profiles")
              .where({ tenant_id: m.tenant_id, agent_id: aid })
              .update({
                status: "offline",
                presence_state: "offline",
                last_seen_at: null,
                last_heartbeat_at: null,
                last_activity_at: null,
                updated_at: new Date()
              });
          });
        })
      );
    } else {
      await revokeSession(payload.sessionId, "logout");

      // Mark the agent attached to this session as offline immediately
      if (payload.agentId) {
        try {
          await withTenantTransaction(payload.tenantId, async (trx) => {
            await trx("agent_profiles")
              .where({ tenant_id: payload.tenantId, agent_id: payload.agentId })
              .update({
                status: "offline",
                presence_state: "offline",
                last_seen_at: null,
                last_heartbeat_at: null,
                last_activity_at: null,
                updated_at: new Date()
              });
          });
        } catch {
          // non-critical — idle detection will catch it within 30 minutes anyway
        }
      }
    }

    return { success: true };
  });

  app.get("/api/auth/memberships", async (req) => {
    const payload = await req.jwtVerify<AccessPayload>();
    if (payload.type !== "access") {
      throw app.httpErrors.unauthorized("Access token required");
    }
    try {
      await assertActiveAccessPayload(payload);
    } catch {
      throw app.httpErrors.unauthorized("Session expired or revoked");
    }

    const memberships = await getIdentityMemberships(payload.sub);
    const membershipAgentPairs = await Promise.all(
      memberships.map(async (m) => ({
        membershipId: m.membership_id,
      agentId: roleUsesAgentProfile(m.role)
        ? await getAgentIdByMembership(m.tenant_id, m.membership_id)
        : null
      }))
    );
    const agentIdByMembership = new Map(membershipAgentPairs.map((item) => [item.membershipId, item.agentId]));
    return {
      memberships: memberships.map((m) => ({
        membershipId: m.membership_id,
        tenantId: m.tenant_id,
        tenantSlug: m.tenant_slug,
        tenantName: m.tenant_name,
        role: m.role,
        isDefault: m.is_default,
        agentId: agentIdByMembership.get(m.membership_id) ?? null
      }))
    };
  });

  app.get("/api/auth/sessions", async (req) => {
    const payload = await req.jwtVerify<AccessPayload>();
    if (payload.type !== "access") {
      throw app.httpErrors.unauthorized("Access token required");
    }
    try {
      await assertActiveAccessPayload(payload);
    } catch {
      throw app.httpErrors.unauthorized("Session expired or revoked");
    }

    const sessions = await listIdentitySessions(payload.sub);
    return {
      currentSessionId: payload.sessionId,
      sessions
    };
  });

  app.post("/api/auth/sessions/:sessionId/revoke", async (req, reply) => {
    const params = SessionIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid sessionId" });
    }

    const payload = await req.jwtVerify<AccessPayload>();
    if (payload.type !== "access") {
      return reply.status(401).send({ error: "Access token required" });
    }
    try {
      await assertActiveAccessPayload(payload);
    } catch {
      return reply.status(401).send({ error: "Session expired or revoked" });
    }

    if (params.data.sessionId === payload.sessionId) {
      await revokeSession(payload.sessionId, "self_revoke");
      return { success: true, currentSessionRevoked: true };
    }

    const revoked = await revokeIdentitySessionById(payload.sub, params.data.sessionId, "manual_revoke");
    if (!revoked) {
      return reply.status(404).send({ error: "Session not found or already inactive" });
    }

    return { success: true, currentSessionRevoked: false };
  });
});

async function issueTokensForMembership(
  req: FastifyRequest,
  reply: FastifyReply,
  identity: IdentityRow,
  activeMembership: Membership,
  memberships: Membership[]
) {
  const refreshJti = newJti();
  const expiresAt = refreshExpiryDate(1); // 24-hour sessions
  const { ip, userAgent } = readRequestMeta(req);

  const sessionId = await createAuthSession({
    identityId: identity.identity_id,
    membershipId: activeMembership.membership_id,
    tenantId: activeMembership.tenant_id,
    refreshJti,
    expiresAt,
    ip,
    userAgent
  });

  const agentId = roleUsesAgentProfile(activeMembership.role)
    ? await getAgentIdByMembership(activeMembership.tenant_id, activeMembership.membership_id)
    : null;
  const membershipAgentPairs = await Promise.all(
    memberships.map(async (row) => ({
      membershipId: row.membership_id,
      agentId: roleUsesAgentProfile(row.role)
        ? await getAgentIdByMembership(row.tenant_id, row.membership_id)
        : null
    }))
  );
  const agentIdByMembership = new Map(membershipAgentPairs.map((item) => [item.membershipId, item.agentId]));

  const accessToken = await reply.jwtSign(
    {
      sub: identity.identity_id,
      tenantId: activeMembership.tenant_id,
      membershipId: activeMembership.membership_id,
      role: activeMembership.role,
      agentId,
      sessionId,
      type: "access"
    },
    { expiresIn: "1h" }
  );

  const refreshToken = await reply.jwtSign(
    {
      sub: identity.identity_id,
      tenantId: activeMembership.tenant_id,
      membershipId: activeMembership.membership_id,
      role: activeMembership.role,
      agentId,
      sessionId,
      jti: refreshJti,
      type: "refresh"
    },
    { expiresIn: "24h" }
  );

  return {
    accessToken,
    refreshToken,
    user: {
      identityId: identity.identity_id,
      email: identity.email,
      role: activeMembership.role,
      tenantId: activeMembership.tenant_id,
      tenantSlug: activeMembership.tenant_slug,
      membershipId: activeMembership.membership_id,
      agentId
    },
    memberships: memberships.map((row) => ({
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      role: row.role,
      isDefault: row.is_default,
      agentId: agentIdByMembership.get(row.membership_id) ?? null
    }))
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const storedHash = Buffer.from(hashHex, "hex");
  return crypto.timingSafeEqual(hash, storedHash);
}
