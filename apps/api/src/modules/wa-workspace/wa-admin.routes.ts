/**
 * 作用:
 * - 提供 WA 模块的租户管理端接口。
 *
 * 交互:
 * - 与 tenant admin guard 交互，复用现有后台权限体系。
 * - 调用 wa-admin.service 管理账号池、登录任务、成员绑定、WA 座席资格。
 * - 调用 wa-runtime.service 输出 WA 基础设施可用性，避免未部署时继续暴露操作入口。
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { isUniqueViolation, normalizeNonEmptyString } from "../tenant/tenant-admin.shared.js";
import {
  assignAdminWaAccountMembers,
  createAdminLoginTask,
  createAdminWaAccount,
  getAdminWaAccountHealth,
  listAdminWaAccounts,
  logoutAdminWaAccount,
  reconnectAdminWaAccount,
  updateAdminWaAccountOwner
} from "./wa-admin.service.js";
import {
  getAdminWaDailyReport,
  getAdminWaMonitorConversationDetail,
  getAdminWaMonitorDashboard,
  loadMoreAdminWaMonitorMessages,
  listAdminWaMonitorConversations,
  listAdminWaReplyPool
} from "./wa-monitor.service.js";
import { getWaRuntimeStatus } from "./wa-runtime.service.js";

export async function waAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/wa/runtime", async () => getWaRuntimeStatus());

  app.get("/api/admin/wa/accounts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => listAdminWaAccounts(trx, tenantId));
  });

  app.get("/api/admin/wa/monitor/dashboard", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => getAdminWaMonitorDashboard(trx, tenantId));
  });

  app.get("/api/admin/wa/monitor/accounts/:waAccountId/conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId } = req.params as { waAccountId: string };
    const { search, limit, type } = req.query as { search?: string; limit?: string; type?: string };
    return withTenantTransaction(tenantId, async (trx) =>
      listAdminWaMonitorConversations(trx, {
        tenantId,
        waAccountId,
        search: typeof search === "string" ? search : null,
        type: type === "group" || type === "direct" ? type : null,
        limit: typeof limit === "string" ? Number(limit) : undefined
      })
    );
  });

  app.get("/api/admin/wa/monitor/conversations/:waConversationId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waConversationId } = req.params as { waConversationId: string };
    return withTenantTransaction(tenantId, async (trx) =>
      getAdminWaMonitorConversationDetail(trx, { tenantId, waConversationId })
    );
  });

  app.get("/api/admin/wa/monitor/conversations/:waConversationId/messages", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waConversationId } = req.params as { waConversationId: string };
    const query = req.query as { beforeSeq?: string; limit?: string };
    const beforeLogicalSeq = query.beforeSeq ? Number(query.beforeSeq) : null;
    if (beforeLogicalSeq === null || !Number.isFinite(beforeLogicalSeq)) {
      throw app.httpErrors.badRequest("beforeSeq (number) is required");
    }
    const limit = query.limit ? Math.min(Number(query.limit) || 50, 100) : 50;
    return withTenantTransaction(tenantId, async (trx) =>
      loadMoreAdminWaMonitorMessages(trx, {
        tenantId,
        waConversationId,
        beforeLogicalSeq,
        limit
      })
    );
  });

  app.get("/api/admin/wa/monitor/report/daily", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { date } = req.query as { date?: string };
    const reportDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);
    return withTenantTransaction(tenantId, async (trx) =>
      getAdminWaDailyReport(trx, { tenantId, date: reportDate })
    );
  });

  app.get("/api/admin/wa/monitor/reply-pool", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => listAdminWaReplyPool(trx, { tenantId }));
  });

  app.post("/api/admin/wa/accounts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { displayName?: string; phoneE164?: string; primaryOwnerMembershipId?: string | null };
    const displayName = normalizeNonEmptyString(body.displayName);
    if (!displayName) throw app.httpErrors.badRequest("displayName is required");

    try {
      return await withTenantTransaction(tenantId, async (trx) =>
        createAdminWaAccount(trx, {
          tenantId,
          displayName,
          phoneE164: body.phoneE164,
          primaryOwnerMembershipId: body.primaryOwnerMembershipId ?? null
        })
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw app.httpErrors.conflict("WA account instance key already exists");
      throw error;
    }
  });

  app.post("/api/admin/wa/accounts/:waAccountId/login-task", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const membershipId = req.auth?.membershipId;
    if (!tenantId || !membershipId) throw app.httpErrors.badRequest("Missing tenant context");
    const runtime = getWaRuntimeStatus();
    if (!runtime.available) {
      throw app.httpErrors.serviceUnavailable("WhatsApp provider is not available");
    }
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) =>
      createAdminLoginTask(trx, { tenantId, waAccountId, membershipId, loginMode: "admin_scan" })
    );
  });

  app.post("/api/admin/wa/accounts/:waAccountId/assign-members", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId } = req.params as { waAccountId: string };
    const body = req.body as { memberIds?: string[] };
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((item) => typeof item === "string" && item.trim()) : [];
    return withTenantTransaction(tenantId, async (trx) => {
      await assignAdminWaAccountMembers(trx, { tenantId, waAccountId, memberIds });
      return { updated: true, memberIds };
    });
  });

  app.patch("/api/admin/wa/accounts/:waAccountId/owner", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId } = req.params as { waAccountId: string };
    const body = req.body as { primaryOwnerMembershipId?: string | null };
    return withTenantTransaction(tenantId, async (trx) => {
      const updated = await updateAdminWaAccountOwner(trx, {
        tenantId,
        waAccountId,
        primaryOwnerMembershipId: body.primaryOwnerMembershipId ?? null
      });
      if (!updated) throw app.httpErrors.notFound("WA account not found");
      return updated;
    });
  });

  app.get("/api/admin/wa/accounts/:waAccountId/health", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) => getAdminWaAccountHealth(trx, tenantId, waAccountId));
  });

  app.post("/api/admin/wa/accounts/:waAccountId/reconnect", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const runtime = getWaRuntimeStatus();
    if (!runtime.available) {
      throw app.httpErrors.serviceUnavailable("WhatsApp provider is not available");
    }
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) => reconnectAdminWaAccount(trx, { tenantId, waAccountId }));
  });

  app.post("/api/admin/wa/accounts/:waAccountId/logout", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const runtime = getWaRuntimeStatus();
    if (!runtime.available) {
      throw app.httpErrors.serviceUnavailable("WhatsApp provider is not available");
    }
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) => logoutAdminWaAccount(trx, { tenantId, waAccountId }));
  });

  app.patch("/api/admin/wa/members/:membershipId/seat", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { membershipId } = req.params as { membershipId: string };
    const body = req.body as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") {
      throw app.httpErrors.badRequest("enabled must be boolean");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const [row] = await trx("tenant_memberships")
        .where({ tenant_id: tenantId, membership_id: membershipId })
        .update({
          wa_seat_enabled: body.enabled,
          updated_at: trx.fn.now()
        })
        .returning(["membership_id", "wa_seat_enabled"]);
      if (!row) throw app.httpErrors.notFound("Membership not found");
      return {
        membershipId: String(row.membership_id),
        waSeatEnabled: Boolean(row.wa_seat_enabled)
      };
    });
  });
}
