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
  deleteAdminWaAccount,
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
  getAdminWaMonitorJudgmentConfig,
  listAdminWaMonitorAccountReport,
  listAdminWaMonitorMessageDetailReport,
  listAdminWaMonitorMemberReport,
  listAdminWaMonitorTimeReport,
  listAdminWaMonitorUnrepliedReport,
  listAdminWaMonitorTargets,
  loadMoreAdminWaMonitorMessages,
  listAdminWaMonitorConversations,
  listAdminWaReplyPool,
  setAdminWaMonitorTarget,
  syncWaMonitorAnalysisRepeatForTenant,
  triggerWaMonitorAnalysisScan,
  updateAdminWaMonitorJudgmentConfig
} from "./wa-monitor.service.js";
import { getWaRuntimeStatus } from "./wa-runtime.service.js";
import {
  bindJidToCustomer,
  createWaCustomerContact,
  getCustomerContactById,
  getCustomerReportStats,
  getGroupMembersWithBindings,
  listBindingsForCustomer,
  listWaCustomerContacts,
  listWaTeamMembers,
  unbindJid,
  updateWaCustomerContact
} from "./wa-customer.service.js";

function parseReportQuery(req: { query: unknown }, tenantId: string) {
  const query = req.query as {
    startAt?: string;
    endAt?: string;
    waAccountId?: string;
    membershipId?: string;
    requiresReply?: string;
    isReplied?: string;
    page?: string;
    pageSize?: string;
    granularity?: string;
  };
  const startAt = query.startAt ? new Date(query.startAt) : new Date(new Date().setHours(0, 0, 0, 0));
  const endAt = query.endAt ? new Date(query.endAt) : new Date(new Date().setHours(23, 59, 59, 999));
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
    throw new Error("Invalid time range");
  }
  return {
    tenantId,
    startAt,
    endAt,
    waAccountId: typeof query.waAccountId === "string" && query.waAccountId.trim() ? query.waAccountId.trim() : null,
    membershipId: typeof query.membershipId === "string" && query.membershipId.trim() ? query.membershipId.trim() : null,
    requiresReply: query.requiresReply === "true" ? true : query.requiresReply === "false" ? false : null,
    isReplied: query.isReplied === "true" ? true : query.isReplied === "false" ? false : null,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    granularity: query.granularity === "day" ? "day" as const : "hour" as const
  };
}

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

  app.get("/api/admin/wa/monitor/targets", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId, activeOnly } = req.query as { waAccountId?: string; activeOnly?: string };
    return withTenantTransaction(tenantId, async (trx) =>
      listAdminWaMonitorTargets(trx, {
        tenantId,
        waAccountId: typeof waAccountId === "string" && waAccountId.trim() ? waAccountId.trim() : null,
        activeOnly: activeOnly === "true"
      })
    );
  });

  app.get("/api/admin/wa/monitor/judgment-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => getAdminWaMonitorJudgmentConfig(trx, tenantId));
  });

  app.put("/api/admin/wa/monitor/judgment-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const membershipId = req.auth?.membershipId ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { isEnabled?: boolean; judgmentPrompt?: string; conditionText?: string };
    if (body.isEnabled != null && typeof body.isEnabled !== "boolean") {
      throw app.httpErrors.badRequest("isEnabled must be boolean");
    }
    if (body.judgmentPrompt != null && typeof body.judgmentPrompt !== "string") {
      throw app.httpErrors.badRequest("judgmentPrompt must be string");
    }
    if (body.conditionText != null && typeof body.conditionText !== "string") {
      throw app.httpErrors.badRequest("conditionText must be string");
    }
    return withTenantTransaction(tenantId, async (trx) =>
      updateAdminWaMonitorJudgmentConfig(trx, {
        tenantId,
        membershipId,
        isEnabled: body.isEnabled,
        judgmentPrompt: body.judgmentPrompt,
        conditionText: body.conditionText
      })
    );
  });

  app.put("/api/admin/wa/monitor/conversations/:waConversationId/target", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const membershipId = req.auth?.membershipId ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waConversationId } = req.params as { waConversationId: string };
    const body = req.body as { waAccountId?: string; isActive?: boolean };
    if (typeof body.waAccountId !== "string" || !body.waAccountId.trim()) {
      throw app.httpErrors.badRequest("waAccountId is required");
    }
    if (typeof body.isActive !== "boolean") {
      throw app.httpErrors.badRequest("isActive must be boolean");
    }
    const target = await withTenantTransaction(tenantId, async (trx) =>
      setAdminWaMonitorTarget(trx, {
        tenantId,
        waAccountId: body.waAccountId!.trim(),
        waConversationId,
        isActive: body.isActive!,
        membershipId
      })
    );
    await syncWaMonitorAnalysisRepeatForTenant(tenantId);
    return target;
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

  app.get("/api/admin/wa/monitor/reports/accounts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    let query: ReturnType<typeof parseReportQuery>;
    try {
      query = parseReportQuery(req, tenantId);
    } catch {
      throw app.httpErrors.badRequest("Invalid time range");
    }
    return withTenantTransaction(tenantId, async (trx) => listAdminWaMonitorAccountReport(trx, query));
  });

  app.get("/api/admin/wa/monitor/reports/members", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    let query: ReturnType<typeof parseReportQuery>;
    try {
      query = parseReportQuery(req, tenantId);
    } catch {
      throw app.httpErrors.badRequest("Invalid time range");
    }
    return withTenantTransaction(tenantId, async (trx) => listAdminWaMonitorMemberReport(trx, query));
  });

  app.get("/api/admin/wa/monitor/reports/time", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    let query: ReturnType<typeof parseReportQuery>;
    try {
      query = parseReportQuery(req, tenantId);
    } catch {
      throw app.httpErrors.badRequest("Invalid time range");
    }
    return withTenantTransaction(tenantId, async (trx) => listAdminWaMonitorTimeReport(trx, query));
  });

  app.get("/api/admin/wa/monitor/reports/unreplied", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    let query: ReturnType<typeof parseReportQuery>;
    try {
      query = parseReportQuery(req, tenantId);
    } catch {
      throw app.httpErrors.badRequest("Invalid time range");
    }
    return withTenantTransaction(tenantId, async (trx) => listAdminWaMonitorUnrepliedReport(trx, query));
  });

  app.get("/api/admin/wa/monitor/reports/messages", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    let query: ReturnType<typeof parseReportQuery>;
    try {
      query = parseReportQuery(req, tenantId);
    } catch {
      throw app.httpErrors.badRequest("Invalid time range");
    }
    return withTenantTransaction(tenantId, async (trx) => listAdminWaMonitorMessageDetailReport(trx, query));
  });

  app.post("/api/admin/wa/monitor/backfill", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { waAccountId?: string | null };
    return triggerWaMonitorAnalysisScan({
      tenantId,
      waAccountId: typeof body.waAccountId === "string" && body.waAccountId.trim() ? body.waAccountId.trim() : null
    });
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

  app.delete("/api/admin/wa/accounts/:waAccountId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(tenantId, async (trx) => deleteAdminWaAccount(trx, { tenantId, waAccountId }));
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

  // ─── Customer Contacts (管理端客户维度) ──────────────────────────────────────

  // 团队成员列表（用于负责销售选择器）
  app.get("/api/admin/wa/customer-contacts/team-members", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return listWaTeamMembers(tenantId);
  });

  // 列出客户档案
  app.get("/api/admin/wa/customer-contacts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { search?: string; status?: string; page?: string; pageSize?: string };
    return listWaCustomerContacts({
      tenantId,
      search: query.search ?? null,
      status: query.status ?? "active",
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 50
    });
  });

  // 创建客户档案
  app.post("/api/admin/wa/customer-contacts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const auth = req.user as { membershipId?: string } | undefined;
    const body = req.body as { displayName?: string; remarks?: string | null; ownerMembershipId?: string | null };
    if (!body.displayName?.trim()) throw app.httpErrors.badRequest("displayName is required");
    return createWaCustomerContact({
      tenantId,
      membershipId: auth?.membershipId ?? "",
      displayName: body.displayName.trim(),
      remarks: body.remarks ?? null,
      ownerMembershipId: body.ownerMembershipId ?? null
    });
  });

  // 更新客户档案
  app.patch("/api/admin/wa/customer-contacts/:waCustomerContactId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waCustomerContactId } = req.params as { waCustomerContactId: string };
    const body = req.body as {
      displayName?: string;
      remarks?: string | null;
      ownerMembershipId?: string | null;
      customerStatus?: string;
    };
    const updated = await updateWaCustomerContact({ tenantId, waCustomerContactId, ...body });
    if (!updated) throw app.httpErrors.notFound("Customer contact not found");
    return updated;
  });

  // 归档/删除客户档案
  app.delete("/api/admin/wa/customer-contacts/:waCustomerContactId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waCustomerContactId } = req.params as { waCustomerContactId: string };
    const updated = await updateWaCustomerContact({ tenantId, waCustomerContactId, customerStatus: "archived" });
    if (!updated) throw app.httpErrors.notFound("Customer contact not found");
    return { archived: true };
  });

  // 获取某客户的 JID 绑定列表
  app.get("/api/admin/wa/customer-contacts/:waCustomerContactId/bindings", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waCustomerContactId } = req.params as { waCustomerContactId: string };
    const customer = await getCustomerContactById({ tenantId, waCustomerContactId });
    if (!customer) throw app.httpErrors.notFound("Customer contact not found");
    return listBindingsForCustomer({ tenantId, waCustomerContactId });
  });

  // 绑定 JID → 客户（可顺带新建客户档案）
  app.post("/api/admin/wa/customer-contacts/bind", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const auth = req.user as { membershipId?: string } | undefined;
    const body = req.body as {
      participantJid?: string;
      waCustomerContactId?: string | null;
      customerName?: string | null;
      ownerMembershipId?: string | null;
      bindingRemarks?: string | null;
      sourceConversationId?: string | null;
    };
    if (!body.participantJid?.trim()) throw app.httpErrors.badRequest("participantJid is required");
    if (!body.waCustomerContactId && !body.customerName?.trim()) {
      throw app.httpErrors.badRequest("waCustomerContactId or customerName is required");
    }
    return bindJidToCustomer({
      tenantId,
      membershipId: auth?.membershipId ?? "",
      participantJid: body.participantJid.trim(),
      waCustomerContactId: body.waCustomerContactId ?? null,
      customerName: body.customerName ?? null,
      ownerMembershipId: body.ownerMembershipId ?? null,
      bindingRemarks: body.bindingRemarks ?? null,
      sourceConversationId: body.sourceConversationId ?? null
    });
  });

  // 解绑 JID
  app.delete("/api/admin/wa/customer-contacts/bindings/:participantJid", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { participantJid } = req.params as { participantJid: string };
    return unbindJid({ tenantId, participantJid: decodeURIComponent(participantJid) });
  });

  // 群成员列表（含客户绑定信息，用于 WaConversationsTab 标注操作）
  app.get("/api/admin/wa/monitor/conversations/:waConversationId/members-with-bindings", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { waConversationId } = req.params as { waConversationId: string };
    return withTenantTransaction(tenantId, async (trx) =>
      getGroupMembersWithBindings(trx, { tenantId, waConversationId })
    );
  });

  // 客户维度报表（用于 WaMonitorTab "客户" tab）
  app.get("/api/admin/wa/reports/customers", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { waAccountId?: string; ownerMembershipId?: string; days?: string };
    const days = Math.max(1, Math.min(Number(query.days ?? "30"), 366));
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - days * 24 * 60 * 60 * 1000);
    return getCustomerReportStats({
      tenantId,
      waAccountId: query.waAccountId ?? null,
      ownerMembershipId: query.ownerMembershipId ?? null,
      startAt,
      endAt
    });
  });
}
