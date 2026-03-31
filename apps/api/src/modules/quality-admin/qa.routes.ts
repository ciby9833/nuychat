import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import {
  normalizeStringArray,
  parseJsonNumberMap,
  parseJsonStringArray,
  toIsoString
} from "../tenant/tenant-admin.shared.js";
import { resolveLatestCaseId } from "./quality-admin.shared.js";

export async function registerQAAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/qa/scoring-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("qa_scoring_rules")
        .where({ tenant_id: tenantId })
        .select("rule_id", "code", "name", "weight", "is_active", "sort_order", "created_at", "updated_at")
        .orderBy("sort_order", "asc") as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        ruleId: row.rule_id,
        code: row.code,
        name: row.name,
        weight: Number(row.weight),
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      }));
    });
  });

  app.put("/api/admin/qa/scoring-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      rules?: Array<{ code?: string; name?: string; weight?: number; isActive?: boolean; sortOrder?: number }>;
    };
    const rules = Array.isArray(body.rules) ? body.rules : [];
    if (rules.length === 0) throw app.httpErrors.badRequest("rules is required");

    const totalWeight = rules.reduce((sum, item) => sum + ((item.isActive ?? true) ? Math.max(0, Number(item.weight ?? 0)) : 0), 0);
    if (totalWeight !== 100) throw app.httpErrors.badRequest("Total weight of active dimensions must equal 100");

    return withTenantTransaction(tenantId, async (trx) => {
      for (const [index, item] of rules.entries()) {
        const code = item.code?.trim().toLowerCase();
        const name = item.name?.trim();
        if (!code || !name) throw app.httpErrors.badRequest("Each rule requires code and name");

        await trx("qa_scoring_rules")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            weight: Math.max(0, Math.min(100, Math.floor(Number(item.weight ?? 0)))),
            is_active: item.isActive ?? true,
            sort_order: item.sortOrder ?? (index + 1) * 10
          })
          .onConflict(["tenant_id", "code"])
          .merge({
            name,
            weight: Math.max(0, Math.min(100, Math.floor(Number(item.weight ?? 0)))),
            is_active: item.isActive ?? true,
            sort_order: item.sortOrder ?? (index + 1) * 10,
            updated_at: trx.fn.now()
          });
      }
      return { updated: true, count: rules.length };
    });
  });

  app.get("/api/admin/qa/conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { search?: string; limit?: string };
    const limit = Math.min(100, Math.max(10, Number(query.limit ?? 30)));
    const search = query.search?.trim();

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("conversation_cases as cc")
        .join("conversations as c", function () {
          this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("customers as cu", function () {
          this.on("cu.customer_id", "=", "cc.customer_id").andOn("cu.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function () {
          this.on("ap.agent_id", "=", "cc.current_owner_id").andOn("ap.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("qa_reviews as qr", function () {
          this.on("qr.case_id", "=", "cc.case_id").andOn("qr.tenant_id", "=", "cc.tenant_id");
        })
        .where("cc.tenant_id", tenantId)
        .whereIn("cc.status", ["resolved", "closed"])
        .modify((qb) => {
          if (search) {
            const like = `%${search}%`;
            qb.andWhere((scope) => {
              scope.whereILike("cu.display_name", like).orWhereILike("cu.external_ref", like).orWhereILike("c.conversation_id", like).orWhereILike("cc.case_id", like);
            });
          }
        })
        .select(
          "c.conversation_id",
          "cc.case_id",
          "cc.status",
          "c.channel_type",
          "cc.updated_at",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref",
          "ap.display_name as agent_name",
          "qr.review_id"
        )
        .orderBy("c.updated_at", "desc")
        .limit(limit);

      return rows.map((row: any) => ({
        conversationId: row.conversation_id,
        caseId: row.case_id,
        status: row.status,
        channelType: row.channel_type,
        customerName: row.customer_name,
        customerRef: row.customer_ref,
        agentName: row.agent_name,
        reviewed: Boolean(row.review_id),
        updatedAt: toIsoString(row.updated_at)
      }));
    });
  });

  app.get("/api/admin/qa/reviews", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { agentId?: string; tag?: string; minScore?: string; maxScore?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const minScore = query.minScore ? Math.max(0, Math.min(100, Number(query.minScore))) : undefined;
    const maxScore = query.maxScore ? Math.max(0, Math.min(100, Number(query.maxScore))) : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const base = trx("qa_reviews as qr")
        .leftJoin("conversation_cases as cc", function () {
          this.on("cc.case_id", "=", "qr.case_id").andOn("cc.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("conversations as c", function () {
          this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function () {
          this.on("ap.agent_id", "=", "qr.agent_id").andOn("ap.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("tenant_memberships as tm", function () {
          this.on("tm.identity_id", "=", "qr.reviewer_identity_id").andOn("tm.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("identities as i", "i.identity_id", "tm.identity_id")
        .where("qr.tenant_id", tenantId)
        .modify((qb) => {
          if (query.agentId) qb.andWhere("qr.agent_id", query.agentId);
          if (minScore !== undefined) qb.andWhere("qr.score", ">=", minScore);
          if (maxScore !== undefined) qb.andWhere("qr.score", "<=", maxScore);
          if (query.tag?.trim()) qb.andWhereRaw("qr.tags @> ?::jsonb", [JSON.stringify([query.tag.trim()])]);
        });

      const [rows, countRow] = await Promise.all([
        base.clone().select(
          "qr.review_id", "qr.conversation_id", "qr.case_id", "qr.reviewer_identity_id", "qr.agent_id", "qr.score",
          "qr.dimension_scores", "qr.tags", "qr.note", "qr.status", "qr.created_at", "qr.updated_at",
          "ap.display_name as agent_name", "i.email as reviewer_email", "c.status as conversation_status"
        ).orderBy("qr.created_at", "desc").limit(pageSize).offset((page - 1) * pageSize),
        base.clone().count<{ cnt: string }>("qr.review_id as cnt").first()
      ]);

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        items: rows.map((row: any) => ({
          reviewId: row.review_id,
          conversationId: row.conversation_id,
          caseId: row.case_id,
          reviewerIdentityId: row.reviewer_identity_id,
          reviewerEmail: row.reviewer_email,
          agentId: row.agent_id,
          agentName: row.agent_name,
          conversationStatus: row.conversation_status,
          score: Number(row.score),
          dimensionScores: parseJsonNumberMap(row.dimension_scores),
          tags: parseJsonStringArray(row.tags),
          note: row.note,
          status: row.status,
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        }))
      };
    });
  });

  app.post("/api/admin/qa/reviews", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const reviewerIdentityId = req.auth?.sub;
    if (!tenantId || !reviewerIdentityId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      conversationId?: string;
      score?: number;
      dimensionScores?: Record<string, number>;
      tags?: string[];
      note?: string;
      status?: "draft" | "published";
    };

    const conversationId = body.conversationId?.trim();
    if (!conversationId) throw app.httpErrors.badRequest("conversationId is required");
    const score = Math.max(0, Math.min(100, Math.floor(Number(body.score ?? 0))));

    return withTenantTransaction(tenantId, async (trx) => {
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("conversation_id", "status", "assigned_agent_id", "current_case_id")
        .first<{ conversation_id: string; status: string; assigned_agent_id: string | null; current_case_id: string | null }>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");
      if (!["resolved", "closed"].includes(conversation.status)) throw app.httpErrors.badRequest("Only resolved/closed conversation can be reviewed");
      const caseId = conversation.current_case_id ?? await resolveLatestCaseId(trx, tenantId, conversationId);
      if (!caseId) throw app.httpErrors.badRequest("Conversation has no case to review");

      const [row] = await trx("qa_reviews")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          case_id: caseId,
          reviewer_identity_id: reviewerIdentityId,
          agent_id: conversation.assigned_agent_id ?? null,
          score,
          dimension_scores: body.dimensionScores ?? {},
          tags: JSON.stringify(normalizeStringArray(body.tags ?? [])),
          note: body.note?.trim() || null,
          status: body.status === "draft" ? "draft" : "published"
        })
        .onConflict(["tenant_id", "case_id"])
        .merge({
          conversation_id: conversationId,
          case_id: caseId,
          reviewer_identity_id: reviewerIdentityId,
          agent_id: conversation.assigned_agent_id ?? null,
          score,
          dimension_scores: body.dimensionScores ?? {},
          tags: JSON.stringify(normalizeStringArray(body.tags ?? [])),
          note: body.note?.trim() || null,
          status: body.status === "draft" ? "draft" : "published",
          updated_at: trx.fn.now()
        })
        .returning([
          "review_id", "conversation_id", "case_id", "reviewer_identity_id", "agent_id", "score",
          "dimension_scores", "tags", "note", "status", "created_at", "updated_at"
        ]);

      return {
        reviewId: row.review_id,
        conversationId: row.conversation_id,
        caseId: row.case_id,
        reviewerIdentityId: row.reviewer_identity_id,
        agentId: row.agent_id,
        score: Number(row.score),
        dimensionScores: parseJsonNumberMap(row.dimension_scores),
        tags: parseJsonStringArray(row.tags),
        note: row.note,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.patch("/api/admin/qa/reviews/:reviewId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { reviewId } = req.params as { reviewId: string };
    const body = req.body as { score?: number; dimensionScores?: Record<string, number>; tags?: string[]; note?: string; status?: "draft" | "published" };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.score !== undefined) updates.score = Math.max(0, Math.min(100, Math.floor(Number(body.score))));
      if (body.dimensionScores !== undefined) updates.dimension_scores = body.dimensionScores;
      if (body.tags !== undefined) updates.tags = JSON.stringify(normalizeStringArray(body.tags));
      if (body.note !== undefined) updates.note = body.note.trim() || null;
      if (body.status !== undefined) updates.status = body.status;

      const [row] = await trx("qa_reviews")
        .where({ tenant_id: tenantId, review_id: reviewId })
        .update(updates)
        .returning([
          "review_id", "conversation_id", "case_id", "reviewer_identity_id", "agent_id", "score",
          "dimension_scores", "tags", "note", "status", "created_at", "updated_at"
        ]);
      if (!row) throw app.httpErrors.notFound("QA review not found");

      return {
        reviewId: row.review_id,
        conversationId: row.conversation_id,
        caseId: row.case_id,
        reviewerIdentityId: row.reviewer_identity_id,
        agentId: row.agent_id,
        score: Number(row.score),
        dimensionScores: parseJsonNumberMap(row.dimension_scores),
        tags: parseJsonStringArray(row.tags),
        note: row.note,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });
}
