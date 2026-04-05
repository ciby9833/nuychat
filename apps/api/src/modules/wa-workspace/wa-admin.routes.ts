/**
 * 作用:
 * - 提供 WA 模块的租户管理端接口。
 *
 * 交互:
 * - 与 tenant admin guard 交互，复用现有后台权限体系。
 * - 调用 wa-admin.service 管理账号池、登录任务、成员绑定、WA 座席资格。
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
  reconnectAdminWaAccount,
  updateAdminWaAccountOwner
} from "./wa-admin.service.js";

export async function waAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/wa/accounts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => listAdminWaAccounts(trx, tenantId));
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
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) => reconnectAdminWaAccount(trx, { tenantId, waAccountId }));
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
