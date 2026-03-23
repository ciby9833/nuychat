import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "./tenant-admin.auth.js";
import {
  isDateString,
  isUniqueViolation,
  normalizeStringArray,
  parseJsonNumberMap,
  parseJsonObject,
  parseJsonStringArray,
  toIsoString
} from "./tenant-admin.shared.js";

export async function tenantQualityRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

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
    const assignmentAcceptTargetSec = body.assignmentAcceptTargetSec === null || body.assignmentAcceptTargetSec === undefined
      ? null
      : Number(body.assignmentAcceptTargetSec);
    const followUpTargetSec = body.followUpTargetSec === null || body.followUpTargetSec === undefined
      ? null
      : Number(body.followUpTargetSec);
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
      if (body.assignmentAcceptTargetSec !== undefined) {
        updates.assignment_accept_target_sec = body.assignmentAcceptTargetSec === null ? null : Math.max(1, Math.floor(body.assignmentAcceptTargetSec));
      }
      if (body.followUpTargetSec !== undefined) {
        updates.follow_up_target_sec = body.followUpTargetSec === null ? null : Math.max(1, Math.floor(body.followUpTargetSec));
      }
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
        return serializeTriggerPolicyRow(row);
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
      return serializeTriggerPolicyRow(row);
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
        .leftJoin("sla_definitions as d", function joinDefinition() {
          this.on("d.definition_id", "=", "b.definition_id").andOn("d.tenant_id", "=", "b.tenant_id");
        })
        .leftJoin("sla_trigger_policies as tp", function joinTriggerPolicy() {
          this.on("tp.trigger_policy_id", "=", "b.trigger_policy_id").andOn("tp.tenant_id", "=", "b.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
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
        listQuery
          .clone()
          .select(
            "b.breach_id",
            "b.definition_id",
            "b.trigger_policy_id",
            "b.conversation_id",
            "b.case_id",
            "b.agent_id",
            "b.metric",
            "b.target_sec",
            "b.actual_sec",
            "b.breach_sec",
            "b.severity",
            "b.status",
            "b.acknowledged_at",
            "b.resolved_at",
            "b.details",
            "b.created_at",
            "b.updated_at",
            "d.name as definition_name",
            "tp.name as trigger_policy_name",
            "ap.display_name as agent_name"
          )
          .orderBy("b.created_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        listQuery.clone().count<{ cnt: string }>("b.breach_id as cnt").first(),
        listQuery
          .clone()
          .select("b.status")
          .avg<{ avg_breach_sec: string }>("b.breach_sec as avg_breach_sec")
          .count<{ cnt: string }>("b.breach_id as cnt")
          .groupBy("b.status")
      ]) as unknown as [Array<Record<string, unknown>>, { cnt?: string } | undefined, Array<Record<string, unknown>>];

      const summary = {
        total: Number(countRow?.cnt ?? 0),
        open: 0,
        acknowledged: 0,
        resolved: 0,
        avgBreachSec: 0
      };
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
        items: rows.map((row: Record<string, unknown>) => ({
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
      if (body.status === "acknowledged") {
        updates.acknowledged_at = trx.fn.now();
      } else if (body.status === "resolved") {
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

  app.get("/api/admin/qa/scoring-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("qa_scoring_rules")
        .where({ tenant_id: tenantId })
        .select("rule_id", "code", "name", "weight", "is_active", "sort_order", "created_at", "updated_at")
        .orderBy("sort_order", "asc") as Array<Record<string, unknown>>;
      return rows.map((row: Record<string, unknown>) => ({
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

    const totalWeight = rules.reduce((sum, item) => {
      const active = item.isActive ?? true;
      if (!active) return sum;
      return sum + Math.max(0, Number(item.weight ?? 0));
    }, 0);
    if (totalWeight !== 100) {
      throw app.httpErrors.badRequest("Total weight of active dimensions must equal 100");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      for (const [index, item] of rules.entries()) {
        const code = item.code?.trim().toLowerCase();
        const name = item.name?.trim();
        if (!code || !name) {
          throw app.httpErrors.badRequest("Each rule requires code and name");
        }
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
        .join("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "cc.customer_id").andOn("cu.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "cc.current_owner_id").andOn("ap.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("qa_reviews as qr", function joinReview() {
          this.on("qr.case_id", "=", "cc.case_id").andOn("qr.tenant_id", "=", "cc.tenant_id");
        })
        .where("cc.tenant_id", tenantId)
        .whereIn("cc.status", ["resolved", "closed"])
        .modify((qb) => {
          if (search) {
            const like = `%${search}%`;
            qb.andWhere((scope) => {
              scope
                .whereILike("cu.display_name", like)
                .orWhereILike("cu.external_ref", like)
                .orWhereILike("c.conversation_id", like)
                .orWhereILike("cc.case_id", like);
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

      return rows.map((row: Record<string, unknown>) => ({
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

    const query = req.query as {
      agentId?: string;
      tag?: string;
      minScore?: string;
      maxScore?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const minScore = query.minScore ? Math.max(0, Math.min(100, Number(query.minScore))) : undefined;
    const maxScore = query.maxScore ? Math.max(0, Math.min(100, Number(query.maxScore))) : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const base = trx("qa_reviews as qr")
        .leftJoin("conversation_cases as cc", function joinCase() {
          this.on("cc.case_id", "=", "qr.case_id").andOn("cc.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "qr.agent_id").andOn("ap.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("tenant_memberships as tm", function joinMembership() {
          this.on("tm.identity_id", "=", "qr.reviewer_identity_id").andOn("tm.tenant_id", "=", "qr.tenant_id");
        })
        .leftJoin("identities as i", "i.identity_id", "tm.identity_id")
        .where("qr.tenant_id", tenantId)
        .modify((qb) => {
          if (query.agentId) qb.andWhere("qr.agent_id", query.agentId);
          if (minScore !== undefined) qb.andWhere("qr.score", ">=", minScore);
          if (maxScore !== undefined) qb.andWhere("qr.score", "<=", maxScore);
          if (query.tag?.trim()) {
            qb.andWhereRaw("qr.tags @> ?::jsonb", [JSON.stringify([query.tag.trim()])]);
          }
        });

      const [rows, countRow] = await Promise.all([
        base
          .clone()
          .select(
            "qr.review_id",
            "qr.conversation_id",
            "qr.case_id",
            "qr.reviewer_identity_id",
            "qr.agent_id",
            "qr.score",
            "qr.dimension_scores",
            "qr.tags",
            "qr.note",
            "qr.status",
            "qr.created_at",
            "qr.updated_at",
            "ap.display_name as agent_name",
            "i.email as reviewer_email",
            "c.status as conversation_status"
          )
          .orderBy("qr.created_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        base.clone().count<{ cnt: string }>("qr.review_id as cnt").first()
      ]);

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        items: rows.map((row: Record<string, unknown>) => ({
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
      if (!["resolved", "closed"].includes(conversation.status)) {
        throw app.httpErrors.badRequest("Only resolved/closed conversation can be reviewed");
      }
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
          "review_id",
          "conversation_id",
          "case_id",
          "reviewer_identity_id",
          "agent_id",
          "score",
          "dimension_scores",
          "tags",
          "note",
          "status",
          "created_at",
          "updated_at"
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
    const body = req.body as {
      score?: number;
      dimensionScores?: Record<string, number>;
      tags?: string[];
      note?: string;
      status?: "draft" | "published";
    };

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
          "review_id",
          "conversation_id",
          "case_id",
          "reviewer_identity_id",
          "agent_id",
          "score",
          "dimension_scores",
          "tags",
          "note",
          "status",
          "created_at",
          "updated_at"
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
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "s.customer_id").andOn("cu.tenant_id", "=", "s.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "s.agent_id").andOn("ap.tenant_id", "=", "s.tenant_id");
        })
        .where("s.tenant_id", tenantId)
        .modify((qb) => {
          if (query.status) qb.andWhere("s.status", query.status);
          if (from) qb.andWhereRaw("s.scheduled_at::date >= ?", [from]);
          if (to) qb.andWhereRaw("s.scheduled_at::date <= ?", [to]);
        });

      const [rows, countRow, statusRows] = await Promise.all([
        base
          .clone()
          .select(
            "s.survey_id",
            "s.conversation_id",
            "s.case_id",
            "s.customer_id",
            "s.agent_id",
            "s.channel_type",
            "s.channel_id",
            "s.status",
            "s.scheduled_at",
            "s.sent_at",
            "s.expires_at",
            "s.created_at",
            "s.updated_at",
            "cu.display_name as customer_name",
            "cu.external_ref as customer_ref",
            "ap.display_name as agent_name"
          )
          .orderBy("s.scheduled_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize),
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
        items: rows.map((row: Record<string, unknown>) => ({
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
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "r.customer_id").andOn("cu.tenant_id", "=", "r.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
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
        base
          .clone()
          .select(
            "r.response_id",
            "r.survey_id",
            "r.conversation_id",
            "r.case_id",
            "r.customer_id",
            "r.agent_id",
            "r.rating",
            "r.feedback",
            "r.source",
            "r.responded_at",
            "r.created_at",
            "r.updated_at",
            "cu.display_name as customer_name",
            "cu.external_ref as customer_ref",
            "ap.display_name as agent_name"
          )
          .orderBy("r.responded_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize),
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
        items: rows.map((row: Record<string, unknown>) => ({
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

type TriggerMetric = "first_response" | "assignment_accept" | "follow_up" | "resolution";
type TriggerActionType = "alert" | "escalate" | "reassign" | "close_case";

function serializeTriggerPolicyRow(row: Record<string, unknown>) {
  return {
    triggerPolicyId: row.trigger_policy_id,
    name: row.name,
    priority: row.priority,
    firstResponseActions: normalizeTriggerActionsBody(row.first_response_actions, "first_response"),
    assignmentAcceptActions: normalizeTriggerActionsBody(row.assignment_accept_actions, "assignment_accept"),
    followUpActions: normalizeTriggerActionsBody(row.follow_up_actions, "follow_up"),
    resolutionActions: normalizeTriggerActionsBody(row.resolution_actions, "resolution"),
    conditions: parseJsonObject(row.conditions),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function normalizeTriggerActionsBody(raw: unknown, metric: TriggerMetric) {
  if (!Array.isArray(raw)) return [];
  const allowed = allowedTriggerActions(metric);
  const actions: Array<{ type: TriggerActionType; mode?: "semantic" | "waiting_customer" }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = typeof (item as { type?: unknown }).type === "string"
      ? ((item as { type: string }).type as TriggerActionType)
      : null;
    if (!type || !allowed.has(type)) continue;
    const mode = typeof (item as { mode?: unknown }).mode === "string"
      ? ((item as { mode: "semantic" | "waiting_customer" }).mode)
      : undefined;
    actions.push(type === "close_case" && mode ? { type, mode } : { type });
  }
  return actions;
}

function allowedTriggerActions(metric: TriggerMetric) {
  switch (metric) {
    case "first_response":
      return new Set<TriggerActionType>(["alert", "escalate"]);
    case "assignment_accept":
      return new Set<TriggerActionType>(["alert", "escalate", "reassign"]);
    case "follow_up":
      return new Set<TriggerActionType>(["alert", "escalate", "reassign", "close_case"]);
    case "resolution":
      return new Set<TriggerActionType>(["alert", "escalate"]);
    default:
      return new Set<TriggerActionType>(["alert"]);
  }
}

async function resolveLatestCaseId(
  trx: Parameters<typeof withTenantTransaction>[1] extends (trx: infer T) => unknown ? T : never,
  tenantId: string,
  conversationId: string
) {
  const row = await trx("conversation_cases")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .orderByRaw("CASE WHEN status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END")
    .orderBy("last_activity_at", "desc")
    .orderBy("opened_at", "desc")
    .select("case_id")
    .first<{ case_id: string } | undefined>();

  return row?.case_id ?? null;
}
