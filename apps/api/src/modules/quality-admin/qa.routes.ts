import type { FastifyInstance } from "fastify";

import {
  getActiveQaGuideline,
  getQaCaseDetail,
  getQaDashboard,
  listQaTasks,
  saveQaManualReview,
  upsertActiveQaGuideline
} from "./qa-v2.service.js";

export async function registerQAAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/qa/dashboard", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      dateFrom?: string;
      dateTo?: string;
      agentIds?: string;
    };
    return getQaDashboard(tenantId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      agentIds: query.agentIds?.split(",").map((item) => item.trim()).filter(Boolean)
    });
  });

  app.get("/api/admin/qa/guideline", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return getActiveQaGuideline(tenantId);
  });

  app.put("/api/admin/qa/guideline", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as { name?: string | null; contentMd?: string | null };
    const contentMd = body.contentMd?.trim();
    if (!contentMd) throw app.httpErrors.badRequest("contentMd is required");

    return upsertActiveQaGuideline(tenantId, {
      name: body.name ?? null,
      contentMd
    });
  });

  app.get("/api/admin/qa/tasks", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      queueType?: string;
      status?: string;
      search?: string;
      limit?: string;
      dateFrom?: string;
      dateTo?: string;
      agentIds?: string;
    };

    return {
      items: await listQaTasks(tenantId, {
        queueType: query.queueType,
        status: query.status,
        search: query.search,
        limit: query.limit ? Number(query.limit) : undefined,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        agentIds: query.agentIds?.split(",").map((item) => item.trim()).filter(Boolean)
      })
    };
  });

  app.get("/api/admin/qa/cases/:caseId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { caseId } = req.params as { caseId: string };

    const detail = await getQaCaseDetail(tenantId, caseId);
    if (!detail) throw app.httpErrors.notFound("QA case not found");
    return detail;
  });

  app.post("/api/admin/qa/cases/:caseId/review", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const reviewerIdentityId = req.auth?.sub;
    if (!tenantId || !reviewerIdentityId) throw app.httpErrors.badRequest("Missing tenant context");

    const { caseId } = req.params as { caseId: string };
    const body = req.body as {
      action?: "confirm" | "modify" | "reject";
      totalScore?: number;
      verdict?: string;
      tags?: string[];
      summary?: string | null;
      segmentReviews?: Array<{
        segmentId?: string;
        score?: number;
        tags?: string[];
        comment?: string | null;
        dimensionScores?: Record<string, number>;
      }>;
    };

    const action = body.action;
    if (action !== "confirm" && action !== "modify" && action !== "reject") {
      throw app.httpErrors.badRequest("action must be confirm, modify or reject");
    }

    return saveQaManualReview(tenantId, caseId, reviewerIdentityId, {
      action,
      totalScore: body.totalScore,
      verdict: body.verdict,
      tags: Array.isArray(body.tags) ? body.tags : [],
      summary: body.summary ?? null,
      segmentReviews: Array.isArray(body.segmentReviews)
        ? body.segmentReviews
            .filter((item): item is {
              segmentId: string;
              score: number;
              tags?: string[];
              comment?: string | null;
              dimensionScores?: Record<string, number>;
            } => typeof item?.segmentId === "string" && typeof item?.score === "number")
            .map((item) => ({
              segmentId: item.segmentId,
              score: item.score,
              tags: item.tags,
              comment: item.comment ?? null,
              dimensionScores: item.dimensionScores
            }))
        : []
    });
  });
}
