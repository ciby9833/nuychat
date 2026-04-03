import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { isDateString, parseJsonObject, toIsoString } from "../tenant/tenant-admin.shared.js";
import { DEFAULT_SLA_CONFIG, readSlaDefaultConfig, upsertSlaDefaultConfig } from "./sla-default-config.shared.js";

export async function registerSLAAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/sla/default-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => readSlaDefaultConfig(trx, tenantId));
  });

  app.put("/api/admin/sla/default-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      firstResponseTargetSec?: number;
      assignmentAcceptTargetSec?: number | null;
      subsequentResponseTargetSec?: number | null;
      subsequentResponseReassignWhen?: "always" | "owner_unavailable";
      followUpTargetSec?: number | null;
      firstResponseAction?: "alert" | "escalate";
      assignmentAcceptAction?: "alert" | "escalate" | "reassign";
      followUpAction?: "alert" | "escalate" | "reassign" | "close_case";
      followUpCloseMode?: "semantic" | "waiting_customer" | null;
    };

    const firstResponseTargetSec = Number(body.firstResponseTargetSec ?? DEFAULT_SLA_CONFIG.firstResponseTargetSec);
    const assignmentAcceptTargetSec =
      body.assignmentAcceptTargetSec === null || body.assignmentAcceptTargetSec === undefined
        ? null
        : Number(body.assignmentAcceptTargetSec);
    const subsequentResponseTargetSec =
      body.subsequentResponseTargetSec === null || body.subsequentResponseTargetSec === undefined
        ? null
        : Number(body.subsequentResponseTargetSec);
    const followUpTargetSec =
      body.followUpTargetSec === null || body.followUpTargetSec === undefined
        ? null
        : Number(body.followUpTargetSec);

    if (
      firstResponseTargetSec <= 0 ||
      (assignmentAcceptTargetSec !== null && assignmentAcceptTargetSec <= 0) ||
      (subsequentResponseTargetSec !== null && subsequentResponseTargetSec <= 0) ||
      (followUpTargetSec !== null && followUpTargetSec <= 0)
    ) {
      throw app.httpErrors.badRequest("SLA targets must be positive numbers");
    }

    const firstResponseAction = body.firstResponseAction ?? DEFAULT_SLA_CONFIG.firstResponseAction;
    const assignmentAcceptAction = body.assignmentAcceptAction ?? DEFAULT_SLA_CONFIG.assignmentAcceptAction;
    const subsequentResponseReassignWhen = body.subsequentResponseReassignWhen ?? DEFAULT_SLA_CONFIG.subsequentResponseReassignWhen;
    const followUpAction = body.followUpAction ?? DEFAULT_SLA_CONFIG.followUpAction;
    const followUpCloseMode =
      followUpAction === "close_case"
        ? (body.followUpCloseMode ?? DEFAULT_SLA_CONFIG.followUpCloseMode)
        : null;

    if (!["alert", "escalate"].includes(firstResponseAction)) {
      throw app.httpErrors.badRequest("Invalid firstResponseAction");
    }
    if (!["alert", "escalate", "reassign"].includes(assignmentAcceptAction)) {
      throw app.httpErrors.badRequest("Invalid assignmentAcceptAction");
    }
    if (!["always", "owner_unavailable"].includes(subsequentResponseReassignWhen)) {
      throw app.httpErrors.badRequest("Invalid subsequentResponseReassignWhen");
    }
    if (!["alert", "escalate", "reassign", "close_case"].includes(followUpAction)) {
      throw app.httpErrors.badRequest("Invalid followUpAction");
    }
    if (followUpCloseMode !== null && !["semantic", "waiting_customer"].includes(followUpCloseMode)) {
      throw app.httpErrors.badRequest("Invalid followUpCloseMode");
    }

    return withTenantTransaction(tenantId, async (trx) =>
      upsertSlaDefaultConfig(trx, tenantId, {
        firstResponseTargetSec: Math.floor(firstResponseTargetSec),
        assignmentAcceptTargetSec: assignmentAcceptTargetSec === null ? null : Math.floor(assignmentAcceptTargetSec),
        subsequentResponseTargetSec: subsequentResponseTargetSec === null ? null : Math.floor(subsequentResponseTargetSec),
        subsequentResponseReassignWhen,
        followUpTargetSec: followUpTargetSec === null ? null : Math.floor(followUpTargetSec),
        firstResponseAction,
        assignmentAcceptAction,
        followUpAction,
        followUpCloseMode
      })
    );
  });

  app.get("/api/admin/sla-breaches", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      status?: "open" | "acknowledged" | "resolved";
      metric?: string;
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
      const listQuery = trx("sla_breaches as b")
        .leftJoin("agent_profiles as ap", function () {
          this.on("ap.agent_id", "=", "b.agent_id").andOn("ap.tenant_id", "=", "b.tenant_id");
        })
        .where("b.tenant_id", tenantId)
        .modify((qb) => {
          if (query.status) qb.andWhere("b.status", query.status);
          if (query.metric) qb.andWhere("b.metric", query.metric);
          if (from) qb.andWhereRaw("b.created_at::date >= ?", [from]);
          if (to) qb.andWhereRaw("b.created_at::date <= ?", [to]);
        });

      const [rows, countRow, summaryRows] = await Promise.all([
        listQuery.clone().select(
          "b.breach_id", "b.definition_id", "b.trigger_policy_id", "b.conversation_id", "b.case_id", "b.agent_id",
          "b.metric", "b.target_sec", "b.actual_sec", "b.breach_sec", "b.severity", "b.status",
          "b.acknowledged_at", "b.resolved_at", "b.details", "b.created_at", "b.updated_at",
          "ap.display_name as agent_name"
        ).orderBy("b.created_at", "desc").limit(pageSize).offset((page - 1) * pageSize),
        listQuery.clone().count<{ cnt: string }>("b.breach_id as cnt").first(),
        listQuery.clone().select("b.status").avg<{ avg_breach_sec: string }>("b.breach_sec as avg_breach_sec").count<{ cnt: string }>("b.breach_id as cnt").groupBy("b.status")
      ]) as unknown as [Array<Record<string, unknown>>, { cnt?: string } | undefined, Array<Record<string, unknown>>];

      const summary = { total: Number(countRow?.cnt ?? 0), open: 0, acknowledged: 0, resolved: 0, avgBreachSec: 0 };
      let weightedAvgNumerator = 0;
      let weightedAvgDenominator = 0;
      for (const row of summaryRows) {
        const status = String(row.status);
        const cnt = Number((row as { cnt?: string }).cnt ?? 0);
        const avg = Number((row as { avg_breach_sec?: string }).avg_breach_sec ?? 0);
        if (status === "open") summary.open = cnt;
        else if (status === "acknowledged") summary.acknowledged = cnt;
        else if (status === "resolved") summary.resolved = cnt;
        weightedAvgNumerator += avg * cnt;
        weightedAvgDenominator += cnt;
      }
      summary.avgBreachSec = weightedAvgDenominator > 0 ? Math.round(weightedAvgNumerator / weightedAvgDenominator) : 0;

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        summary,
        items: rows.map((row) => ({
          breachId: row.breach_id,
          definitionId: row.definition_id,
          definitionName: null,
          triggerPolicyId: row.trigger_policy_id,
          triggerPolicyName: null,
          conversationId: row.conversation_id,
          caseId: row.case_id,
          agentId: row.agent_id,
          agentName: row.agent_name,
          metric: row.metric,
          targetSec: Number(row.target_sec),
          actualSec: Number(row.actual_sec),
          breachSec: Number(row.breach_sec),
          severity: row.severity,
          status: row.status,
          acknowledgedAt: row.acknowledged_at ? toIsoString(row.acknowledged_at) : null,
          resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
          details: parseJsonObject(row.details),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        }))
      };
    });
  });

  app.patch("/api/admin/sla-breaches/:breachId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { breachId } = req.params as { breachId: string };
    const body = req.body as { status?: "open" | "acknowledged" | "resolved" };
    if (!body.status || !["open", "acknowledged", "resolved"].includes(body.status)) {
      throw app.httpErrors.badRequest("status must be one of open|acknowledged|resolved");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { status: body.status, updated_at: trx.fn.now() };
      if (body.status === "acknowledged") updates.acknowledged_at = trx.fn.now();
      else if (body.status === "resolved") {
        updates.acknowledged_at = trx.fn.now();
        updates.resolved_at = trx.fn.now();
      }

      const [row] = await trx("sla_breaches")
        .where({ tenant_id: tenantId, breach_id: breachId })
        .update(updates)
        .returning(["breach_id", "status", "acknowledged_at", "resolved_at", "updated_at"]);
      if (!row) throw app.httpErrors.notFound("SLA breach not found");

      return {
        breachId: row.breach_id,
        status: row.status,
        acknowledgedAt: row.acknowledged_at ? toIsoString(row.acknowledged_at) : null,
        resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });
}
