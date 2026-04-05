/**
 * 作用:
 * - 提供 WA 工作台的鉴权与权限辅助函数。
 *
 * 交互:
 * - 被 wa-workbench.routes 调用，校验登录态、租户上下文与 WA 座席资格。
 * - 不参与 admin 路由鉴权，admin 仍走统一的 tenant admin guard。
 */
import type { FastifyInstance, FastifyRequest } from "fastify";

export function requireTenantAuth(app: FastifyInstance, req: FastifyRequest) {
  const tenantId = req.tenant?.tenantId ?? req.auth?.tenantId;
  if (!tenantId) {
    throw app.httpErrors.unauthorized("Access token required");
  }
  const membershipId = req.auth?.membershipId;
  if (!membershipId) {
    throw app.httpErrors.unauthorized("Membership required");
  }
  return {
    tenantId,
    membershipId,
    role: req.auth?.role ?? "agent"
  };
}

export function requireWaSeatAccess(app: FastifyInstance, req: FastifyRequest) {
  const auth = requireTenantAuth(app, req);
  if (!req.auth?.waSeatEnabled) {
    throw app.httpErrors.forbidden("WhatsApp seat is not enabled for this membership");
  }
  return auth;
}
