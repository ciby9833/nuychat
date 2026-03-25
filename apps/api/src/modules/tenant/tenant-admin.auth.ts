import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";

export const APP_ROLES = ["tenant_admin", "admin", "supervisor", "senior_agent", "agent", "readonly"] as const;
export const PERMISSION_KEYS = [
  "admin_console.read",
  "admin_console.write",
  "org.manage",
  "agents.manage",
  "routing.manage",
  "channels.manage",
  "kb.manage",
  "ai.manage",
  "marketplace.manage",
  "analytics.read"
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const DEFAULT_MATRIX: Record<AppRole, Record<PermissionKey, boolean>> = {
  tenant_admin: {
    "admin_console.read": true,
    "admin_console.write": true,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": true,
    "channels.manage": true,
    "kb.manage": true,
    "ai.manage": true,
    "marketplace.manage": true,
    "analytics.read": true
  },
  admin: {
    "admin_console.read": true,
    "admin_console.write": true,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": true,
    "channels.manage": true,
    "kb.manage": true,
    "ai.manage": true,
    "marketplace.manage": true,
    "analytics.read": true
  },
  supervisor: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  },
  senior_agent: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  },
  agent: {
    "admin_console.read": false,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": false
  },
  readonly: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  }
};

export function attachTenantAdminGuard(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    if (req.method === "OPTIONS") return;
    const payload = req.auth;
    if (!payload) {
      throw app.httpErrors.unauthorized("Access token required");
    }
    const role = normalizeRole(payload.role);
    if (!role) {
      throw app.httpErrors.forbidden("Role not allowed");
    }
    const routePath = resolveRoutePath(req);
    const permission = resolveRequiredPermission(req.method, routePath);
    const allowed = await hasPermission(req.tenant?.tenantId ?? payload.tenantId, role, permission);
    if (!allowed) {
      throw app.httpErrors.forbidden(`Permission denied: ${permission}`);
    }
  });
}

export function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  return APP_ROLES.includes(value as AppRole) ? (value as AppRole) : null;
}

export function normalizePermissionKey(value: unknown): PermissionKey | null {
  if (typeof value !== "string") return null;
  return PERMISSION_KEYS.includes(value as PermissionKey) ? (value as PermissionKey) : null;
}

export function resolveRequiredPermission(method: string, routePath: string): PermissionKey {
  const m = method.toUpperCase();
  if (routePath.startsWith("/api/admin/permission-policies")) {
    return m === "GET" ? "admin_console.read" : "admin_console.write";
  }
  if (routePath.startsWith("/api/admin/analytics")) return "analytics.read";
  if (routePath.startsWith("/api/admin/supervisor/")) return m === "GET" ? "analytics.read" : "agents.manage";
  if (routePath.startsWith("/api/admin/qa/")) return m === "GET" ? "analytics.read" : "admin_console.write";
  if (routePath.startsWith("/api/admin/csat/")) return m === "GET" ? "analytics.read" : "admin_console.write";
  if (routePath.startsWith("/api/admin/customers")) return m === "GET" ? "admin_console.read" : "org.manage";
  if (routePath.startsWith("/api/admin/sla-breaches")) return m === "GET" ? "analytics.read" : "admin_console.write";
  if (routePath.startsWith("/api/admin/sla-definitions")) return m === "GET" ? "admin_console.read" : "admin_console.write";
  if (routePath.startsWith("/api/admin/sla-trigger-policies")) return m === "GET" ? "admin_console.read" : "admin_console.write";
  if (routePath.startsWith("/api/admin/agent-presence")) return "admin_console.read";
  if (
    routePath.startsWith("/api/admin/shift-schedules") ||
    routePath.startsWith("/api/admin/agent-shifts") ||
    routePath.startsWith("/api/admin/agent-breaks")
  ) {
    return m === "GET" ? "admin_console.read" : "org.manage";
  }
  if (routePath.startsWith("/api/admin/departments") || routePath.startsWith("/api/admin/teams")) {
    return m === "GET" ? "admin_console.read" : "org.manage";
  }
  if (routePath.startsWith("/api/admin/modules")) return m === "GET" ? "admin_console.read" : "routing.manage";
  if (routePath.startsWith("/api/admin/members")) return m === "GET" ? "admin_console.read" : "agents.manage";
  if (routePath.startsWith("/api/admin/agents")) return m === "GET" ? "admin_console.read" : "agents.manage";
  if (routePath.startsWith("/api/admin/routing-rules") || routePath.startsWith("/api/admin/skill-groups")) {
    return m === "GET" ? "admin_console.read" : "routing.manage";
  }
  if (routePath.startsWith("/api/admin/dispatch-executions")) return "admin_console.read";
  if (routePath.startsWith("/api/admin/channel-configs")) return m === "GET" ? "admin_console.read" : "channels.manage";
  if (routePath.startsWith("/api/admin/knowledge-base")) return m === "GET" ? "admin_console.read" : "kb.manage";
  if (routePath.startsWith("/api/admin/ai-config")) return m === "GET" ? "admin_console.read" : "ai.manage";
  if (routePath.startsWith("/api/admin/ai-runtime-policy")) return m === "GET" ? "admin_console.read" : "ai.manage";
  if (routePath.startsWith("/api/admin/ai-agents")) return m === "GET" ? "admin_console.read" : "ai.manage";
  if (routePath.startsWith("/api/admin/ai-conversations")) return m === "GET" ? "admin_console.read" : "agents.manage";
  if (routePath.startsWith("/api/admin/customer-intelligence")) return m === "GET" ? "admin_console.read" : "ai.manage";
  if (routePath.startsWith("/api/admin/marketplace")) return m === "GET" ? "admin_console.read" : "marketplace.manage";
  if (routePath.startsWith("/api/admin/overview")) return "admin_console.read";
  return "admin_console.read";
}

async function hasPermission(tenantId: string, role: AppRole, permissionKey: PermissionKey): Promise<boolean> {
  const fallback = DEFAULT_MATRIX[role][permissionKey];
  try {
    return await withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("permission_policies")
        .where({
          tenant_id: tenantId,
          role,
          permission_key: permissionKey
        })
        .select("is_allowed")
        .first<{ is_allowed: boolean }>();
      if (!row) return fallback;
      return Boolean(row.is_allowed);
    });
  } catch (error) {
    console.warn("[AuthZ] permission lookup failed, fallback to defaults:", (error as Error).message);
    return fallback;
  }
}

function resolveRoutePath(req: {
  routeOptions?: { url?: string };
  raw?: { url?: string };
  url?: string;
}): string {
  const fromRoute = req.routeOptions?.url;
  if (typeof fromRoute === "string" && fromRoute.length > 0) return fromRoute;
  const fromRaw = req.raw?.url;
  if (typeof fromRaw === "string" && fromRaw.length > 0) return fromRaw.split("?")[0] ?? fromRaw;
  const fromReq = req.url;
  if (typeof fromReq === "string" && fromReq.length > 0) return fromReq.split("?")[0] ?? fromReq;
  return "/";
}
