import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { isDateString, isUniqueViolation, parseJsonObject, toIsoString } from "../tenant/tenant-admin.shared.js";
import { normalizeTriggerActionsBody, serializeTriggerPolicyRow } from "./quality-admin.shared.js";

export async function registerSLAAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/sla-definitions", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { active?: string; priority?: string };
    const active = query.active === "true" ? true : query.active === "false" ? false : undefined;
    const priority = query.priority?.trim();

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("sla_definitions")
        .where({ tenant_id: tenantId })
        .modify((qb) => {
          if (active !== undefined) qb.andWhere("is_active", active);
          if (priority) qb.andWhere("priority", priority);
        })
        .select(
          "definition_id",
          "name",
          "priority",
          "first_response_target_sec",
          "assignment_accept_target_sec",
          "follow_up_target_sec",
          "resolution_target_sec",
          "conditions",
          "is_active",
          "created_at",
          "updated_at"
        )
        .orderBy("priority", "asc")
        .orderBy("name", "asc") as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        definitionId: row.definition_id,
        name: row.name,
        priority: row.priority,
        firstResponseTargetSec: Number(row.first_response_target_sec),
        assignmentAcceptTargetSec: row.assignment_accept_target_sec === null ? null : Number(row.assignment_accept_target_sec),
        followUpTargetSec: row.follow_up_target_sec === null ? null : Number(row.follow_up_target_sec),
        resolutionTargetSec: Number(row.resolution_target_sec),
        conditions: parseJsonObject(row.conditions),
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      }));
    });
  });

  app.post("/api/admin/sla-definitions", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      name?: string;
      priority?: string;
      firstResponseTargetSec?: number;
      assignmentAcceptTargetSec?: number | null;
      followUpTargetSec?: number | null;
      resolutionTargetSec?: number;
      isActive?: boolean;
      conditions?: Record<string, unknown>;
    };

    const name = body.name?.trim();
    if (!name) throw app.httpErrors.badRequest("name is required");
    const firstResponseTargetSec = Number(body.firstResponseTargetSec ?? 300);
    const assignmentAcceptTargetSec = body.assignmentAcceptTargetSec === null || body.assignmentAcceptTargetSec === undefined ? null : Number(body.assignmentAcceptTargetSec);
    const followUpTargetSec = body.followUpTargetSec === null || body.followUpTargetSec === undefined ? null : Number(body.followUpTargetSec);
    const resolutionTargetSec = Number(body.resolutionTargetSec ?? 7200);
    if (
      firstResponseTargetSec <= 0 ||
      resolutionTargetSec <= 0 ||
      (assignmentAcceptTargetSec !== null && assignmentAcceptTargetSec <= 0) ||
      (followUpTargetSec !== null && followUpTargetSec <= 0)
    ) {
      throw app.httpErrors.badRequest("SLA targets must be positive numbers");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("sla_definitions")
          .insert({
            tenant_id: tenantId,
            name,
            priority: body.priority?.trim() || "standard",
            first_response_target_sec: Math.floor(firstResponseTargetSec),
            assignment_accept_target_sec: assignmentAcceptTargetSec === null ? null : Math.floor(assignmentAcceptTargetSec),
            follow_up_target_sec: followUpTargetSec === null ? null : Math.floor(followUpTargetSec),
            resolution_target_sec: Math.floor(resolutionTargetSec),
            conditions: body.conditions ?? {},
            is_active: body.isActive ?? true
          })
          .returning([
            "definition_id",
            "name",
            "priority",
            "first_response_target_sec",
            "assignment_accept_target_sec",
            "follow_up_target_sec",
            "resolution_target_sec",
            "conditions",
            "is_active",
            "created_at",
            "updated_at"
          ]);

        return {
          definitionId: row.definition_id,
          name: row.name,
          priority: row.priority,
          firstResponseTargetSec: Number(row.first_response_target_sec),
          assignmentAcceptTargetSec: row.assignment_accept_target_sec === null ? null : Number(row.assignment_accept_target_sec),
          followUpTargetSec: row.follow_up_target_sec === null ? null : Number(row.follow_up_target_sec),
          resolutionTargetSec: Number(row.resolution_target_sec),
          conditions: parseJsonObject(row.conditions),
          isActive: Boolean(row.is_active),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("SLA definition name already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/sla-definitions/:definitionId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { definitionId } = req.params as { definitionId: string };
    const body = req.body as {
      name?: string;
      priority?: string;
      firstResponseTargetSec?: number;
      assignmentAcceptTargetSec?: number | null;
      followUpTargetSec?: number | null;
      resolutionTargetSec?: number;
      isActive?: boolean;
      conditions?: Record<string, unknown>;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.priority !== undefined) updates.priority = body.priority.trim() || "standard";
      if (body.firstResponseTargetSec !== undefined) updates.first_response_target_sec = Math.max(1, Math.floor(body.firstResponseTargetSec));
      if (body.assignmentAcceptTargetSec !== undefined) updates.assignment_accept_target_sec = body.assignmentAcceptTargetSec === null ? null : Math.max(1, Math.floor(body.assignmentAcceptTargetSec));
      if (body.followUpTargetSec !== undefined) updates.follow_up_target_sec = body.followUpTargetSec === null ? null : Math.max(1, Math.floor(body.followUpTargetSec));
      if (body.resolutionTargetSec !== undefined) updates.resolution_target_sec = Math.max(1, Math.floor(body.resolutionTargetSec));
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);
      if (body.conditions !== undefined) updates.conditions = body.conditions;

      const [row] = await trx("sla_definitions")
        .where({ tenant_id: tenantId, definition_id: definitionId })
        .update(updates)
        .returning([
          "definition_id",
          "name",
          "priority",
          "first_response_target_sec",
          "assignment_accept_target_sec",
          "follow_up_target_sec",
          "resolution_target_sec",
          "conditions",
          "is_active",
          "created_at",
          "updated_at"
        ]);
      if (!row) throw app.httpErrors.notFound("SLA definition not found");

      return {
        definitionId: row.definition_id,
        name: row.name,
        priority: row.priority,
        firstResponseTargetSec: Number(row.first_response_target_sec),
        assignmentAcceptTargetSec: row.assignment_accept_target_sec === null ? null : Number(row.assignment_accept_target_sec),
        followUpTargetSec: row.follow_up_target_sec === null ? null : Number(row.follow_up_target_sec),
        resolutionTargetSec: Number(row.resolution_target_sec),
        conditions: parseJsonObject(row.conditions),
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.get("/api/admin/sla-trigger-policies", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { active?: string; priority?: string };
    const active = query.active === "true" ? true : query.active === "false" ? false : undefined;
    const priority = query.priority?.trim();

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("sla_trigger_policies")
        .where({ tenant_id: tenantId })
        .modify((qb) => {
          if (active !== undefined) qb.andWhere("is_active", active);
          if (priority) qb.andWhere("priority", priority);
        })
        .select(
          "trigger_policy_id",
          "name",
          "priority",
          "first_response_actions",
          "assignment_accept_actions",
          "follow_up_actions",
          "resolution_actions",
          "conditions",
          "is_active",
          "created_at",
          "updated_at"
        )
        .orderBy("priority", "asc")
        .orderBy("name", "asc") as Array<Record<string, unknown>>;

      return rows.map(serializeTriggerPolicyRow);
    });
  });

  app.post("/api/admin/sla-trigger-policies", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      name?: string;
      priority?: string;
      firstResponseActions?: unknown;
      assignmentAcceptActions?: unknown;
      followUpActions?: unknown;
      resolutionActions?: unknown;
      isActive?: boolean;
      conditions?: Record<string, unknown>;
    };
    const name = body.name?.trim();
    if (!name) throw app.httpErrors.badRequest("name is required");

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("sla_trigger_policies")
          .insert({
            tenant_id: tenantId,
            name,
            priority: body.priority?.trim() || "standard",
            first_response_actions: JSON.stringify(normalizeTriggerActionsBody(body.firstResponseActions, "first_response")),
            assignment_accept_actions: JSON.stringify(normalizeTriggerActionsBody(body.assignmentAcceptActions, "assignment_accept")),
            follow_up_actions: JSON.stringify(normalizeTriggerActionsBody(body.followUpActions, "follow_up")),
            resolution_actions: JSON.stringify(normalizeTriggerActionsBody(body.resolutionActions, "resolution")),
            conditions: JSON.stringify(body.conditions ?? {}),
            is_active: body.isActive ?? true
          })
          .returning([
            "trigger_policy_id",
            "name",
            "priority",
            "first_response_actions",
            "assignment_accept_actions",
            "follow_up_actions",
            "resolution_actions",
            "conditions",
            "is_active",
            "created_at",
            "updated_at"
          ]);
        return serializeTriggerPolicyRow(row as Record<string, unknown>);
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Trigger policy name already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/sla-trigger-policies/:triggerPolicyId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { triggerPolicyId } = req.params as { triggerPolicyId: string };
    const body = req.body as {
      name?: string;
      priority?: string;
      firstResponseActions?: unknown;
      assignmentAcceptActions?: unknown;
      followUpActions?: unknown;
      resolutionActions?: unknown;
      isActive?: boolean;
      conditions?: Record<string, unknown>;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.priority !== undefined) updates.priority = body.priority.trim() || "standard";
      if (body.firstResponseActions !== undefined) updates.first_response_actions = JSON.stringify(normalizeTriggerActionsBody(body.firstResponseActions, "first_response"));
      if (body.assignmentAcceptActions !== undefined) updates.assignment_accept_actions = JSON.stringify(normalizeTriggerActionsBody(body.assignmentAcceptActions, "assignment_accept"));
      if (body.followUpActions !== undefined) updates.follow_up_actions = JSON.stringify(normalizeTriggerActionsBody(body.followUpActions, "follow_up"));
      if (body.resolutionActions !== undefined) updates.resolution_actions = JSON.stringify(normalizeTriggerActionsBody(body.resolutionActions, "resolution"));
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);
      if (body.conditions !== undefined) updates.conditions = JSON.stringify(body.conditions);

      const [row] = await trx("sla_trigger_policies")
        .where({ tenant_id: tenantId, trigger_policy_id: triggerPolicyId })
        .update(updates)
        .returning([
          "trigger_policy_id",
          "name",
          "priority",
          "first_response_actions",
          "assignment_accept_actions",
          "follow_up_actions",
          "resolution_actions",
          "conditions",
          "is_active",
          "created_at",
          "updated_at"
        ]);
      if (!row) throw app.httpErrors.notFound("Trigger policy not found");
      return serializeTriggerPolicyRow(row as Record<string, unknown>);
    });
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
        .leftJoin("sla_definitions as d", function () {
          this.on("d.definition_id", "=", "b.definition_id").andOn("d.tenant_id", "=", "b.tenant_id");
        })
        .leftJoin("sla_trigger_policies as tp", function () {
          this.on("tp.trigger_policy_id", "=", "b.trigger_policy_id").andOn("tp.tenant_id", "=", "b.tenant_id");
        })
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
          "d.name as definition_name", "tp.name as trigger_policy_name", "ap.display_name as agent_name"
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
          definitionName: row.definition_name,
          triggerPolicyId: row.trigger_policy_id,
          triggerPolicyName: row.trigger_policy_name,
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
