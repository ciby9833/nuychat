import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { isDateString, toIsoString } from "../tenant/tenant-admin.shared.js";

export async function registerCSATAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/csat/surveys", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      status?: "scheduled" | "sent" | "responded" | "expired" | "failed";
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const from = isDateString(query.from) ? query.from : undefined;
    const to = isDateString(query.to) ? query.to : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const base = trx("csat_surveys as s")
        .leftJoin("customers as cu", function () {
          this.on("cu.customer_id", "=", "s.customer_id").andOn("cu.tenant_id", "=", "s.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function () {
          this.on("ap.agent_id", "=", "s.agent_id").andOn("ap.tenant_id", "=", "s.tenant_id");
        })
        .where("s.tenant_id", tenantId)
        .modify((qb) => {
          if (query.status) qb.andWhere("s.status", query.status);
          if (from) qb.andWhereRaw("s.scheduled_at::date >= ?", [from]);
          if (to) qb.andWhereRaw("s.scheduled_at::date <= ?", [to]);
        });

      const [rows, countRow, statusRows] = await Promise.all([
        base.clone().select(
          "s.survey_id", "s.conversation_id", "s.case_id", "s.customer_id", "s.agent_id", "s.channel_type",
          "s.channel_id", "s.status", "s.scheduled_at", "s.sent_at", "s.expires_at", "s.created_at", "s.updated_at",
          "cu.display_name as customer_name", "cu.external_ref as customer_ref", "ap.display_name as agent_name"
        ).orderBy("s.scheduled_at", "desc").limit(pageSize).offset((page - 1) * pageSize),
        base.clone().count<{ cnt: string }>("s.survey_id as cnt").first(),
        base.clone().select("s.status").count<{ cnt: string }>("s.survey_id as cnt").groupBy("s.status")
      ]) as unknown as [Array<Record<string, unknown>>, { cnt?: string } | undefined, Array<Record<string, unknown>>];

      const summary = { total: Number(countRow?.cnt ?? 0), scheduled: 0, sent: 0, responded: 0, expired: 0, failed: 0 };
      for (const row of statusRows) {
        const key = String(row.status) as keyof typeof summary;
        if (key in summary) summary[key] = Number((row as { cnt?: string }).cnt ?? 0);
      }

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        summary,
        items: rows.map((row) => ({
          surveyId: row.survey_id,
          conversationId: row.conversation_id,
          caseId: row.case_id,
          customerId: row.customer_id,
          customerName: row.customer_name,
          customerRef: row.customer_ref,
          agentId: row.agent_id,
          agentName: row.agent_name,
          channelType: row.channel_type,
          channelId: row.channel_id,
          status: row.status,
          scheduledAt: toIsoString(row.scheduled_at),
          sentAt: row.sent_at ? toIsoString(row.sent_at) : null,
          expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        }))
      };
    });
  });

  app.patch("/api/admin/csat/surveys/:surveyId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { surveyId } = req.params as { surveyId: string };
    const body = req.body as { status?: "scheduled" | "sent" | "responded" | "expired" | "failed" };
    if (!body.status) throw app.httpErrors.badRequest("status is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { status: body.status, updated_at: trx.fn.now() };
      if (body.status === "sent") updates.sent_at = trx.fn.now();
      const [row] = await trx("csat_surveys")
        .where({ tenant_id: tenantId, survey_id: surveyId })
        .update(updates)
        .returning(["survey_id", "status", "sent_at", "updated_at"]);
      if (!row) throw app.httpErrors.notFound("CSAT survey not found");
      return {
        surveyId: row.survey_id,
        status: row.status,
        sentAt: row.sent_at ? toIsoString(row.sent_at) : null,
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.get("/api/admin/csat/responses", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      agentId?: string;
      minRating?: string;
      maxRating?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const minRating = query.minRating ? Math.max(1, Math.min(5, Number(query.minRating))) : undefined;
    const maxRating = query.maxRating ? Math.max(1, Math.min(5, Number(query.maxRating))) : undefined;
    const from = isDateString(query.from) ? query.from : undefined;
    const to = isDateString(query.to) ? query.to : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const base = trx("csat_responses as r")
        .leftJoin("customers as cu", function () {
          this.on("cu.customer_id", "=", "r.customer_id").andOn("cu.tenant_id", "=", "r.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function () {
          this.on("ap.agent_id", "=", "r.agent_id").andOn("ap.tenant_id", "=", "r.tenant_id");
        })
        .where("r.tenant_id", tenantId)
        .modify((qb) => {
          if (query.agentId) qb.andWhere("r.agent_id", query.agentId);
          if (minRating !== undefined) qb.andWhere("r.rating", ">=", minRating);
          if (maxRating !== undefined) qb.andWhere("r.rating", "<=", maxRating);
          if (from) qb.andWhereRaw("r.responded_at::date >= ?", [from]);
          if (to) qb.andWhereRaw("r.responded_at::date <= ?", [to]);
        });

      const [rows, countRow, avgRow] = await Promise.all([
        base.clone().select(
          "r.response_id", "r.survey_id", "r.conversation_id", "r.case_id", "r.customer_id", "r.agent_id",
          "r.rating", "r.feedback", "r.source", "r.responded_at", "r.created_at", "r.updated_at",
          "cu.display_name as customer_name", "cu.external_ref as customer_ref", "ap.display_name as agent_name"
        ).orderBy("r.responded_at", "desc").limit(pageSize).offset((page - 1) * pageSize),
        base.clone().count<{ cnt: string }>("r.response_id as cnt").first(),
        base.clone().avg<{ avg_rating: string }>("r.rating as avg_rating").first()
      ]) as [Array<Record<string, unknown>>, { cnt?: string } | undefined, { avg_rating?: string } | undefined];

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        summary: {
          total: Number(countRow?.cnt ?? 0),
          averageRating: Number(avgRow?.avg_rating ?? 0)
        },
        items: rows.map((row) => ({
          responseId: row.response_id,
          surveyId: row.survey_id,
          conversationId: row.conversation_id,
          caseId: row.case_id,
          customerId: row.customer_id,
          customerName: row.customer_name,
          customerRef: row.customer_ref,
          agentId: row.agent_id,
          agentName: row.agent_name,
          rating: Number(row.rating),
          feedback: row.feedback,
          source: row.source,
          respondedAt: toIsoString(row.responded_at),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        }))
      };
    });
  });
}
