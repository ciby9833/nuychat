import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { runMemoryEvaluation, type MemoryEvalDatasetRow } from "../memory/memory-eval.service.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { parseJsonObject, toIsoString } from "../tenant/tenant-admin.shared.js";

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function memoryAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/memory/encoder-traces", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as {
      conversationId?: string;
      customerId?: string;
      sourceKind?: string;
      status?: string;
      limit?: string;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("memory_encoder_traces")
        .where({ tenant_id: tenantId })
        .modify((qb) => {
          if (query.conversationId?.trim()) qb.andWhere("conversation_id", query.conversationId.trim());
          if (query.customerId?.trim()) qb.andWhere("customer_id", query.customerId.trim());
          if (query.sourceKind?.trim()) qb.andWhere("source_kind", query.sourceKind.trim());
          if (query.status?.trim()) qb.andWhere("status", query.status.trim());
        })
        .select("trace_id", "customer_id", "conversation_id", "case_id", "task_id", "source_kind", "status", "metrics", "created_at")
        .orderBy("created_at", "desc")
        .limit(Math.max(1, Math.min(Number(query.limit ?? 50), 200)));

      const summary = await trx("memory_encoder_traces")
        .where({ tenant_id: tenantId })
        .where("created_at", ">=", trx.raw("now() - interval '7 days'"))
        .count<{ cnt: string }>("trace_id as cnt")
        .first();

      return {
        summary: { recent7dCount: Number(summary?.cnt ?? 0) },
        items: rows.map((row) => ({
          traceId: row.trace_id,
          customerId: row.customer_id,
          conversationId: row.conversation_id,
          caseId: row.case_id,
          taskId: row.task_id,
          sourceKind: row.source_kind,
          status: row.status,
          metrics: parseJsonObject(row.metrics),
          createdAt: toIsoString(row.created_at)
        }))
      };
    });
  });

  app.get("/api/admin/memory/encoder-traces/:traceId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { traceId } = req.params as { traceId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("memory_encoder_traces").where({ tenant_id: tenantId, trace_id: traceId }).first();
      if (!row) throw app.httpErrors.notFound("Memory encoder trace not found");

      return {
        traceId: row.trace_id,
        customerId: row.customer_id,
        conversationId: row.conversation_id,
        caseId: row.case_id,
        taskId: row.task_id,
        sourceKind: row.source_kind,
        status: row.status,
        inputContext: parseJsonObject(row.input_context),
        eventFrame: parseJsonObject(row.event_frame),
        candidateItems: parseJsonArray<Record<string, unknown>>(row.candidate_items),
        reviewedItems: parseJsonArray<Record<string, unknown>>(row.reviewed_items),
        finalItems: parseJsonArray<Record<string, unknown>>(row.final_items),
        metrics: parseJsonObject(row.metrics),
        createdAt: toIsoString(row.created_at)
      };
    });
  });

  app.get("/api/admin/memory/eval-datasets", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("memory_eval_datasets")
        .where({ tenant_id: tenantId })
        .select("dataset_id", "name", "description", "sample_count", "created_at", "updated_at")
        .orderBy("created_at", "desc");

      return {
        items: rows.map((row) => ({
          datasetId: row.dataset_id,
          name: row.name,
          description: row.description ?? null,
          sampleCount: Number(row.sample_count ?? 0),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        }))
      };
    });
  });

  app.post("/api/admin/memory/eval-datasets", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { name?: string; description?: string | null; rows?: MemoryEvalDatasetRow[] };
    const name = body.name?.trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!name) throw app.httpErrors.badRequest("name is required");
    if (rows.length === 0) throw app.httpErrors.badRequest("rows is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const [row] = await trx("memory_eval_datasets")
        .insert({
          tenant_id: tenantId,
          name,
          description: body.description?.trim() || null,
          sample_count: rows.length,
          dataset_payload: JSON.stringify(rows)
        })
        .returning(["dataset_id", "name", "description", "sample_count", "created_at", "updated_at"]);

      return {
        datasetId: row.dataset_id,
        name: row.name,
        description: row.description ?? null,
        sampleCount: Number(row.sample_count ?? 0),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.get("/api/admin/memory/eval-reports", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("memory_eval_reports as r")
        .leftJoin("memory_eval_datasets as d", function joinDataset() {
          this.on("d.dataset_id", "=", "r.dataset_id").andOn("d.tenant_id", "=", "r.tenant_id");
        })
        .where("r.tenant_id", tenantId)
        .select("r.report_id", "r.dataset_id", "d.name as dataset_name", "r.name", "r.status", "r.sample_count", "r.metrics", "r.created_at")
        .orderBy("r.created_at", "desc");

      return {
        items: rows.map((row) => ({
          reportId: row.report_id,
          datasetId: row.dataset_id,
          datasetName: row.dataset_name ?? null,
          name: row.name,
          status: row.status,
          sampleCount: Number(row.sample_count ?? 0),
          metrics: parseJsonObject(row.metrics),
          createdAt: toIsoString(row.created_at)
        }))
      };
    });
  });

  app.get("/api/admin/memory/eval-reports/:reportId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { reportId } = req.params as { reportId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("memory_eval_reports").where({ tenant_id: tenantId, report_id: reportId }).first();
      if (!row) throw app.httpErrors.notFound("Memory eval report not found");
      return {
        reportId: row.report_id,
        datasetId: row.dataset_id,
        name: row.name,
        status: row.status,
        sampleCount: Number(row.sample_count ?? 0),
        metrics: parseJsonObject(row.metrics),
        report: parseJsonObject(row.report_payload),
        createdAt: toIsoString(row.created_at)
      };
    });
  });

  app.post("/api/admin/memory/eval-datasets/:datasetId/run", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { datasetId } = req.params as { datasetId: string };
    const body = req.body as { name?: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const datasetRow = await trx("memory_eval_datasets").where({ tenant_id: tenantId, dataset_id: datasetId }).first();
      if (!datasetRow) throw app.httpErrors.notFound("Memory eval dataset not found");

      const dataset = parseJsonArray<MemoryEvalDatasetRow>(datasetRow.dataset_payload);
      if (dataset.length === 0) throw app.httpErrors.badRequest("Dataset is empty");

      const report = await runMemoryEvaluation(trx, tenantId, dataset);

      const [created] = await trx("memory_eval_reports")
        .insert({
          tenant_id: tenantId,
          dataset_id: datasetId,
          name: body.name?.trim() || `${datasetRow.name} report`,
          status: "completed",
          sample_count: dataset.length,
          metrics: JSON.stringify(report.metrics),
          report_payload: JSON.stringify(report)
        })
        .returning(["report_id", "name", "status", "sample_count", "metrics", "created_at"]);

      return {
        reportId: created.report_id,
        name: created.name,
        status: created.status,
        sampleCount: Number(created.sample_count ?? 0),
        metrics: parseJsonObject(created.metrics),
        createdAt: toIsoString(created.created_at)
      };
    });
  });
}
