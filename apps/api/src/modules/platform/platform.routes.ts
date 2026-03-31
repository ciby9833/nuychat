import crypto from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requiresAIProviderApiKeyOnCreate } from "../../../../../packages/shared-types/src/ai-model-config.js";

import { db } from "../../infra/db/client.js";
import {
  assertActivePlatformAccessPayload,
  assertActivePlatformRefreshPayload,
  createPlatformSession,
  listPlatformSessions,
  newPlatformJti,
  platformRefreshExpiryDate,
  readPlatformRequestMeta,
  revokeAllPlatformSessions,
  revokePlatformSessionsByFilter,
  revokePlatformSessionById,
  revokePlatformSession,
  rotatePlatformRefreshToken,
  type PlatformAccessPayload,
  type PlatformRefreshPayload
} from "./platform-auth-session.service.js";
import { revokeAuthSessionById, revokeAuthSessionsByFilter } from "../auth/auth-session.service.js";
import { buildDefaultChannelId } from "../channel/tenant-channel-config.service.js";

const scrypt = promisify(crypto.scrypt);

const PLATFORM_SCOPE = "platform";
const PLATFORM_ROLE = "platform_admin";
const AI_MODEL_ACCESS_MODES = ["platform_managed", "tenant_managed"] as const;
const AI_PROVIDER_OPTIONS = ["openai", "claude", "gemini", "deepseek", "llama", "kimi", "qwen", "private"] as const;

const PlatformLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const PlatformRefreshBody = z.object({
  refreshToken: z.string().min(1)
});

const PlatformLogoutBody = z.object({
  allSessions: z.boolean().optional().default(false)
});

const TenantListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional()
});

const TenantCreateBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must contain only lowercase letters, numbers, and hyphens"),
  planCode: z.string().min(1).default("starter"),
  operatingMode: z.enum(["human_first", "ai_first", "ai_autonomous", "workflow_first"]).default("ai_first"),
  licensedSeats: z.coerce.number().int().min(1).max(100000).optional(),
  licensedAiSeats: z.coerce.number().int().min(0).max(100000).default(0),
  aiModelAccessMode: z.enum(AI_MODEL_ACCESS_MODES).default("platform_managed"),
  aiProvider: z.enum(AI_PROVIDER_OPTIONS).optional(),
  aiModel: z.string().min(1).max(160).optional(),
  aiApiKey: z.string().min(1).max(2000).optional(),
  aiBaseUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional()
});

const TenantPatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9-]+$/, "slug must contain only lowercase letters, numbers, and hyphens")
      .optional(),
    status: z.enum(["active", "suspended", "inactive"]).optional(),
    planCode: z.string().min(1).optional(),
    operatingMode: z.enum(["human_first", "ai_first", "ai_autonomous", "workflow_first"]).optional(),
    licensedSeats: z.union([z.coerce.number().int().min(1).max(100000), z.null()]).optional(),
    licensedAiSeats: z.union([z.coerce.number().int().min(0).max(100000), z.null()]).optional(),
    aiModelAccessMode: z.enum(AI_MODEL_ACCESS_MODES).optional(),
    aiProvider: z.enum(AI_PROVIDER_OPTIONS).optional(),
    aiModel: z.string().min(1).max(160).optional(),
    aiApiKey: z.string().min(1).max(2000).optional(),
    aiBaseUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const TenantIdParam = z.object({
  tenantId: z.string().uuid()
});

const IdentityCreateBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  status: z.enum(["active", "inactive"]).default("active")
});

const TenantAccountCreateBody = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
  role: z.string().min(1).max(30),
  status: z.enum(["active", "inactive"]).default("active"),
  isDefault: z.boolean().default(false)
});

const MembershipCreateBody = z.object({
  tenantId: z.string().uuid(),
  identityId: z.string().uuid(),
  role: z.string().min(1).max(30),
  status: z.enum(["active", "inactive"]).default("active"),
  isDefault: z.boolean().default(false)
});

const MembershipPatchBody = z
  .object({
    role: z.string().min(1).max(30).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    isDefault: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const MembershipIdParam = z.object({
  membershipId: z.string().uuid()
});

const PlatformSessionsQuery = z.object({
  scope: z.enum(["all", "tenant", "platform"]).default("all"),
  status: z.enum(["active", "revoked", "expired"]).optional(),
  identityId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const PlatformSessionRevokeParam = z.object({
  scope: z.enum(["tenant", "platform"]),
  sessionId: z.string().uuid()
});

const PlatformSessionBulkRevokeBody = z.object({
  scope: z.enum(["all", "tenant", "platform"]).default("all"),
  identityId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  reason: z.string().min(1).max(120).optional()
});

const PlatformAuditLogsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().min(1).max(120).optional(),
  targetType: z.string().min(1).max(60).optional(),
  targetId: z.string().min(1).max(120).optional(),
  actorIdentityId: z.string().uuid().optional(),
  status: z.enum(["success", "failed"]).optional()
});

const PlatformQuotaOverviewQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["healthy", "warning", "exceeded", "unlimited"]).optional()
});

const PlatformBillingOverviewQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["issued", "partially_paid", "paid", "void", "overdue"]).optional(),
  tenantId: z.string().uuid().optional()
});

const PlatformAIUsageOverviewQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).optional(),
  model: z.string().optional(),
  status: z.enum(["healthy", "warning", "blocked", "unlimited"]).optional(),
  days: z.coerce.number().int().min(1).max(180).default(30)
});

const PlatformAIBudgetPolicyPatchBody = z
  .object({
    includedTokens: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    monthlyBudgetUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
    softLimitUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
    hardLimitUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
    enforcementMode: z.enum(["notify", "throttle", "block"]).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const PlatformTenantAIConfigPatchBody = z
  .object({
    provider: z.enum(AI_PROVIDER_OPTIONS).optional(),
    model: z.string().min(1).max(160).optional(),
    apiKey: z.string().min(1).max(2000).optional(),
    baseUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const PlatformBillingCloseCycleBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDays: z.coerce.number().int().min(1).max(90).default(7),
  currency: z.string().min(3).max(8).default("USD"),
  tenantId: z.string().uuid().optional()
});

const PlatformInvoiceParam = z.object({
  invoiceId: z.string().uuid()
});

const PlatformPaymentReconcileBody = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().min(1).max(40).default("bank_transfer"),
  referenceNo: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
  receivedAt: z.string().datetime().optional()
});

const BillingStatementQuery = z.object({
  lang: z.enum(["en", "zh-CN", "id"]).default("en"),
  includeTax: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  taxRate: z.coerce.number().min(0).max(1).default(0),
  brandName: z.string().max(120).optional(),
  companyName: z.string().max(200).optional(),
  companyAddress: z.string().max(300).optional(),
  supportEmail: z.string().email().optional(),
  website: z.string().max(200).optional(),
  taxId: z.string().max(80).optional()
});

const MarketplaceSkillsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tier: z.enum(["official", "private", "third_party"]).optional(),
  status: z.enum(["draft", "published", "deprecated"]).optional(),
  search: z.string().optional(),
  ownerTenantId: z.string().uuid().optional()
});

const MarketplaceSkillParam = z.object({
  skillId: z.string().uuid()
});

const MarketplaceSkillCreateBody = z.object({
  slug: z.string().min(3).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).default(""),
  tier: z.enum(["official", "private", "third_party"]),
  ownerTenantId: z.string().uuid().optional(),
  providerIdentityId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "deprecated"]).default("draft"),
  version: z.string().min(1).max(40).default("1.0.0"),
  changelog: z.string().max(4000).default("Initial release"),
  manifest: z.record(z.string(), z.unknown()).default({})
});

const MarketplaceSkillPatchBody = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(4000).optional(),
    status: z.enum(["draft", "published", "deprecated"]).optional(),
    manifest: z.record(z.string(), z.unknown()).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const MarketplacePublishBody = z.object({
  version: z.string().min(1).max(40).default("1.0.0"),
  changelog: z.string().max(4000).default("Published via platform marketplace"),
  manifest: z.record(z.string(), z.unknown()).optional()
});

const MarketplaceInstallsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tenantId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  status: z.enum(["active", "disabled"]).optional()
});

type PlatformIdentityRow = {
  identity_id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  identity_status: string;
};

type PlanRow = {
  plan_id: string;
  code: string;
  name: string;
  max_agents: number | null;
  ai_token_quota_monthly: number | null;
};

type IdentityRow = {
  identity_id: string;
  email: string;
  status: string;
};

export async function platformRoutes(app: FastifyInstance) {
  app.post("/api/platform/auth/login", async (req, reply) => {
    const parsed = PlatformLoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const identity = await db("identities as i")
      .join("platform_admins as pa", "pa.identity_id", "i.identity_id")
      .where({
        "i.email": parsed.data.email,
        "i.status": "active",
        "pa.is_active": true
      })
      .select(
        "i.identity_id",
        "i.email",
        "i.password_hash",
        "i.status as identity_status",
        "pa.role",
        "pa.is_active"
      )
      .first<PlatformIdentityRow>();

    if (!identity) {
      return reply.status(401).send({ error: "invalid_credentials", message: "Invalid credentials" });
    }

    const valid = await verifyPassword(parsed.data.password, identity.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "invalid_credentials", message: "Invalid credentials" });
    }

    const refreshJti = newPlatformJti();
    const expiresAt = platformRefreshExpiryDate(1);
    const { ip, userAgent } = readPlatformRequestMeta(req);
    const sessionId = await createPlatformSession({
      identityId: identity.identity_id,
      refreshJti,
      expiresAt,
      ip,
      userAgent
    });

    const tokens = await issuePlatformTokens(reply, identity.identity_id, sessionId, refreshJti);
    return {
      ...tokens,
      user: {
        identityId: identity.identity_id,
        email: identity.email,
        role: PLATFORM_ROLE
      }
    };
  });

  app.post("/api/platform/auth/refresh", async (req, reply) => {
    const parsed = PlatformRefreshBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    let payload: PlatformRefreshPayload;
    try {
      payload = app.jwt.verify<PlatformRefreshPayload>(parsed.data.refreshToken);
    } catch {
      return reply.status(401).send({ error: "invalid_token", message: "Invalid refresh token" });
    }

    if (payload.type !== "refresh" || payload.scope !== PLATFORM_SCOPE || payload.role !== PLATFORM_ROLE) {
      return reply.status(401).send({ error: "invalid_token", message: "Invalid refresh token" });
    }

    try {
      await assertActivePlatformRefreshPayload(payload);
    } catch {
      await revokePlatformSession(payload.sessionId, "refresh_invalid");
      return reply.status(401).send({ error: "invalid_token", message: "Refresh session invalid" });
    }

    const activeAdmin = await isPlatformAdminActive(payload.sub);
    if (!activeAdmin) {
      await revokePlatformSession(payload.sessionId, "platform_admin_revoked");
      return reply.status(403).send({ error: "forbidden", message: "Platform admin access revoked" });
    }

    const nextRefreshJti = newPlatformJti();
    const nextExpires = platformRefreshExpiryDate(1);
    await rotatePlatformRefreshToken(payload.sessionId, nextRefreshJti, nextExpires);

    const tokens = await issuePlatformTokens(reply, payload.sub, payload.sessionId, nextRefreshJti);
    return tokens;
  });

  app.post("/api/platform/auth/logout", async (req, reply) => {
    const parsed = PlatformLogoutBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const payload = await requirePlatformAccess(app, req);
    if (parsed.data.allSessions) {
      await revokeAllPlatformSessions(payload.sub, "logout_all");
    } else {
      await revokePlatformSession(payload.sessionId, "logout");
    }

    return { success: true };
  });

  app.get("/api/platform/sessions", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = PlatformSessionsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { scope, status, identityId, tenantId, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const result: Array<Record<string, unknown>> = [];

    if (scope === "all" || scope === "platform") {
      const platformSessions = await listPlatformSessions({
        identityId,
        status
      });

      for (const s of platformSessions) {
        result.push({
          scope: "platform",
          sessionId: s.sessionId,
          identityId: s.identityId,
          tenantId: null,
          membershipId: null,
          status: s.status,
          expiresAt: s.expiresAt,
          lastUsedAt: s.lastUsedAt,
          revokedAt: s.revokedAt,
          revokeReason: s.revokeReason,
          createdIp: s.createdIp,
          createdUserAgent: s.createdUserAgent,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        });
      }
    }

    if (scope === "all" || scope === "tenant") {
      const tenantRows = await db("auth_sessions as s")
        .modify((qb) => {
          if (status) qb.where("s.status", status);
          if (identityId) qb.where("s.identity_id", identityId);
          if (tenantId) qb.where("s.tenant_id", tenantId);
        })
        .select(
          "s.session_id",
          "s.identity_id",
          "s.membership_id",
          "s.tenant_id",
          "s.status",
          "s.expires_at",
          "s.last_used_at",
          "s.revoked_at",
          "s.revoke_reason",
          "s.created_ip",
          "s.created_user_agent",
          "s.created_at",
          "s.updated_at"
        )
        .orderBy("s.created_at", "desc");

      for (const r of tenantRows) {
        result.push({
          scope: "tenant",
          sessionId: r.session_id,
          identityId: r.identity_id,
          tenantId: r.tenant_id,
          membershipId: r.membership_id,
          status: r.status,
          expiresAt: new Date(r.expires_at).toISOString(),
          lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          revokeReason: r.revoke_reason ?? null,
          createdIp: r.created_ip ?? null,
          createdUserAgent: r.created_user_agent ?? null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString()
        });
      }
    }

    const sorted = result.sort((a, b) => {
      const ta = Date.parse(String(a.createdAt));
      const tb = Date.parse(String(b.createdAt));
      return tb - ta;
    });

    const pageItems = sorted.slice(offset, offset + limit);

    return {
      page,
      limit,
      total: sorted.length,
      items: pageItems
    };
  });

  app.post("/api/platform/sessions/:scope/:sessionId/revoke", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = PlatformSessionRevokeParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid scope/sessionId" });
    }

    const reason = "platform_manual_revoke";
    let revoked = false;
    if (params.data.scope === "platform") {
      revoked = await revokePlatformSessionById(params.data.sessionId, reason);
    } else {
      revoked = await revokeAuthSessionById(params.data.sessionId, reason);
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "session.revoke",
      targetType: "session",
      targetId: params.data.sessionId,
      status: revoked ? "success" : "failed",
      req,
      payload: { scope: params.data.scope, reason }
    });

    if (!revoked) {
      return reply.status(404).send({ error: "not_found", message: "Session not found or already inactive" });
    }

    return { success: true };
  });

  app.post("/api/platform/sessions/revoke-all", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = PlatformSessionBulkRevokeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const { scope, identityId, tenantId } = parsed.data;
    const reason = parsed.data.reason?.trim() || "platform_bulk_revoke";
    let revokedPlatform = 0;
    let revokedTenant = 0;

    if (scope === "all" || scope === "platform") {
      revokedPlatform = await revokePlatformSessionsByFilter({ identityId, reason });
    }
    if (scope === "all" || scope === "tenant") {
      revokedTenant = await revokeAuthSessionsByFilter({ identityId, tenantId, reason });
    }

    const total = revokedPlatform + revokedTenant;

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "session.revoke.bulk",
      targetType: "session",
      status: "success",
      req,
      payload: {
        scope,
        identityId: identityId ?? null,
        tenantId: tenantId ?? null,
        reason,
        revokedPlatform,
        revokedTenant,
        total
      }
    });

    return {
      success: true,
      scope,
      revokedPlatform,
      revokedTenant,
      total
    };
  });

  app.get("/api/platform/audit-logs", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = PlatformAuditLogsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, action, targetType, targetId, actorIdentityId, status } = parsed.data;
    const offset = (page - 1) * limit;
    const base = db("platform_audit_logs as l")
      .leftJoin("identities as i", "i.identity_id", "l.actor_identity_id")
      .modify((qb) => {
        if (action) qb.where("l.action", action);
        if (targetType) qb.where("l.target_type", targetType);
        if (targetId) qb.where("l.target_id", targetId);
        if (actorIdentityId) qb.where("l.actor_identity_id", actorIdentityId);
        if (status) qb.where("l.status", status);
      });

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .select(
          "l.audit_id",
          "l.actor_identity_id",
          "i.email as actor_email",
          "l.action",
          "l.target_type",
          "l.target_id",
          "l.status",
          "l.payload",
          "l.request_ip",
          "l.user_agent",
          "l.created_at"
        )
        .orderBy("l.created_at", "desc")
        .limit(limit)
        .offset(offset),
      base.clone().count<{ cnt: string }>("l.audit_id as cnt").first()
    ]);

    return {
      page,
      limit,
      total: Number(countRow?.cnt ?? 0),
      items: rows.map((r: any) => ({
        auditId: r.audit_id,
        actorIdentityId: r.actor_identity_id,
        actorEmail: r.actor_email ?? null,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id ?? null,
        status: r.status,
        payload: r.payload ?? {},
        requestIp: r.request_ip ?? null,
        userAgent: r.user_agent ?? null,
        createdAt: new Date(r.created_at).toISOString()
      }))
    };
  });

  app.get("/api/platform/quotas/overview", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = PlatformQuotaOverviewQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, search, status } = parsed.data;
    const offset = (page - 1) * limit;

    const rows = await db("tenants as t")
      .leftJoin("tenant_plans as p", "p.plan_id", "t.plan_id")
      .modify((qb) => {
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.where((b) => b.whereILike("t.name", value).orWhereILike("t.slug", value));
        }
      })
      .select(
        "t.tenant_id",
        "t.name",
        "t.slug",
        "t.status as tenant_status",
        "t.licensed_seats",
        "t.licensed_ai_seats",
        "p.code as plan_code",
        "p.name as plan_name"
      )
      .orderBy("t.created_at", "desc");

    const tenantIds = rows.map((row: any) => row.tenant_id);
    const [seatUsageByTenant, accountCountByTenant, aiSeatUsageByTenant] = await Promise.all([
      getActiveSeatUsageMap(tenantIds),
      getTenantAccountCountMap(tenantIds),
      getActiveAISeatUsageMap(tenantIds)
    ]);

    const mapped = rows
      .map((r: any) => {
        const quotaLimit = r.licensed_seats === null ? null : Number(r.licensed_seats);
        const aiSeatLimit = Number(r.licensed_ai_seats ?? 0);
        const quotaUsed = seatUsageByTenant.get(r.tenant_id) ?? 0;
        const usageRatio = quotaLimit && quotaLimit > 0 ? quotaUsed / quotaLimit : null;
        const computedStatus =
          quotaLimit === null
            ? "unlimited"
            : quotaUsed >= quotaLimit
              ? "exceeded"
              : usageRatio !== null && usageRatio >= 0.8
                ? "warning"
                : "healthy";

        return {
          tenantId: r.tenant_id,
          tenantName: r.name,
          tenantSlug: r.slug,
          tenantStatus: r.tenant_status,
          planCode: r.plan_code ?? null,
          planName: r.plan_name ?? null,
          quotaUsed,
          quotaLimit,
          aiSeatLimit,
          aiSeatUsed: aiSeatUsageByTenant.get(r.tenant_id) ?? 0,
          totalAccounts: accountCountByTenant.get(r.tenant_id) ?? 0,
          usageRatio,
          quotaStatus: computedStatus
        };
      })
      .filter((item: any) => (status ? item.quotaStatus === status : true));

    const total = mapped.length;
    const pageItems = mapped.slice(offset, offset + limit);

    return {
      page,
      limit,
      total,
      items: pageItems,
      summary: {
        totalQuotaUsed: mapped.reduce((acc: number, item: any) => acc + item.quotaUsed, 0),
        totalQuotaLimit: mapped.reduce((acc: number, item: any) => acc + (item.quotaLimit ?? 0), 0),
        totalAiSeatLimit: mapped.reduce((acc: number, item: any) => acc + item.aiSeatLimit, 0),
        totalAiSeatUsed: mapped.reduce((acc: number, item: any) => acc + item.aiSeatUsed, 0),
        totalAccounts: mapped.reduce((acc: number, item: any) => acc + item.totalAccounts, 0),
        exceededTenants: mapped.filter((item: any) => item.quotaStatus === "exceeded").length,
        warningTenants: mapped.filter((item: any) => item.quotaStatus === "warning").length,
        unlimitedTenants: mapped.filter((item: any) => item.quotaStatus === "unlimited").length
      }
    };
  });

  app.get("/api/platform/ai-usage/overview", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = PlatformAIUsageOverviewQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, search, tenantId, provider, model, status, days } = parsed.data;
    const offset = (page - 1) * limit;
    const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const usageBase = db("ai_usage_ledger as u")
      .join("tenants as t", "t.tenant_id", "u.tenant_id")
      .leftJoin("tenant_ai_budget_policies as p", "p.tenant_id", "t.tenant_id")
      .modify((qb) => {
        qb.where("u.occurred_at", ">=", rangeStart.toISOString());
        if (tenantId) qb.where("u.tenant_id", tenantId);
        if (provider) qb.where("u.provider", provider);
        if (model?.trim()) qb.whereILike("u.model", `%${model.trim()}%`);
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.andWhere((scope) => scope.whereILike("t.name", value).orWhereILike("t.slug", value));
        }
      });

    const tenantBase = db("tenants as t")
      .leftJoin("tenant_ai_budget_policies as p", "p.tenant_id", "t.tenant_id")
      .leftJoin("ai_usage_ledger as u", function joinUsage() {
        this.on("u.tenant_id", "=", "t.tenant_id").andOn("u.occurred_at", ">=", db.raw("?", [rangeStart.toISOString()]));
        if (provider) this.andOn("u.provider", "=", db.raw("?", [provider]));
        if (model?.trim()) this.andOn(db.raw("u.model ilike ?", [`%${model.trim()}%`]));
      })
      .modify((qb) => {
        if (tenantId) qb.where("t.tenant_id", tenantId);
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.where((scope) => scope.whereILike("t.name", value).orWhereILike("t.slug", value));
        }
      });

    const tenantRows = await tenantBase
      .clone()
      .select(
        "t.tenant_id",
        "t.name as tenant_name",
        "t.slug as tenant_slug",
        "t.status as tenant_status",
        "p.included_tokens",
        "p.monthly_budget_usd",
        "p.soft_limit_usd",
        "p.hard_limit_usd",
        "p.enforcement_mode",
        "p.is_active as policy_is_active"
      )
      .sum<{
        tenant_id: string;
        tenant_name: string;
        tenant_slug: string;
        tenant_status: string;
        included_tokens: number | string | null;
        monthly_budget_usd: number | string | null;
        soft_limit_usd: number | string | null;
        hard_limit_usd: number | string | null;
        enforcement_mode: string | null;
        policy_is_active: boolean | null;
        request_count: string;
        input_tokens: string;
        output_tokens: string;
        total_tokens: string;
        estimated_cost_usd: string;
      }>({
        request_count: "u.request_count",
        input_tokens: "u.input_tokens",
        output_tokens: "u.output_tokens",
        total_tokens: "u.total_tokens",
        estimated_cost_usd: "u.estimated_cost_usd"
      })
      .max<{ last_activity_at: string | null }>({ last_activity_at: "u.occurred_at" })
      .groupBy(
        "t.tenant_id",
        "t.name",
        "t.slug",
        "t.status",
        "p.included_tokens",
        "p.monthly_budget_usd",
        "p.soft_limit_usd",
        "p.hard_limit_usd",
        "p.enforcement_mode",
        "p.is_active"
      );

    const mapped = tenantRows
      .map((row) => {
        const totalTokens = Number(row.total_tokens ?? 0);
        const includedTokens = Number(row.included_tokens ?? 0);
        const estimatedCostUsd = Number(row.estimated_cost_usd ?? 0);
        const effectivePaidTokens = Math.max(0, totalTokens - includedTokens);
        const blendedRate = totalTokens > 0 ? estimatedCostUsd / totalTokens : 0;
        const billableCostUsd = roundCurrency(effectivePaidTokens * blendedRate);
        const monthlyBudgetUsd = toNullableNumber(row.monthly_budget_usd);
        const softLimitUsd = toNullableNumber(row.soft_limit_usd);
        const hardLimitUsd = toNullableNumber(row.hard_limit_usd);

        const usageStatus =
          hardLimitUsd !== null && billableCostUsd >= hardLimitUsd && row.enforcement_mode === "block"
            ? "blocked"
            : softLimitUsd !== null && billableCostUsd >= softLimitUsd
              ? "warning"
              : monthlyBudgetUsd === null
                ? "unlimited"
                : monthlyBudgetUsd > 0 && billableCostUsd / monthlyBudgetUsd >= 0.8
                  ? "warning"
                  : "healthy";

        return {
          tenantId: row.tenant_id,
          tenantName: row.tenant_name,
          tenantSlug: row.tenant_slug,
          tenantStatus: row.tenant_status,
          requestCount: Number(row.request_count ?? 0),
          inputTokens: Number(row.input_tokens ?? 0),
          outputTokens: Number(row.output_tokens ?? 0),
          totalTokens,
          estimatedCostUsd: roundCurrency(estimatedCostUsd),
          billableCostUsd,
          includedTokens,
          monthlyBudgetUsd,
          softLimitUsd,
          hardLimitUsd,
          enforcementMode: (row.enforcement_mode ?? "notify") as "notify" | "throttle" | "block",
          policyIsActive: Boolean(row.policy_is_active ?? true),
          usageStatus,
          budgetRatio: monthlyBudgetUsd && monthlyBudgetUsd > 0 ? billableCostUsd / monthlyBudgetUsd : null,
          lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null
        };
      })
      .filter((item) => (status ? item.usageStatus === status : true))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

    const trendRows = await usageBase
      .clone()
      .select(db.raw("DATE(u.occurred_at) AS usage_date"))
      .sum<{ usage_date: string; request_count: string; total_tokens: string; estimated_cost_usd: string }[]>({
        request_count: "u.request_count",
        total_tokens: "u.total_tokens",
        estimated_cost_usd: "u.estimated_cost_usd"
      })
      .groupByRaw("DATE(u.occurred_at)")
      .orderBy("usage_date", "asc");

    const modelRows = await usageBase
      .clone()
      .select("u.provider", "u.model")
      .sum<{ provider: string; model: string; request_count: string; total_tokens: string; estimated_cost_usd: string }[]>({
        request_count: "u.request_count",
        total_tokens: "u.total_tokens",
        estimated_cost_usd: "u.estimated_cost_usd"
      })
      .groupBy("u.provider", "u.model")
      .orderBy("estimated_cost_usd", "desc");

    return {
      page,
      limit,
      total: mapped.length,
      items: mapped.slice(offset, offset + limit),
      summary: {
        totalRequests: mapped.reduce((acc, item) => acc + item.requestCount, 0),
        totalTokens: mapped.reduce((acc, item) => acc + item.totalTokens, 0),
        totalInputTokens: mapped.reduce((acc, item) => acc + item.inputTokens, 0),
        totalOutputTokens: mapped.reduce((acc, item) => acc + item.outputTokens, 0),
        totalEstimatedCostUsd: roundCurrency(mapped.reduce((acc, item) => acc + item.estimatedCostUsd, 0)),
        totalBillableCostUsd: roundCurrency(mapped.reduce((acc, item) => acc + item.billableCostUsd, 0)),
        warningTenants: mapped.filter((item) => item.usageStatus === "warning").length,
        blockedTenants: mapped.filter((item) => item.usageStatus === "blocked").length
      },
      trend: trendRows.map((row) => ({
        date: formatDateOnly(row.usage_date),
        requestCount: Number(row.request_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        estimatedCostUsd: roundCurrency(Number(row.estimated_cost_usd ?? 0))
      })),
      modelBreakdown: modelRows.map((row) => ({
        provider: row.provider,
        model: row.model,
        requestCount: Number(row.request_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        estimatedCostUsd: roundCurrency(Number(row.estimated_cost_usd ?? 0))
      }))
    };
  });

  app.patch("/api/platform/ai-usage/budgets/:tenantId", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = TenantIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid tenantId" });
    }
    const parsed = PlatformAIBudgetPolicyPatchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const tenant = await db("tenants").where({ tenant_id: params.data.tenantId }).select("tenant_id").first();
    if (!tenant) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }

    const updates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (parsed.data.includedTokens !== undefined) updates.included_tokens = parsed.data.includedTokens;
    if (parsed.data.monthlyBudgetUsd !== undefined) updates.monthly_budget_usd = parsed.data.monthlyBudgetUsd;
    if (parsed.data.softLimitUsd !== undefined) updates.soft_limit_usd = parsed.data.softLimitUsd;
    if (parsed.data.hardLimitUsd !== undefined) updates.hard_limit_usd = parsed.data.hardLimitUsd;
    if (parsed.data.enforcementMode !== undefined) updates.enforcement_mode = parsed.data.enforcementMode;
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;

    const [policy] = await db("tenant_ai_budget_policies")
      .insert({
        tenant_id: params.data.tenantId,
        included_tokens: parsed.data.includedTokens ?? 0,
        monthly_budget_usd: parsed.data.monthlyBudgetUsd ?? null,
        soft_limit_usd: parsed.data.softLimitUsd ?? null,
        hard_limit_usd: parsed.data.hardLimitUsd ?? null,
        enforcement_mode: parsed.data.enforcementMode ?? "notify",
        is_active: parsed.data.isActive ?? true
      })
      .onConflict(["tenant_id"])
      .merge(updates)
      .returning([
        "tenant_id",
        "included_tokens",
        "monthly_budget_usd",
        "soft_limit_usd",
        "hard_limit_usd",
        "enforcement_mode",
        "is_active",
        "updated_at"
      ]);

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "tenant.ai_budget.update",
      targetType: "tenant",
      targetId: params.data.tenantId,
      status: "success",
      req,
      payload: parsed.data
    });

    return {
      tenantId: policy.tenant_id,
      includedTokens: Number(policy.included_tokens ?? 0),
      monthlyBudgetUsd: toNullableNumber(policy.monthly_budget_usd),
      softLimitUsd: toNullableNumber(policy.soft_limit_usd),
      hardLimitUsd: toNullableNumber(policy.hard_limit_usd),
      enforcementMode: policy.enforcement_mode,
      isActive: Boolean(policy.is_active),
      updatedAt: new Date(policy.updated_at).toISOString()
    };
  });

  app.get("/api/platform/tenants/:tenantId/ai-config", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const params = TenantIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid tenantId" });
    }

    const tenant = await db("tenants")
      .where({ tenant_id: params.data.tenantId })
      .select("tenant_id", "ai_model_access_mode")
      .first<{ tenant_id: string; ai_model_access_mode: string | null } | undefined>();

    if (!tenant) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }

    return {
      tenantId: tenant.tenant_id,
      aiModelAccessMode: tenant.ai_model_access_mode ?? "platform_managed",
      config: await getTenantPrimaryAIConfig(params.data.tenantId)
    };
  });

  app.patch("/api/platform/tenants/:tenantId/ai-config", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = TenantIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid tenantId" });
    }

    const parsed = PlatformTenantAIConfigPatchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const config = await db.transaction(async (trx) => {
      const tenant = await trx("tenants")
        .where({ tenant_id: params.data.tenantId })
        .select("tenant_id", "ai_model_access_mode")
        .first<{ tenant_id: string; ai_model_access_mode: string | null } | undefined>();

      if (!tenant) throw app.httpErrors.notFound("Tenant not found");
      if ((tenant.ai_model_access_mode ?? "platform_managed") !== "platform_managed") {
        throw app.httpErrors.forbidden("Tenant manages its own AI model configuration");
      }

      const current = await trx("ai_configs")
        .where({ tenant_id: tenant.tenant_id })
        .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
        .first<{
          config_id: string;
          provider: string | null;
          model: string | null;
          encrypted_api_key: string | null;
          quotas: unknown;
        } | undefined>();

      const provider = parsed.data.provider ?? normalizeAIProviderLabel(current?.provider) ?? "openai";
      const model = parsed.data.model?.trim() || current?.model || defaultModelForAIProvider(provider);
      const quotas = parseAIConfigQuotas(current?.quotas);
      const keyBag = parseAIConfigKeyBag(current?.encrypted_api_key);

      if (parsed.data.baseUrl !== undefined) {
        setAIProviderBaseUrl(quotas, provider, parsed.data.baseUrl);
      }
      if (parsed.data.apiKey !== undefined) {
        setAIProviderApiKey(keyBag, provider, parsed.data.apiKey);
      }

      if (current) {
        await trx("ai_configs")
          .where({ config_id: current.config_id, tenant_id: tenant.tenant_id })
          .update({
            source: "platform",
            provider,
            model,
            can_override: false,
            encrypted_api_key: JSON.stringify(keyBag),
            quotas: JSON.stringify(quotas),
            is_default: true,
            is_active: true,
            updated_at: trx.fn.now()
          });
      } else {
        await trx("ai_configs").insert({
          tenant_id: tenant.tenant_id,
          name: "Platform Managed AI",
          source: "platform",
          provider,
          model,
          can_override: false,
          encrypted_api_key: JSON.stringify(keyBag),
          quotas: JSON.stringify(quotas),
          is_default: true,
          is_active: true
        });
      }

      return {
        source: "platform",
        provider,
        model,
        hasApiKey: Boolean(readAIProviderApiKey(keyBag, provider)),
        baseUrl: readAIProviderBaseUrl(quotas, provider)
      };
    });

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "tenant.ai_config.update",
      targetType: "tenant",
      targetId: params.data.tenantId,
      status: "success",
      req,
      payload: {
        provider: parsed.data.provider ?? null,
        model: parsed.data.model ?? null,
        baseUrlUpdated: parsed.data.baseUrl !== undefined,
        apiKeyUpdated: parsed.data.apiKey !== undefined
      }
    });

    return {
      tenantId: params.data.tenantId,
      config
    };
  });

  app.get("/api/platform/billing/overview", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = PlatformBillingOverviewQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, search, status, tenantId } = parsed.data;
    const offset = (page - 1) * limit;

    const rows = await db("billing_invoices as bi")
      .join("tenants as t", "t.tenant_id", "bi.tenant_id")
      .join("billing_cycles as bc", "bc.cycle_id", "bi.cycle_id")
      .modify((qb) => {
        if (tenantId) qb.where("bi.tenant_id", tenantId);
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.where((b) => b.whereILike("t.name", value).orWhereILike("t.slug", value).orWhereILike("bi.invoice_no", value));
        }
      })
      .select(
        "bi.invoice_id",
        "bi.invoice_no",
        "bi.tenant_id",
        "t.name as tenant_name",
        "t.slug as tenant_slug",
        "bi.currency",
        "bi.amount_due",
        "bi.seat_license_amount",
        "bi.ai_usage_amount",
        "bi.amount_paid",
        "bi.status",
        "bi.issued_at",
        "bi.due_at",
        "bi.paid_at",
        "bc.period_start",
        "bc.period_end",
        "bi.updated_at"
      )
      .orderBy("bi.issued_at", "desc");

    const normalized = rows
      .map((r: any) => {
        const amountDue = Number(r.amount_due ?? 0);
        const seatLicenseAmount = Number(r.seat_license_amount ?? 0);
        const aiUsageAmount = Number(r.ai_usage_amount ?? 0);
        const amountPaid = Number(r.amount_paid ?? 0);
        const outstanding = Math.max(0, round2(amountDue - amountPaid));
        const dueAtIso = r.due_at ? new Date(r.due_at).toISOString() : null;
        const isOverdue =
          (r.status === "issued" || r.status === "partially_paid") &&
          dueAtIso !== null &&
          Date.parse(dueAtIso) < Date.now() &&
          outstanding > 0;
        const normalizedStatus = isOverdue ? "overdue" : r.status;

        return {
          invoiceId: r.invoice_id,
          invoiceNo: r.invoice_no,
          tenantId: r.tenant_id,
          tenantName: r.tenant_name,
          tenantSlug: r.tenant_slug,
          currency: r.currency,
          amountDue,
          seatLicenseAmount,
          aiUsageAmount,
          amountPaid,
          outstanding,
          status: normalizedStatus,
          issuedAt: new Date(r.issued_at).toISOString(),
          dueAt: dueAtIso,
          paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
          periodStart: formatDateOnly(r.period_start),
          periodEnd: formatDateOnly(r.period_end),
          updatedAt: new Date(r.updated_at).toISOString()
        };
      })
      .filter((item: any) => (status ? item.status === status : true));

    const total = normalized.length;
    const pageItems = normalized.slice(offset, offset + limit);

    return {
      page,
      limit,
      total,
      items: pageItems,
      summary: {
        totalDue: round2(normalized.reduce((acc: number, item: any) => acc + item.amountDue, 0)),
        totalPaid: round2(normalized.reduce((acc: number, item: any) => acc + item.amountPaid, 0)),
        totalOutstanding: round2(normalized.reduce((acc: number, item: any) => acc + item.outstanding, 0)),
        overdueInvoices: normalized.filter((item: any) => item.status === "overdue").length
      }
    };
  });

  app.post("/api/platform/billing/cycles/close", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = PlatformBillingCloseCycleBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    if (parsed.data.periodStart > parsed.data.periodEnd) {
      return reply.status(400).send({ error: "invalid_request", message: "periodStart must be <= periodEnd" });
    }

    const dueAt = new Date(`${parsed.data.periodEnd}T00:00:00.000Z`);
    dueAt.setUTCDate(dueAt.getUTCDate() + parsed.data.dueDays);
    const currency = parsed.data.currency.toUpperCase();
    const reason = {
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      dueDays: parsed.data.dueDays,
      currency,
      tenantId: parsed.data.tenantId ?? null
    };

    const tenants = await db("tenants as t")
      .leftJoin("tenant_plans as p", "p.plan_id", "t.plan_id")
      .modify((qb) => {
        if (parsed.data.tenantId) qb.where("t.tenant_id", parsed.data.tenantId);
      })
      .select(
        "t.tenant_id",
        "t.slug",
        "t.licensed_seats",
        "p.code as plan_code",
        "p.ai_token_quota_monthly"
      )
      .orderBy("t.created_at", "asc");

    const result = await db.transaction(async (trx) => {
      let generated = 0;
      let skipped = 0;

      for (const tenant of tenants) {
        const [cycle] = await trx("billing_cycles")
          .insert({
            tenant_id: tenant.tenant_id,
            period_start: parsed.data.periodStart,
            period_end: parsed.data.periodEnd,
            status: "closed",
            closed_at: trx.fn.now(),
            closed_by_identity_id: auth.sub
          })
          .onConflict(["tenant_id", "period_start", "period_end"])
          .merge({
            status: "closed",
            closed_at: trx.fn.now(),
            closed_by_identity_id: auth.sub,
            updated_at: trx.fn.now()
          })
          .returning(["cycle_id"]);

        const existingInvoice = await trx("billing_invoices")
          .where({ cycle_id: cycle.cycle_id })
          .select("invoice_id")
          .first<{ invoice_id: string }>();

        if (existingInvoice) {
          skipped += 1;
          continue;
        }

        const monthlyQuota = tenant.ai_token_quota_monthly === null ? null : Number(tenant.ai_token_quota_monthly);
        const usage = await trx("ai_usage_ledger")
          .where({ tenant_id: tenant.tenant_id })
          .andWhere("occurred_at", ">=", `${parsed.data.periodStart}T00:00:00.000Z`)
          .andWhere("occurred_at", "<", `${parsed.data.periodEnd}T23:59:59.999Z`)
          .sum<{ total_tokens: string; estimated_cost_usd: string }>({
            total_tokens: "total_tokens",
            estimated_cost_usd: "estimated_cost_usd"
          })
          .first();

        const aiTotalTokens = Number(usage?.total_tokens ?? 0);
        const estimatedAICost = Number(usage?.estimated_cost_usd ?? 0);
        const includedTokens = monthlyQuota ?? 0;
        const effectivePaidTokens = Math.max(0, aiTotalTokens - includedTokens);
        const blendedRate = aiTotalTokens > 0 ? estimatedAICost / aiTotalTokens : 0;
        const aiUsageAmount = round2(effectivePaidTokens * blendedRate);
        const seatLicenseAmount = round2(planBaseFee(tenant.plan_code ?? null));
        const amountDue = round2(seatLicenseAmount + aiUsageAmount);
        const invoiceNo = makeInvoiceNo(tenant.slug, parsed.data.periodEnd, cycle.cycle_id);

        await trx("billing_invoices").insert({
          cycle_id: cycle.cycle_id,
          tenant_id: tenant.tenant_id,
          invoice_no: invoiceNo,
          currency,
          amount_due: amountDue,
          seat_license_amount: seatLicenseAmount,
          ai_usage_amount: aiUsageAmount,
          amount_paid: 0,
          status: "issued",
          issued_at: trx.fn.now(),
          due_at: dueAt,
          meta: {
            planCode: tenant.plan_code ?? null,
            monthlyQuota,
            licensedSeats: Number(tenant.licensed_seats ?? 0),
            aiTotalTokens,
            includedTokens,
            effectivePaidTokens,
            seatLicenseAmount,
            aiUsageAmount,
            estimatedAICost: round2(estimatedAICost)
          }
        });

        generated += 1;
      }

      return { generated, skipped };
    });

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "billing.cycle.close",
      targetType: "billing_cycle",
      status: "success",
      req,
      payload: { ...reason, generated: result.generated, skipped: result.skipped }
    });

    return {
      success: true,
      ...reason,
      generated: result.generated,
      skipped: result.skipped
    };
  });

  app.post("/api/platform/billing/invoices/:invoiceId/payments/reconcile", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = PlatformInvoiceParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid invoiceId" });
    }

    const parsed = PlatformPaymentReconcileBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date();

    const reconciled = await db.transaction(async (trx) => {
      const invoice = await trx("billing_invoices")
        .where({ invoice_id: params.data.invoiceId })
        .select("invoice_id", "tenant_id", "amount_due", "amount_paid", "status", "currency")
        .first<{
          invoice_id: string;
          tenant_id: string;
          amount_due: number | string;
          amount_paid: number | string;
          status: string;
          currency: string;
        }>();

      if (!invoice) return null;
      if (invoice.status === "void") return { invoice, rejected: "Invoice is void" as const };

      const amountDue = Number(invoice.amount_due ?? 0);
      const currentPaid = Number(invoice.amount_paid ?? 0);
      const nextPaid = round2(currentPaid + parsed.data.amount);
      const cappedPaid = round2(Math.min(amountDue, nextPaid));
      const nextStatus = cappedPaid >= amountDue ? "paid" : cappedPaid > 0 ? "partially_paid" : "issued";

      const [payment] = await trx("billing_payments")
        .insert({
          invoice_id: invoice.invoice_id,
          tenant_id: invoice.tenant_id,
          amount: parsed.data.amount,
          currency: invoice.currency,
          method: parsed.data.method,
          reference_no: parsed.data.referenceNo ?? null,
          received_at: receivedAt,
          reconciled_by_identity_id: auth.sub,
          note: parsed.data.note ?? null
        })
        .returning(["payment_id"]);

      await trx("billing_invoices")
        .where({ invoice_id: invoice.invoice_id })
        .update({
          amount_paid: cappedPaid,
          status: nextStatus,
          paid_at: nextStatus === "paid" ? receivedAt : null,
          updated_at: trx.fn.now()
        });

      return {
        rejected: null as null,
        paymentId: payment.payment_id as string,
        invoiceId: invoice.invoice_id,
        amountDue,
        amountPaid: cappedPaid,
        outstanding: round2(Math.max(0, amountDue - cappedPaid)),
        status: nextStatus
      };
    });

    if (!reconciled) {
      return reply.status(404).send({ error: "not_found", message: "Invoice not found" });
    }
    if ("rejected" in reconciled && reconciled.rejected) {
      return reply.status(409).send({ error: "conflict", message: reconciled.rejected });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "billing.payment.reconcile",
      targetType: "invoice",
      targetId: params.data.invoiceId,
      status: "success",
      req,
      payload: {
        amount: parsed.data.amount,
        method: parsed.data.method,
        referenceNo: parsed.data.referenceNo ?? null
      }
    });

    return { success: true, ...reconciled };
  });

  app.get("/api/platform/billing/invoices/:invoiceId/statement.csv", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = PlatformInvoiceParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid invoiceId" });
    }
    const query = BillingStatementQuery.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid statement query" });
    }

    const data = await getInvoiceStatementData(params.data.invoiceId);
    if (!data) {
      return reply.status(404).send({ error: "not_found", message: "Invoice not found" });
    }

    const template = buildStatementTemplateOptions(query.data);
    const csv = buildInvoiceStatementCsv(data, template);
    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "billing.statement.export.csv",
      targetType: "invoice",
      targetId: data.invoiceId,
      status: "success",
      req,
      payload: { invoiceNo: data.invoiceNo, format: "csv", lang: template.lang }
    });

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${data.invoiceNo}-statement.csv"`)
      .send(csv);
  });

  app.get("/api/platform/billing/invoices/:invoiceId/statement.pdf", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = PlatformInvoiceParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid invoiceId" });
    }
    const query = BillingStatementQuery.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid statement query" });
    }

    const data = await getInvoiceStatementData(params.data.invoiceId);
    if (!data) {
      return reply.status(404).send({ error: "not_found", message: "Invoice not found" });
    }

    const template = buildStatementTemplateOptions(query.data);
    const pdf = buildInvoiceStatementPdf(data, template);
    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "billing.statement.export.pdf",
      targetType: "invoice",
      targetId: data.invoiceId,
      status: "success",
      req,
      payload: { invoiceNo: data.invoiceNo, format: "pdf", lang: template.lang }
    });

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${data.invoiceNo}-statement.pdf"`)
      .send(pdf);
  });

  app.get("/api/platform/marketplace/skills", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = MarketplaceSkillsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, tier, status, search, ownerTenantId } = parsed.data;
    const offset = (page - 1) * limit;
    const base = db("marketplace_skills as s")
      .leftJoin("tenants as t", "t.tenant_id", "s.owner_tenant_id")
      .leftJoin("identities as i", "i.identity_id", "s.provider_identity_id")
      .modify((qb) => {
        if (tier) qb.where("s.tier", tier);
        if (status) qb.where("s.status", status);
        if (ownerTenantId) qb.where("s.owner_tenant_id", ownerTenantId);
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.where((b) => b.whereILike("s.name", value).orWhereILike("s.slug", value).orWhereILike("s.description", value));
        }
      });

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .select(
          "s.skill_id",
          "s.slug",
          "s.name",
          "s.description",
          "s.tier",
          "s.owner_tenant_id",
          "t.slug as owner_tenant_slug",
          "s.provider_identity_id",
          "i.email as provider_email",
          "s.status",
          "s.latest_version",
          "s.manifest",
          "s.created_at",
          "s.updated_at"
        )
        .orderBy("s.created_at", "desc")
        .limit(limit)
        .offset(offset),
      base.clone().count<{ cnt: string }>("s.skill_id as cnt").first()
    ]);

    return {
      page,
      limit,
      total: Number(countRow?.cnt ?? 0),
      items: rows.map((r: any) => ({
        skillId: r.skill_id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        tier: r.tier,
        ownerTenantId: r.owner_tenant_id ?? null,
        ownerTenantSlug: r.owner_tenant_slug ?? null,
        providerIdentityId: r.provider_identity_id ?? null,
        providerEmail: r.provider_email ?? null,
        status: r.status,
        latestVersion: r.latest_version,
        manifest: r.manifest ?? {},
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString()
      }))
    };
  });

  app.post("/api/platform/marketplace/skills", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = MarketplaceSkillCreateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }
    if (!hasManifestToolName(parsed.data.manifest)) {
      return reply.status(400).send({ error: "invalid_request", message: "manifest.toolName is required for runtime gateway binding" });
    }

    try {
      const result = await db.transaction(async (trx) => {
        const [skill] = await trx("marketplace_skills")
          .insert({
            slug: parsed.data.slug,
            name: parsed.data.name,
            description: parsed.data.description,
            tier: parsed.data.tier,
            owner_tenant_id: parsed.data.ownerTenantId ?? null,
            provider_identity_id: parsed.data.providerIdentityId ?? auth.sub,
            status: parsed.data.status,
            latest_version: parsed.data.version,
            manifest: parsed.data.manifest
          })
          .returning(["skill_id", "slug", "name", "tier", "status", "latest_version", "manifest", "created_at", "updated_at"]);

        await trx("marketplace_skill_releases").insert({
          skill_id: skill.skill_id,
          version: parsed.data.version,
          changelog: parsed.data.changelog,
          manifest: parsed.data.manifest,
          is_active: true,
          published_at: trx.fn.now()
        });

        return skill;
      });

      await writePlatformAudit({
        actorIdentityId: auth.sub,
        action: "marketplace.skill.create",
        targetType: "marketplace_skill",
        targetId: result.skill_id,
        status: "success",
        req,
        payload: { slug: result.slug, tier: result.tier, status: result.status, version: result.latest_version }
      });

      return reply.status(201).send({
        skillId: result.skill_id,
        slug: result.slug,
        name: result.name,
        tier: result.tier,
        status: result.status,
        latestVersion: result.latest_version,
        manifest: result.manifest ?? {},
        createdAt: new Date(result.created_at).toISOString(),
        updatedAt: new Date(result.updated_at).toISOString()
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Skill slug or version already exists" });
      }
      throw error;
    }
  });

  app.patch("/api/platform/marketplace/skills/:skillId", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MarketplaceSkillParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid skillId" });
    }
    const parsed = MarketplaceSkillPatchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const updates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.manifest !== undefined) updates.manifest = parsed.data.manifest;

    const [updated] = await db("marketplace_skills")
      .where({ skill_id: params.data.skillId })
      .update(updates)
      .returning(["skill_id", "slug", "name", "tier", "status", "latest_version", "manifest", "updated_at"]);

    if (!updated) {
      return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "marketplace.skill.update",
      targetType: "marketplace_skill",
      targetId: updated.skill_id,
      status: "success",
      req,
      payload: parsed.data
    });

    return {
      skillId: updated.skill_id,
      slug: updated.slug,
      name: updated.name,
      tier: updated.tier,
      status: updated.status,
      latestVersion: updated.latest_version,
      manifest: updated.manifest ?? {},
      updatedAt: new Date(updated.updated_at).toISOString()
    };
  });

  app.post("/api/platform/marketplace/skills/:skillId/disable", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MarketplaceSkillParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid skillId" });
    }

    const existing = await db("marketplace_skills")
      .where({ skill_id: params.data.skillId })
      .select("skill_id", "status")
      .first<{ skill_id: string; status: string }>();

    if (!existing) {
      return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });
    }
    if (existing.status === "deprecated") {
      return reply.status(409).send({ error: "conflict", message: "Skill is already disabled/deprecated" });
    }

    const [updated] = await db("marketplace_skills")
      .where({ skill_id: params.data.skillId })
      .update({ status: "deprecated", updated_at: db.fn.now() })
      .returning(["skill_id", "status", "updated_at"]);

    if (!updated) return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "marketplace.skill.disable",
      targetType: "marketplace_skill",
      targetId: updated.skill_id,
      status: "success",
      req
    });

    return { success: true, skillId: updated.skill_id, status: updated.status, updatedAt: new Date(updated.updated_at).toISOString() };
  });

  app.post("/api/platform/marketplace/skills/:skillId/retract", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MarketplaceSkillParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid skillId" });
    }

    const changed = await db.transaction(async (trx) => {
      const existing = await trx("marketplace_skills")
        .where({ skill_id: params.data.skillId })
        .select("skill_id", "status")
        .first<{ skill_id: string; status: string }>();
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "published") return { kind: "invalid_status" as const };

      await trx("marketplace_skill_releases")
        .where({ skill_id: params.data.skillId, is_active: true })
        .update({ is_active: false, updated_at: trx.fn.now() });

      await trx("marketplace_skills")
        .where({ skill_id: params.data.skillId })
        .update({ status: "draft", updated_at: trx.fn.now() });
      return { kind: "ok" as const };
    });

    if (changed.kind === "not_found") {
      return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });
    }
    if (changed.kind === "invalid_status") {
      return reply.status(409).send({ error: "conflict", message: "Only published skills can be retracted" });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "marketplace.skill.retract",
      targetType: "marketplace_skill",
      targetId: params.data.skillId,
      status: "success",
      req
    });

    return { success: true, skillId: params.data.skillId, status: "draft" };
  });

  app.delete("/api/platform/marketplace/skills/:skillId", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MarketplaceSkillParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid skillId" });
    }

    const deleted = await db("marketplace_skills").where({ skill_id: params.data.skillId }).del();
    if (!deleted) {
      return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "marketplace.skill.delete",
      targetType: "marketplace_skill",
      targetId: params.data.skillId,
      status: "success",
      req
    });

    return { success: true };
  });

  app.post("/api/platform/marketplace/skills/:skillId/publish", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MarketplaceSkillParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid skillId" });
    }
    const parsed = MarketplacePublishBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const result = await db.transaction(async (trx) => {
      const skill = await trx("marketplace_skills")
        .where({ skill_id: params.data.skillId })
        .select("skill_id", "manifest", "status")
        .first<{ skill_id: string; manifest: Record<string, unknown>; status: string }>();
      if (!skill) return { kind: "not_found" as const };
      if (skill.status === "published") return { kind: "already_published" as const };

      await trx("marketplace_skill_releases")
        .where({ skill_id: params.data.skillId, is_active: true })
        .update({ is_active: false, updated_at: trx.fn.now() });

      const releaseManifest = parsed.data.manifest ?? skill.manifest ?? {};
      if (!hasManifestToolName(releaseManifest)) {
        return { kind: "invalid_manifest" as const };
      }
      const [release] = await trx("marketplace_skill_releases")
        .insert({
          skill_id: params.data.skillId,
          version: parsed.data.version,
          changelog: parsed.data.changelog,
          manifest: releaseManifest,
          is_active: true,
          published_at: trx.fn.now()
        })
        .returning(["release_id", "version", "published_at"]);

      await trx("marketplace_skills")
        .where({ skill_id: params.data.skillId })
        .update({
          status: "published",
          latest_version: parsed.data.version,
          manifest: releaseManifest,
          updated_at: trx.fn.now()
        });

      return {
        kind: "ok" as const,
        releaseId: release.release_id,
        version: release.version,
        publishedAt: new Date(release.published_at).toISOString()
      };
    });

    if (result.kind === "not_found") {
      return reply.status(404).send({ error: "not_found", message: "Marketplace skill not found" });
    }
    if (result.kind === "invalid_manifest") {
      return reply.status(400).send({ error: "invalid_request", message: "manifest.toolName is required for runtime gateway binding" });
    }
    if (result.kind === "already_published") {
      return reply.status(409).send({ error: "conflict", message: "Skill is already published" });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "marketplace.skill.publish",
      targetType: "marketplace_skill",
      targetId: params.data.skillId,
      status: "success",
      req,
      payload: { version: result.version }
    });

    return {
      success: true,
      releaseId: result.releaseId,
      version: result.version,
      publishedAt: result.publishedAt
    };
  });

  app.get("/api/platform/marketplace/installs", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = MarketplaceInstallsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, tenantId, skillId, status } = parsed.data;
    const offset = (page - 1) * limit;
    const base = db("marketplace_skill_installs as mi")
      .join("marketplace_skills as s", "s.skill_id", "mi.skill_id")
      .join("tenants as t", "t.tenant_id", "mi.tenant_id")
      .join("marketplace_skill_releases as r", "r.release_id", "mi.release_id")
      .leftJoin("identities as i", "i.identity_id", "mi.installed_by_identity_id")
      .modify((qb) => {
        if (tenantId) qb.where("mi.tenant_id", tenantId);
        if (skillId) qb.where("mi.skill_id", skillId);
        if (status) qb.where("mi.status", status);
      });

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .select(
          "mi.install_id",
          "mi.tenant_id",
          "t.slug as tenant_slug",
          "mi.skill_id",
          "s.slug as skill_slug",
          "s.name as skill_name",
          "s.tier",
          "mi.release_id",
          "r.version",
          "mi.status",
          "mi.installed_by_identity_id",
          "i.email as installed_by_email",
          "mi.installed_at",
          "mi.updated_at"
        )
        .orderBy("mi.installed_at", "desc")
        .limit(limit)
        .offset(offset),
      base.clone().count<{ cnt: string }>("mi.install_id as cnt").first()
    ]);

    return {
      page,
      limit,
      total: Number(countRow?.cnt ?? 0),
      items: rows.map((r: any) => ({
        installId: r.install_id,
        tenantId: r.tenant_id,
        tenantSlug: r.tenant_slug,
        skillId: r.skill_id,
        skillSlug: r.skill_slug,
        skillName: r.skill_name,
        tier: r.tier,
        releaseId: r.release_id,
        version: r.version,
        status: r.status,
        installedByIdentityId: r.installed_by_identity_id ?? null,
        installedByEmail: r.installed_by_email ?? null,
        installedAt: new Date(r.installed_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString()
      }))
    };
  });

  app.get("/api/platform/tenants", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const parsed = TenantListQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", message: "Invalid query parameters" });
    }

    const { page, limit, search, status } = parsed.data;
    const offset = (page - 1) * limit;

    const base = db("tenants as t")
      .leftJoin("tenant_plans as p", "p.plan_id", "t.plan_id")
      .modify((qb) => {
        if (status) qb.where("t.status", status);
        if (search?.trim()) {
          const value = `%${search.trim()}%`;
          qb.where((b) => b.whereILike("t.name", value).orWhereILike("t.slug", value));
        }
      });

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .select(
          "t.tenant_id",
          "t.name",
          "t.slug",
          "t.status",
          "t.operating_mode",
          "t.ai_quota_used",
          "t.licensed_seats",
          "t.licensed_ai_seats",
          "t.ai_model_access_mode",
          "t.created_at",
          "t.updated_at",
          "p.code as plan_code",
          "p.name as plan_name",
          "p.max_agents",
          "p.ai_token_quota_monthly"
        )
        .orderBy("t.created_at", "desc")
        .limit(limit)
        .offset(offset),
      base.clone().count<{ cnt: string }>("t.tenant_id as cnt").first()
    ]);

    const tenantIds = rows.map((row: any) => row.tenant_id);
    const [seatUsageByTenant, accountCountByTenant, aiConfigByTenant] = await Promise.all([
      getActiveSeatUsageMap(tenantIds),
      getTenantAccountCountMap(tenantIds),
      getTenantPrimaryAIConfigMap(tenantIds)
    ]);

    return {
      page,
      limit,
      total: Number(countRow?.cnt ?? 0),
      items: rows.map((row: any) => ({
        tenantId: row.tenant_id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        operatingMode: row.operating_mode,
        licensedSeats: row.licensed_seats ?? row.max_agents ?? null,
        licensedAiSeats: row.licensed_ai_seats ?? 0,
        activeSeatCount: seatUsageByTenant.get(row.tenant_id) ?? 0,
        totalAccountCount: accountCountByTenant.get(row.tenant_id) ?? 0,
        aiModelAccessMode: row.ai_model_access_mode ?? "platform_managed",
        aiConfig: aiConfigByTenant.get(row.tenant_id) ?? null,
        plan: row.plan_code
          ? {
              code: row.plan_code,
              name: row.plan_name,
              maxAgents: row.max_agents,
              aiTokenQuotaMonthly: row.ai_token_quota_monthly
            }
          : null,
        aiQuotaUsed: row.ai_quota_used,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  });

  app.post("/api/platform/tenants", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = TenantCreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const plan = await getPlanByCode(parsed.data.planCode);
    if (!plan) {
      return reply.status(400).send({ error: "invalid_plan", message: `Unknown plan code: ${parsed.data.planCode}` });
    }
    const aiProvider = parsed.data.aiProvider ?? "openai";
    const aiModel = parsed.data.aiModel?.trim() || defaultModelForAIProvider(aiProvider);
    if (parsed.data.aiModelAccessMode === "platform_managed" && requiresAIProviderApiKeyOnCreate(aiProvider) && !parsed.data.aiApiKey?.trim()) {
      return reply.status(400).send({ error: "invalid_request", message: "API key is required for the selected provider" });
    }

    try {
      const tenant = await db.transaction(async (trx) => {
        const [created] = await trx("tenants")
          .insert({
            plan_id: plan.plan_id,
            name: parsed.data.name.trim(),
            slug: parsed.data.slug.trim(),
            status: "active",
            operating_mode: parsed.data.operatingMode,
            licensed_seats: parsed.data.licensedSeats ?? plan.max_agents ?? null,
            licensed_ai_seats: parsed.data.licensedAiSeats,
            ai_model_access_mode: parsed.data.aiModelAccessMode,
            ai_quota_used: 0
          })
          .returning([
            "tenant_id",
            "name",
            "slug",
            "status",
            "operating_mode",
            "licensed_seats",
            "licensed_ai_seats",
            "ai_model_access_mode",
            "created_at",
            "updated_at"
          ]);

        if (parsed.data.aiModelAccessMode === "platform_managed") {
          const quotas: Record<string, unknown> = {
            aiTokenQuotaMonthly: plan.ai_token_quota_monthly ?? null,
            monthlyTokenLimit: plan.ai_token_quota_monthly ?? null
          };
          if (parsed.data.aiBaseUrl !== undefined) {
            setAIProviderBaseUrl(quotas, aiProvider, parsed.data.aiBaseUrl);
          }
          const keyBag: Record<string, unknown> = {};
          if (parsed.data.aiApiKey?.trim()) {
            setAIProviderApiKey(keyBag, aiProvider, parsed.data.aiApiKey);
          }
          await trx("ai_configs").insert({
            tenant_id: created.tenant_id,
            source: "platform",
            provider: aiProvider,
            model: aiModel,
            can_override: false,
            encrypted_api_key: JSON.stringify(keyBag),
            quotas: JSON.stringify(quotas)
          });
        }

        await trx("channel_configs").insert([
          {
            tenant_id: created.tenant_id,
            channel_type: "web",
            channel_id: `web-${created.slug}`,
            encrypted_config: JSON.stringify({
              widgetName: `${created.name} Web Chat`,
              publicChannelKey: buildPublicChannelKey(created.slug)
            }),
            is_active: true
          },
          {
            tenant_id: created.tenant_id,
            channel_type: "whatsapp",
            channel_id: buildDefaultChannelId(created.tenant_id, "whatsapp"),
            encrypted_config: JSON.stringify({
              onboardingStatus: "unbound"
            }),
            is_active: false
          },
          {
            tenant_id: created.tenant_id,
            channel_type: "webhook",
            channel_id: buildDefaultChannelId(created.tenant_id, "webhook"),
            encrypted_config: JSON.stringify({
              verifyToken: `wh-verify-${created.tenant_id}`
            }),
            is_active: false
          }
        ]);

        return created;
      });

      await writePlatformAudit({
        actorIdentityId: auth.sub,
        action: "tenant.create",
        targetType: "tenant",
        targetId: tenant.tenant_id,
        status: "success",
        req,
        payload: {
          slug: tenant.slug,
          planCode: plan.code,
          operatingMode: tenant.operating_mode,
          licensedSeats: tenant.licensed_seats,
          licensedAiSeats: tenant.licensed_ai_seats,
          aiModelAccessMode: tenant.ai_model_access_mode
        }
      });

      return reply.status(201).send({
        tenantId: tenant.tenant_id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        operatingMode: tenant.operating_mode,
        licensedSeats: tenant.licensed_seats,
        licensedAiSeats: tenant.licensed_ai_seats,
        activeSeatCount: 0,
        totalAccountCount: 0,
        aiModelAccessMode: tenant.ai_model_access_mode,
        aiConfig: parsed.data.aiModelAccessMode === "platform_managed"
          ? {
              source: "platform",
              provider: aiProvider,
              model: aiModel,
              hasApiKey: Boolean(parsed.data.aiApiKey?.trim()),
              baseUrl: parsed.data.aiBaseUrl?.trim() || null
            }
          : null,
        plan: {
          code: plan.code,
          name: plan.name,
          maxAgents: plan.max_agents,
          aiTokenQuotaMonthly: plan.ai_token_quota_monthly
        },
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Tenant slug already exists" });
      }
      throw error;
    }
  });

  app.get("/api/platform/tenants/:tenantId", async (req, reply) => {
    await requirePlatformAccess(app, req);

    const params = TenantIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid tenantId" });
    }

    const tenant = await db("tenants as t")
      .leftJoin("tenant_plans as p", "p.plan_id", "t.plan_id")
      .where({ "t.tenant_id": params.data.tenantId })
      .select(
        "t.tenant_id",
        "t.name",
        "t.slug",
        "t.status",
        "t.operating_mode",
        "t.ai_quota_used",
        "t.licensed_seats",
        "t.licensed_ai_seats",
        "t.ai_model_access_mode",
        "t.created_at",
        "t.updated_at",
        "p.code as plan_code",
        "p.name as plan_name",
        "p.max_agents",
        "p.ai_token_quota_monthly"
      )
      .first();

    if (!tenant) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }

    const [memberships, activeSeatCount, totalAccountCount, aiConfig] = await Promise.all([
      db("tenant_memberships as tm")
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .where({ "tm.tenant_id": params.data.tenantId })
        .select(
          "tm.membership_id",
          "tm.identity_id",
          "tm.role",
          "tm.status",
          "tm.is_default",
          "tm.created_at",
          "tm.updated_at",
          "i.email"
        )
        .orderBy("tm.created_at", "asc"),
      countActiveSeats(params.data.tenantId),
      countTenantAccounts(params.data.tenantId),
      getTenantPrimaryAIConfig(params.data.tenantId)
    ]);

    return {
      tenantId: tenant.tenant_id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      operatingMode: tenant.operating_mode,
      licensedSeats: tenant.licensed_seats ?? tenant.max_agents ?? null,
      licensedAiSeats: tenant.licensed_ai_seats ?? 0,
      activeSeatCount,
      totalAccountCount,
      aiModelAccessMode: tenant.ai_model_access_mode ?? "platform_managed",
      aiConfig,
      plan: tenant.plan_code
        ? {
            code: tenant.plan_code,
            name: tenant.plan_name,
            maxAgents: tenant.max_agents,
            aiTokenQuotaMonthly: tenant.ai_token_quota_monthly
          }
        : null,
      aiQuotaUsed: tenant.ai_quota_used,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      memberships: memberships.map((m) => ({
        membershipId: m.membership_id,
        identityId: m.identity_id,
        email: m.email,
        role: m.role,
        status: m.status,
        isDefault: m.is_default,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }))
    };
  });

  app.patch("/api/platform/tenants/:tenantId", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = TenantIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid tenantId" });
    }

    const parsed = TenantPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    let planId: string | undefined;
    if (parsed.data.planCode) {
      const plan = await getPlanByCode(parsed.data.planCode);
      if (!plan) {
        return reply.status(400).send({ error: "invalid_plan", message: `Unknown plan code: ${parsed.data.planCode}` });
      }
      planId = plan.plan_id;
    }

    const updates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (parsed.data.name) updates.name = parsed.data.name.trim();
    if (parsed.data.slug) updates.slug = parsed.data.slug.trim();
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.operatingMode) updates.operating_mode = parsed.data.operatingMode;
    if (planId) updates.plan_id = planId;
    if (parsed.data.licensedSeats !== undefined) updates.licensed_seats = parsed.data.licensedSeats;
    if (parsed.data.licensedAiSeats !== undefined) updates.licensed_ai_seats = parsed.data.licensedAiSeats;
    if (parsed.data.aiModelAccessMode) updates.ai_model_access_mode = parsed.data.aiModelAccessMode;

    let updated;
    try {
      updated = await db.transaction(async (trx) => {
        const currentConfig = await trx("ai_configs")
          .where({ tenant_id: params.data.tenantId })
          .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
          .first<{
            config_id: string;
            provider: string | null;
            model: string | null;
            encrypted_api_key: string | null;
            quotas: unknown;
          } | undefined>();

        const [row] = await trx("tenants")
          .where({ tenant_id: params.data.tenantId })
          .update(updates)
          .returning([
            "tenant_id",
            "name",
            "slug",
            "status",
            "operating_mode",
            "licensed_seats",
            "licensed_ai_seats",
            "ai_model_access_mode",
            "created_at",
            "updated_at",
            "plan_id"
          ]);

        if (!row) return null;

        const nextMode = parsed.data.aiModelAccessMode ?? row.ai_model_access_mode ?? "platform_managed";
        if (nextMode === "tenant_managed" && (parsed.data.aiProvider !== undefined || parsed.data.aiModel !== undefined)) {
          throw app.httpErrors.badRequest("Platform cannot configure provider/model when tenant manages AI model settings");
        }
        if (nextMode === "platform_managed") {
          const provider = parsed.data.aiProvider ?? normalizeAIProviderLabel(currentConfig?.provider) ?? "openai";
          const model = parsed.data.aiModel?.trim() || currentConfig?.model || defaultModelForAIProvider(provider);
          if (!currentConfig && requiresAIProviderApiKeyOnCreate(provider) && !parsed.data.aiApiKey?.trim()) {
            throw app.httpErrors.badRequest("API key is required for the selected provider");
          }
          const existingPlatformConfig = await trx("ai_configs")
            .where({ tenant_id: row.tenant_id, source: "platform" })
            .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
            .first<{ config_id: string; encrypted_api_key: string | null; quotas: unknown } | undefined>();
          const keyBag = parseAIConfigKeyBag(existingPlatformConfig?.encrypted_api_key);
          const quotas = parseAIConfigQuotas(existingPlatformConfig?.quotas);
          if (parsed.data.aiApiKey?.trim()) {
            setAIProviderApiKey(keyBag, provider, parsed.data.aiApiKey);
          }
          if (parsed.data.aiBaseUrl !== undefined) {
            setAIProviderBaseUrl(quotas, provider, parsed.data.aiBaseUrl);
          }
          if (existingPlatformConfig) {
            await trx("ai_configs")
              .where({ config_id: existingPlatformConfig.config_id, tenant_id: row.tenant_id })
              .update({
                provider,
                model,
                source: "platform",
                can_override: false,
                encrypted_api_key: JSON.stringify(keyBag),
                quotas: JSON.stringify(quotas),
                is_active: true,
                is_default: true,
                updated_at: trx.fn.now()
              });
          } else {
            await trx("ai_configs")
              .where({ tenant_id: row.tenant_id })
              .update({ is_default: false, updated_at: trx.fn.now() });
            await trx("ai_configs").insert({
              tenant_id: row.tenant_id,
              name: "Platform Managed AI",
              source: "platform",
              provider,
              model,
              can_override: false,
              is_active: true,
              is_default: true,
              encrypted_api_key: JSON.stringify(keyBag),
              quotas: JSON.stringify(quotas)
            });
          }
        } else {
          await trx("ai_configs")
            .where({ tenant_id: row.tenant_id, is_default: true })
            .update({ source: "own", can_override: true, updated_at: trx.fn.now() });
        }

        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Tenant slug already exists" });
      }
      throw error;
    }

    if (!updated) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "tenant.update",
      targetType: "tenant",
      targetId: updated.tenant_id,
      status: "success",
      req,
      payload: parsed.data
    });

    if (parsed.data.status && parsed.data.status !== "active") {
      await revokeAuthSessionsByFilter({
        tenantId: updated.tenant_id,
        reason: `tenant_${parsed.data.status}`
      });
    }

    return {
      tenantId: updated.tenant_id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
      operatingMode: updated.operating_mode,
      licensedSeats: updated.licensed_seats,
      licensedAiSeats: updated.licensed_ai_seats,
      aiModelAccessMode: updated.ai_model_access_mode,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      planId: updated.plan_id
    };
  });

  app.post("/api/platform/identities", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = IdentityCreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    try {
      const [identity] = await db("identities")
        .insert({
          email: parsed.data.email.toLowerCase().trim(),
          password_hash: passwordHash,
          status: parsed.data.status
        })
        .returning(["identity_id", "email", "status"]);

      await writePlatformAudit({
        actorIdentityId: auth.sub,
        action: "identity.create",
        targetType: "identity",
        targetId: identity.identity_id,
        status: "success",
        req,
        payload: { email: identity.email, status: identity.status }
      });

      return reply.status(201).send({
        identityId: identity.identity_id,
        email: identity.email,
        status: identity.status
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Identity email already exists" });
      }
      throw error;
    }
  });

  app.post("/api/platform/tenant-accounts", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = TenantAccountCreateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const tenantExists = await db("tenants")
      .where({ tenant_id: parsed.data.tenantId })
      .select("tenant_id", "status", "licensed_seats")
      .first<{ tenant_id: string; status: string; licensed_seats: number | null }>();
    if (!tenantExists) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }
    if (tenantExists.status !== "active") {
      return reply.status(409).send({ error: "conflict", message: "Tenant is not active" });
    }
    if (parsed.data.status === "active" && tenantExists.licensed_seats !== null) {
      const activeSeats = await countActiveSeats(parsed.data.tenantId);
      if (activeSeats >= tenantExists.licensed_seats) {
        return reply.status(409).send({ error: "seat_limit_exceeded", message: "Licensed seat limit reached" });
      }
    }

    const passwordHash = await hashPassword(parsed.data.password);

    try {
      const result = await db.transaction(async (trx) => {
        const [identity] = await trx("identities")
          .insert({
            email: parsed.data.email.toLowerCase().trim(),
            password_hash: passwordHash,
            status: parsed.data.status
          })
          .returning(["identity_id", "email", "status"]);

        if (parsed.data.isDefault) {
          await trx("tenant_memberships")
            .where({ identity_id: identity.identity_id })
            .update({ is_default: false, updated_at: trx.fn.now() });
        }

        const [membership] = await trx("tenant_memberships")
          .insert({
            tenant_id: parsed.data.tenantId,
            identity_id: identity.identity_id,
            role: parsed.data.role,
            status: parsed.data.status,
            is_default: parsed.data.isDefault
          })
          .returning(["membership_id", "tenant_id", "identity_id", "role", "status", "is_default"]);

        return { identity, membership };
      });

      await writePlatformAudit({
        actorIdentityId: auth.sub,
        action: "tenant.account.create",
        targetType: "membership",
        targetId: result.membership.membership_id,
        status: "success",
        req,
        payload: {
          tenantId: result.membership.tenant_id,
          identityId: result.identity.identity_id,
          email: result.identity.email,
          role: result.membership.role,
          status: result.membership.status,
          isDefault: result.membership.is_default
        }
      });

      return reply.status(201).send({
        identityId: result.identity.identity_id,
        email: result.identity.email,
        identityStatus: result.identity.status,
        membershipId: result.membership.membership_id,
        tenantId: result.membership.tenant_id,
        role: result.membership.role,
        membershipStatus: result.membership.status,
        isDefault: result.membership.is_default
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Identity email or tenant membership already exists" });
      }
      throw error;
    }
  });

  app.post("/api/platform/memberships", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const parsed = MembershipCreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const [tenantExists, identityExists] = await Promise.all([
      db("tenants").where({ tenant_id: parsed.data.tenantId }).select("tenant_id").first(),
      db("identities").where({ identity_id: parsed.data.identityId }).select("identity_id").first()
    ]);

    if (!tenantExists) {
      return reply.status(404).send({ error: "not_found", message: "Tenant not found" });
    }
    if (!identityExists) {
      return reply.status(404).send({ error: "not_found", message: "Identity not found" });
    }

    try {
      const membership = await db.transaction(async (trx) => {
        if (parsed.data.isDefault) {
          await trx("tenant_memberships").where({ identity_id: parsed.data.identityId }).update({ is_default: false, updated_at: trx.fn.now() });
        }

        const [created] = await trx("tenant_memberships")
          .insert({
            tenant_id: parsed.data.tenantId,
            identity_id: parsed.data.identityId,
            role: parsed.data.role,
            status: parsed.data.status,
            is_default: parsed.data.isDefault
          })
          .returning(["membership_id", "tenant_id", "identity_id", "role", "status", "is_default"]);

        return created;
      });

      await writePlatformAudit({
        actorIdentityId: auth.sub,
        action: "membership.create",
        targetType: "membership",
        targetId: membership.membership_id,
        status: "success",
        req,
        payload: {
          tenantId: membership.tenant_id,
          identityId: membership.identity_id,
          role: membership.role,
          status: membership.status,
          isDefault: membership.is_default
        }
      });

      return reply.status(201).send({
        membershipId: membership.membership_id,
        tenantId: membership.tenant_id,
        identityId: membership.identity_id,
        role: membership.role,
        status: membership.status,
        isDefault: membership.is_default
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: "conflict", message: "Membership already exists for this tenant and identity" });
      }
      throw error;
    }
  });

  app.patch("/api/platform/memberships/:membershipId", async (req, reply) => {
    const auth = await requirePlatformAccess(app, req);

    const params = MembershipIdParam.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid membershipId" });
    }

    const parsed = MembershipPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: "Invalid request body" });
    }

    const existing = await db("tenant_memberships")
      .where({ membership_id: params.data.membershipId })
      .select("membership_id", "identity_id")
      .first<{ membership_id: string; identity_id: string }>();

    if (!existing) {
      return reply.status(404).send({ error: "not_found", message: "Membership not found" });
    }

    const updates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.isDefault !== undefined) updates.is_default = parsed.data.isDefault;

    const updated = await db.transaction(async (trx) => {
      if (parsed.data.isDefault === true) {
        await trx("tenant_memberships").where({ identity_id: existing.identity_id }).update({ is_default: false, updated_at: trx.fn.now() });
      }

      if (parsed.data.status === "active") {
        const existingRow = await trx("tenant_memberships")
          .where({ membership_id: params.data.membershipId })
          .select("tenant_id", "status")
          .first<{ tenant_id: string; status: string }>();
        if (!existingRow) {
          throw app.httpErrors.notFound("Membership not found");
        }
        if (existingRow.status !== "active") {
          const tenant = await trx("tenants")
            .where({ tenant_id: existingRow.tenant_id })
            .select("licensed_seats")
            .first<{ licensed_seats: number | null }>();
          if (tenant?.licensed_seats !== null) {
            const activeSeats = await trx("tenant_memberships")
              .where({ tenant_id: existingRow.tenant_id, status: "active" })
              .count<{ cnt: string }>("membership_id as cnt")
              .first();
            if (Number(activeSeats?.cnt ?? 0) >= tenant.licensed_seats) {
              throw app.httpErrors.conflict("Licensed seat limit reached");
            }
          }
        }
      }

      const [row] = await trx("tenant_memberships")
        .where({ membership_id: params.data.membershipId })
        .update(updates)
        .returning(["membership_id", "tenant_id", "identity_id", "role", "status", "is_default", "updated_at"]);

      return row;
    });

    if (parsed.data.status === "inactive") {
      await revokeAuthSessionsByFilter({
        identityId: updated.identity_id,
        tenantId: updated.tenant_id,
        reason: "membership_inactive"
      });
    }

    await writePlatformAudit({
      actorIdentityId: auth.sub,
      action: "membership.update",
      targetType: "membership",
      targetId: updated.membership_id,
      status: "success",
      req,
      payload: parsed.data
    });

    return {
      membershipId: updated.membership_id,
      tenantId: updated.tenant_id,
      identityId: updated.identity_id,
      role: updated.role,
      status: updated.status,
      isDefault: updated.is_default,
      updatedAt: updated.updated_at
    };
  });
}

async function requirePlatformAccess(app: FastifyInstance, req: FastifyRequest) {
  let payload: PlatformAccessPayload;
  try {
    payload = await req.jwtVerify<PlatformAccessPayload>();
  } catch {
    throw app.httpErrors.unauthorized("Access token required");
  }

  if (payload.type !== "access" || payload.scope !== PLATFORM_SCOPE || payload.role !== PLATFORM_ROLE) {
    throw app.httpErrors.unauthorized("Platform access token required");
  }

  try {
    await assertActivePlatformAccessPayload(payload);
  } catch {
    throw app.httpErrors.unauthorized("Session expired or revoked");
  }

  const activeAdmin = await isPlatformAdminActive(payload.sub);
  if (!activeAdmin) {
    await revokePlatformSession(payload.sessionId, "platform_admin_revoked");
    throw app.httpErrors.forbidden("Platform admin access revoked");
  }

  return payload;
}

async function issuePlatformTokens(
  reply: FastifyReply,
  identityId: string,
  sessionId: string,
  refreshJti: string
) {
  const accessToken = await reply.jwtSign(
    {
      sub: identityId,
      scope: PLATFORM_SCOPE,
      role: PLATFORM_ROLE,
      sessionId,
      type: "access"
    },
    { expiresIn: "1h" }
  );

  const refreshToken = await reply.jwtSign(
    {
      sub: identityId,
      scope: PLATFORM_SCOPE,
      role: PLATFORM_ROLE,
      sessionId,
      jti: refreshJti,
      type: "refresh"
    },
    { expiresIn: "24h" }
  );

  return { accessToken, refreshToken };
}

async function writePlatformAudit(input: {
  actorIdentityId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  status: "success" | "failed";
  req: FastifyRequest;
  payload?: Record<string, unknown>;
}) {
  await db("platform_audit_logs").insert({
    actor_identity_id: input.actorIdentityId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    status: input.status,
    payload: input.payload ?? {},
    request_ip: input.req.ip,
    user_agent: typeof input.req.headers["user-agent"] === "string" ? input.req.headers["user-agent"] : null
  });
}

async function isPlatformAdminActive(identityId: string) {
  const row = await db("platform_admins as pa")
    .join("identities as i", "i.identity_id", "pa.identity_id")
    .where({
      "pa.identity_id": identityId,
      "pa.is_active": true,
      "i.status": "active"
    })
    .select("pa.platform_admin_id")
    .first();

  return !!row;
}

async function getPlanByCode(code: string) {
  const plan = await db("tenant_plans")
    .where({ code })
    .select("plan_id", "code", "name", "max_agents", "ai_token_quota_monthly")
    .first<PlanRow>();
  return plan ?? null;
}

async function countActiveSeats(tenantId: string): Promise<number> {
  const row = await db("tenant_memberships")
    .where({ tenant_id: tenantId, status: "active" })
    .whereNot({ role: "readonly" })
    .count<{ cnt: string }>("membership_id as cnt")
    .first();

  return Number(row?.cnt ?? 0);
}

async function getActiveSeatUsageMap(tenantIds: string[]): Promise<Map<string, number>> {
  if (tenantIds.length === 0) return new Map();

  const rows = await db("tenant_memberships")
    .whereIn("tenant_id", tenantIds)
    .andWhere({ status: "active" })
    .whereNot({ role: "readonly" })
    .select("tenant_id")
    .count<{ tenant_id: string; cnt: string }[]>("membership_id as cnt")
    .groupBy("tenant_id");

  return new Map(rows.map((row) => [row.tenant_id, Number(row.cnt ?? 0)]));
}

async function countTenantAccounts(tenantId: string): Promise<number> {
  const row = await db("tenant_memberships")
    .where({ tenant_id: tenantId })
    .count<{ cnt: string }>("membership_id as cnt")
    .first();

  return Number(row?.cnt ?? 0);
}

async function getTenantAccountCountMap(tenantIds: string[]): Promise<Map<string, number>> {
  if (tenantIds.length === 0) return new Map();

  const rows = await db("tenant_memberships")
    .whereIn("tenant_id", tenantIds)
    .select("tenant_id")
    .count<{ tenant_id: string; cnt: string }[]>("membership_id as cnt")
    .groupBy("tenant_id");

  return new Map(rows.map((row) => [row.tenant_id, Number(row.cnt ?? 0)]));
}

async function getActiveAISeatUsageMap(tenantIds: string[]): Promise<Map<string, number>> {
  if (tenantIds.length === 0) return new Map();

  const rows = await db("tenant_ai_agents")
    .whereIn("tenant_id", tenantIds)
    .andWhere({ status: "active" })
    .select("tenant_id")
    .count<{ tenant_id: string; cnt: string }[]>("ai_agent_id as cnt")
    .groupBy("tenant_id");

  return new Map(rows.map((row) => [row.tenant_id, Number(row.cnt ?? 0)]));
}

async function getTenantPrimaryAIConfig(tenantId: string): Promise<{
  source: string;
  provider: string;
  model: string;
  hasApiKey: boolean;
  baseUrl: string | null;
} | null> {
  const row = await db("ai_configs")
    .where({ tenant_id: tenantId })
    .andWhere({ is_active: true })
    .select("source", "provider", "model", "encrypted_api_key", "quotas", "is_default", "updated_at")
    .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
    .first<{
      source: string | null;
      provider: string | null;
      model: string | null;
      encrypted_api_key: string | null;
      quotas: unknown;
    } | undefined>();

  if (!row) return null;
  const provider = normalizeAIProviderLabel(row.provider) ?? "openai";
  const keyBag = parseAIConfigKeyBag(row.encrypted_api_key);
  return {
    source: row.source === "own" ? "own" : "platform",
    provider,
    model: row.model ?? defaultModelForAIProvider(provider),
    hasApiKey: Boolean(readAIProviderApiKey(keyBag, provider)),
    baseUrl: readAIProviderBaseUrl(parseAIConfigQuotas(row.quotas), provider)
  };
}

async function getTenantPrimaryAIConfigMap(
  tenantIds: string[]
): Promise<Map<string, { source: string; provider: string; model: string; hasApiKey: boolean; baseUrl: string | null }>> {
  if (tenantIds.length === 0) return new Map();

  const rows = await db("ai_configs")
    .whereIn("tenant_id", tenantIds)
    .andWhere({ is_active: true })
    .select("tenant_id", "source", "provider", "model", "encrypted_api_key", "quotas", "is_default", "updated_at")
    .orderBy([
      { column: "tenant_id", order: "asc" },
      { column: "is_default", order: "desc" },
      { column: "updated_at", order: "desc" }
    ]);

  const result = new Map<string, { source: string; provider: string; model: string; hasApiKey: boolean; baseUrl: string | null }>();
  for (const row of rows) {
    if (result.has(row.tenant_id as string)) continue;
    const provider = normalizeAIProviderLabel(row.provider) ?? "openai";
    const keyBag = parseAIConfigKeyBag(row.encrypted_api_key);
    result.set(row.tenant_id as string, {
      source: row.source === "own" ? "own" : "platform",
      provider,
      model: (row.model as string | null) ?? defaultModelForAIProvider(provider),
      hasApiKey: Boolean(readAIProviderApiKey(keyBag, provider)),
      baseUrl: readAIProviderBaseUrl(parseAIConfigQuotas(row.quotas), provider)
    });
  }
  return result;
}

function parseAIConfigKeyBag(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { apiKey: raw };
  } catch {
    return { apiKey: raw };
  }
}

function parseAIConfigQuotas(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...(parsed as Record<string, unknown>) };
    } catch {
      return {};
    }
  }
  return {};
}

function readAIProviderApiKey(keyBag: Record<string, unknown>, provider: (typeof AI_PROVIDER_OPTIONS)[number]): string | null {
  const aliases = provider === "claude"
    ? ["anthropicApiKey", "claudeApiKey", "apiKey"]
    : provider === "llama"
      ? ["ollamaApiKey", "llamaApiKey", "apiKey"]
      : [`${provider}ApiKey`, "apiKey"];
  for (const key of aliases) {
    const value = keyBag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function setAIProviderApiKey(keyBag: Record<string, unknown>, provider: (typeof AI_PROVIDER_OPTIONS)[number], apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) return;
  const field = provider === "claude" ? "anthropicApiKey" : provider === "llama" ? "ollamaApiKey" : `${provider}ApiKey`;
  keyBag[field] = normalized;
  keyBag.apiKey = normalized;
}

function readAIProviderBaseUrl(quotas: Record<string, unknown>, provider: (typeof AI_PROVIDER_OPTIONS)[number]): string | null {
  const integrations = quotas.integrations && typeof quotas.integrations === "object" && !Array.isArray(quotas.integrations)
    ? (quotas.integrations as Record<string, unknown>)
    : {};
  const key = provider === "claude" ? "anthropic" : provider === "llama" ? "ollama" : provider;
  const block = integrations[key];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const baseUrl = (block as Record<string, unknown>).baseUrl;
  return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
}

function setAIProviderBaseUrl(quotas: Record<string, unknown>, provider: (typeof AI_PROVIDER_OPTIONS)[number], baseUrl: string | null) {
  const integrations = quotas.integrations && typeof quotas.integrations === "object" && !Array.isArray(quotas.integrations)
    ? { ...(quotas.integrations as Record<string, unknown>) }
    : {};
  const key = provider === "claude" ? "anthropic" : provider === "llama" ? "ollama" : provider;
  const existing = integrations[key];
  const block = existing && typeof existing === "object" && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};

  if (baseUrl && baseUrl.trim()) {
    block.baseUrl = baseUrl.trim();
    integrations[key] = block;
  } else {
    delete block.baseUrl;
    if (Object.keys(block).length > 0) integrations[key] = block;
    else delete integrations[key];
  }

  quotas.integrations = integrations;
}

function normalizeAIProviderLabel(value: unknown): (typeof AI_PROVIDER_OPTIONS)[number] | null {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (provider === "anthropic" || provider === "claude") return "claude";
  if (provider === "gemini") return "gemini";
  if (provider === "deepseek") return "deepseek";
  if (provider === "ollama" || provider === "llama") return "llama";
  if (provider === "kim" || provider === "kimi") return "kimi";
  if (provider === "qwen") return "qwen";
  if (provider === "private" || provider === "private_model") return "private";
  if (provider === "openai") return "openai";
  return null;
}

function defaultModelForAIProvider(provider: (typeof AI_PROVIDER_OPTIONS)[number]): string {
  if (provider === "claude") return "claude-3-5-haiku-latest";
  if (provider === "gemini") return "gemini-2.0-flash";
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "llama") return "llama3.1:8b";
  if (provider === "kimi") return "moonshot-v1-8k";
  if (provider === "qwen") return "qwen-plus";
  if (provider === "private") return "private-model";
  return "gpt-4o-mini";
}

function formatDateOnly(input: unknown): string {
  if (typeof input === "string") return input.slice(0, 10);
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input).slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function makeInvoiceNo(tenantSlug: string, periodEnd: string, cycleId: string): string {
  const ym = periodEnd.replace(/-/g, "").slice(0, 6);
  const slug = tenantSlug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "TENANT";
  const suffix = cycleId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${ym}-${slug}-${suffix}`;
}

function planBaseFee(planCode: string | null): number {
  if (!planCode) return 99;
  const code = planCode.toLowerCase();
  if (code === "enterprise") return 999;
  if (code === "pro") return 299;
  return 99;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

type InvoiceStatementData = {
  invoiceId: string;
  invoiceNo: string;
  tenantName: string;
  tenantSlug: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
  status: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  payments: Array<{
    paymentId: string;
    amount: number;
    method: string;
    referenceNo: string | null;
    receivedAt: string;
  }>;
};

type StatementTemplateOptions = {
  lang: "en" | "zh-CN" | "id";
  includeTax: boolean;
  taxRate: number;
  brandName: string;
  companyName: string;
  companyAddress: string;
  supportEmail: string;
  website: string;
  taxId: string;
};

async function getInvoiceStatementData(invoiceId: string): Promise<InvoiceStatementData | null> {
  const invoice = await db("billing_invoices as bi")
    .join("tenants as t", "t.tenant_id", "bi.tenant_id")
    .join("billing_cycles as bc", "bc.cycle_id", "bi.cycle_id")
    .where("bi.invoice_id", invoiceId)
    .select(
      "bi.invoice_id",
      "bi.invoice_no",
      "t.name as tenant_name",
      "t.slug as tenant_slug",
      "bi.currency",
      "bi.amount_due",
      "bi.amount_paid",
      "bi.status",
      "bi.issued_at",
      "bi.due_at",
      "bi.paid_at",
      "bc.period_start",
      "bc.period_end"
    )
    .first<{
      invoice_id: string;
      invoice_no: string;
      tenant_name: string;
      tenant_slug: string;
      currency: string;
      amount_due: number | string;
      amount_paid: number | string;
      status: string;
      issued_at: Date | string;
      due_at: Date | string | null;
      paid_at: Date | string | null;
      period_start: Date | string;
      period_end: Date | string;
    }>();

  if (!invoice) return null;

  const payments = await db("billing_payments")
    .where("invoice_id", invoiceId)
    .select("payment_id", "amount", "method", "reference_no", "received_at")
    .orderBy("received_at", "asc");

  const amountDue = Number(invoice.amount_due ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);

  return {
    invoiceId: invoice.invoice_id,
    invoiceNo: invoice.invoice_no,
    tenantName: invoice.tenant_name,
    tenantSlug: invoice.tenant_slug,
    currency: invoice.currency,
    amountDue,
    amountPaid,
    outstanding: round2(Math.max(0, amountDue - amountPaid)),
    status: invoice.status,
    issuedAt: new Date(invoice.issued_at).toISOString(),
    dueAt: invoice.due_at ? new Date(invoice.due_at).toISOString() : null,
    paidAt: invoice.paid_at ? new Date(invoice.paid_at).toISOString() : null,
    periodStart: formatDateOnly(invoice.period_start),
    periodEnd: formatDateOnly(invoice.period_end),
    payments: payments.map((p) => ({
      paymentId: p.payment_id,
      amount: Number(p.amount ?? 0),
      method: p.method,
      referenceNo: p.reference_no ?? null,
      receivedAt: new Date(p.received_at).toISOString()
    }))
  };
}

function buildStatementTemplateOptions(input: z.infer<typeof BillingStatementQuery>): StatementTemplateOptions {
  return {
    lang: input.lang,
    includeTax: input.includeTax,
    taxRate: input.taxRate,
    brandName: input.brandName?.trim() || "NuyChat Platform",
    companyName: input.companyName?.trim() || "NuyChat Technology Ltd.",
    companyAddress: input.companyAddress?.trim() || "N/A",
    supportEmail: input.supportEmail?.trim() || "support@nuychat.local",
    website: input.website?.trim() || "https://nuychat.local",
    taxId: input.taxId?.trim() || "N/A"
  };
}

function statementHeaders(lang: "en" | "zh-CN" | "id") {
  if (lang === "zh-CN") {
    return {
      invoice: "发票信息",
      payments: "付款明细",
      colInvoiceNo: "发票号",
      colTenantSlug: "公司标识",
      colTenantName: "公司名称",
      colPeriodStart: "账期开始",
      colPeriodEnd: "账期结束",
      colCurrency: "币种",
      colSubtotal: "未税金额",
      colTaxRate: "税率",
      colTaxAmount: "税额",
      colTotalDue: "含税应付",
      colAmountPaid: "已付金额",
      colOutstanding: "待付金额",
      colStatus: "状态",
      colIssuedAt: "开票时间",
      colDueAt: "到期时间",
      colPaidAt: "结清时间",
      colLanguage: "语言",
      colBrand: "品牌",
      colCompany: "公司",
      colCompanyAddress: "公司地址",
      colTaxId: "税号",
      colSupportEmail: "支持邮箱",
      colWebsite: "官网",
      paymentId: "付款ID",
      paymentAmount: "付款金额",
      paymentMethod: "付款方式",
      paymentReference: "流水号",
      paymentReceivedAt: "到账时间"
    };
  }
  if (lang === "id") {
    return {
      invoice: "Ringkasan Faktur",
      payments: "Rincian Pembayaran",
      colInvoiceNo: "Nomor Faktur",
      colTenantSlug: "Slug Tenant",
      colTenantName: "Nama Tenant",
      colPeriodStart: "Periode Mulai",
      colPeriodEnd: "Periode Akhir",
      colCurrency: "Mata Uang",
      colSubtotal: "Subtotal",
      colTaxRate: "Pajak",
      colTaxAmount: "Nilai Pajak",
      colTotalDue: "Total Tagihan",
      colAmountPaid: "Total Dibayar",
      colOutstanding: "Sisa Tagihan",
      colStatus: "Status",
      colIssuedAt: "Terbit",
      colDueAt: "Jatuh Tempo",
      colPaidAt: "Lunas",
      colLanguage: "Bahasa",
      colBrand: "Merek",
      colCompany: "Perusahaan",
      colCompanyAddress: "Alamat",
      colTaxId: "NPWP/Tax ID",
      colSupportEmail: "Email Dukungan",
      colWebsite: "Situs",
      paymentId: "ID Pembayaran",
      paymentAmount: "Jumlah",
      paymentMethod: "Metode",
      paymentReference: "Referensi",
      paymentReceivedAt: "Waktu Diterima"
    };
  }
  return {
    invoice: "Invoice Statement",
    payments: "Payment Lines",
    colInvoiceNo: "invoice_no",
    colTenantSlug: "tenant_slug",
    colTenantName: "tenant_name",
    colPeriodStart: "period_start",
    colPeriodEnd: "period_end",
    colCurrency: "currency",
    colSubtotal: "subtotal",
    colTaxRate: "tax_rate",
    colTaxAmount: "tax_amount",
    colTotalDue: "total_due",
    colAmountPaid: "amount_paid",
    colOutstanding: "outstanding",
    colStatus: "status",
    colIssuedAt: "issued_at",
    colDueAt: "due_at",
    colPaidAt: "paid_at",
    colLanguage: "language",
    colBrand: "brand_name",
    colCompany: "company_name",
    colCompanyAddress: "company_address",
    colTaxId: "tax_id",
    colSupportEmail: "support_email",
    colWebsite: "website",
    paymentId: "payment_id",
    paymentAmount: "amount",
    paymentMethod: "method",
    paymentReference: "reference_no",
    paymentReceivedAt: "received_at"
  };
}

function buildInvoiceStatementCsv(data: InvoiceStatementData, template: StatementTemplateOptions): string {
  const h = statementHeaders(template.lang);
  const subtotal = template.includeTax ? round2(data.amountDue / (1 + template.taxRate)) : data.amountDue;
  const taxAmount = template.includeTax ? round2(data.amountDue - subtotal) : 0;
  const lines: string[] = [];
  lines.push(`${h.invoice}`);
  lines.push(
    [
      h.colInvoiceNo,
      h.colTenantSlug,
      h.colTenantName,
      h.colPeriodStart,
      h.colPeriodEnd,
      h.colCurrency,
      h.colSubtotal,
      h.colTaxRate,
      h.colTaxAmount,
      h.colTotalDue,
      h.colAmountPaid,
      h.colOutstanding,
      h.colStatus,
      h.colIssuedAt,
      h.colDueAt,
      h.colPaidAt,
      h.colLanguage,
      h.colBrand,
      h.colCompany,
      h.colCompanyAddress,
      h.colTaxId,
      h.colSupportEmail,
      h.colWebsite
    ].join(",")
  );
  lines.push(
    [
      csvField(data.invoiceNo),
      csvField(data.tenantSlug),
      csvField(data.tenantName),
      csvField(data.periodStart),
      csvField(data.periodEnd),
      csvField(data.currency),
      csvField(String(subtotal)),
      csvField(String(template.taxRate)),
      csvField(String(taxAmount)),
      csvField(String(data.amountDue)),
      csvField(String(data.amountPaid)),
      csvField(String(data.outstanding)),
      csvField(data.status),
      csvField(data.issuedAt),
      csvField(data.dueAt ?? ""),
      csvField(data.paidAt ?? ""),
      csvField(template.lang),
      csvField(template.brandName),
      csvField(template.companyName),
      csvField(template.companyAddress),
      csvField(template.taxId),
      csvField(template.supportEmail),
      csvField(template.website)
    ].join(",")
  );
  lines.push("");
  lines.push(h.payments);
  lines.push([h.paymentId, h.paymentAmount, h.paymentMethod, h.paymentReference, h.paymentReceivedAt].join(","));
  for (const p of data.payments) {
    lines.push(
      [
        csvField(p.paymentId),
        csvField(String(p.amount)),
        csvField(p.method),
        csvField(p.referenceNo ?? ""),
        csvField(p.receivedAt)
      ].join(",")
    );
  }
  return lines.join("\n");
}

function csvField(value: string): string {
  const escaped = value.replaceAll("\"", "\"\"");
  return `"${escaped}"`;
}

function buildInvoiceStatementPdf(data: InvoiceStatementData, template: StatementTemplateOptions): Buffer {
  const subtotal = template.includeTax ? round2(data.amountDue / (1 + template.taxRate)) : data.amountDue;
  const taxAmount = template.includeTax ? round2(data.amountDue - subtotal) : 0;
  const lines = [
    `${template.brandName} - Invoice Statement`,
    `Language: ${template.lang}`,
    `Company: ${template.companyName}`,
    `Address: ${template.companyAddress}`,
    `Tax ID: ${template.taxId}`,
    `Support: ${template.supportEmail} | ${template.website}`,
    `Invoice No: ${data.invoiceNo}`,
    `Tenant: ${data.tenantName} (${data.tenantSlug})`,
    `Period: ${data.periodStart} ~ ${data.periodEnd}`,
    `Status: ${data.status}`,
    `Currency: ${data.currency}`,
    `Subtotal: ${subtotal.toFixed(2)}`,
    `Tax Rate: ${(template.taxRate * 100).toFixed(2)}%`,
    `Tax Amount: ${taxAmount.toFixed(2)}`,
    `Amount Due: ${data.amountDue.toFixed(2)}`,
    `Amount Paid: ${data.amountPaid.toFixed(2)}`,
    `Outstanding: ${data.outstanding.toFixed(2)}`,
    `Issued At: ${data.issuedAt}`,
    `Due At: ${data.dueAt ?? "-"}`,
    `Paid At: ${data.paidAt ?? "-"}`,
    "",
    "Payments:",
    ...(
      data.payments.length === 0
        ? ["- none"]
        : data.payments.map((p, idx) => `${idx + 1}. ${p.receivedAt} | ${p.amount.toFixed(2)} | ${p.method} | ${p.referenceNo ?? "-"}`)
    )
  ];
  return simplePdfFromLines(lines);
}

function simplePdfFromLines(lines: string[]): Buffer {
  const escapedLines = lines.map((line) => pdfEscape(line));
  const textBody = escapedLines.map((line, i) => `1 0 0 1 50 ${790 - i * 16} Tm (${line}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n${textBody}\nET`;

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let body = "";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(body.length + "%PDF-1.4\n".length);
    body += objects[i];
  }
  const xrefStart = "%PDF-1.4\n".length + body.length;
  const xrefRows = ["0000000000 65535 f "];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefRows.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }

  const xref = `xref\n0 ${objects.length + 1}\n${xrefRows.join("\n")}\n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "utf8");
}

function pdfEscape(v: string): string {
  return v.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "23505";
}

function hasManifestToolName(manifest: Record<string, unknown> | null | undefined): boolean {
  if (!manifest || typeof manifest !== "object") return false;
  return typeof manifest.toolName === "string" && manifest.toolName.trim().length > 0;
}

function buildPublicChannelKey(slug: string): string {
  const suffix = crypto.randomBytes(6).toString("hex");
  return `wc_${slug}_${suffix}`;
}

async function hashPassword(password: string): Promise<string> {
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
