import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";

import { redisConnection } from "../../infra/redis/client.js";
import { getTenantContextById, type TenantContext } from "./tenant.repository.js";
import {
  assertActiveAccessPayload,
  getAgentIdByMembership,
  type AccessPayload
} from "../auth/auth-session.service.js";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantContext;
    auth?: AccessPayload;
  }
}

const CACHE_TTL_SECONDS = 300;

export const tenantContextPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorateRequest("tenant", undefined);
  app.decorateRequest("auth", undefined);

  app.addHook("preHandler", async (req) => {
    const auth = await resolveAuth(app, req);
    if (auth) {
      req.auth = auth;
    }

    const tenantId = auth?.tenantId;
    if (!tenantId) {
      return;
    }

    const cached = await redisConnection.get(cacheKey(tenantId));
    if (cached) {
      req.tenant = JSON.parse(cached) as TenantContext;
      return;
    }

    const tenant = await getTenantContextById(tenantId);
    if (!tenant) {
      throw app.httpErrors.notFound(`Tenant not found: ${tenantId}`);
    }

    await redisConnection.set(cacheKey(tenantId), JSON.stringify(tenant), "EX", CACHE_TTL_SECONDS);
    req.tenant = tenant;
  });
});

async function resolveAuth(app: FastifyInstance, req: FastifyRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  try {
    const payload = await req.jwtVerify<Record<string, unknown>>();
    if (payload.scope === "platform") {
      return undefined;
    }

    if (payload.type !== "access") {
      throw app.httpErrors.unauthorized("Access token required");
    }

    const accessPayload = payload as AccessPayload;
    await assertActiveAccessPayload(accessPayload);
    if (accessPayload.membershipId) {
      const liveAgentId = await getAgentIdByMembership(accessPayload.tenantId, accessPayload.membershipId);
      accessPayload.agentId = liveAgentId;
    }
    return accessPayload;
  } catch {
    app.log.warn({ path: req.url }, "Failed to resolve tenant from JWT");
    return undefined;
  }
}

function cacheKey(tenantId: string) {
  return `tenant:ctx:${tenantId}`;
}
