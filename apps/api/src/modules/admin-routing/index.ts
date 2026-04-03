import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { isDateString, toIsoString } from "../tenant/tenant-admin.shared.js";
import {
  buildDispatchSuggestions,
  parseJsonArray,
  parseJsonRecord,
  readStringValue,
  serializeRoutingRuleActions
} from "../admin-core/admin-route.shared.js";

export async function adminRoutingRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/routing-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("routing_rules")
        .where({ tenant_id: tenantId })
        .select("rule_id", "name", "priority", "conditions", "actions", "is_active")
        .orderBy("priority", "asc");

      return rows.map((row) => ({ ...row, actions: serializeRoutingRuleActions(row.actions) }));
    });
  });

  app.post("/api/admin/routing-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      name?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      actions?: Record<string, unknown>;
      isActive?: boolean;
    };

    const ruleName = body.name?.trim();
    if (!ruleName) throw app.httpErrors.badRequest("Rule name is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const [rule] = await trx("routing_rules")
        .insert({
          tenant_id: tenantId,
          name: ruleName,
          priority: body.priority ?? 100,
          conditions: body.conditions ?? {},
          actions: serializeRoutingRuleActions(body.actions ?? {}),
          is_active: body.isActive ?? true
        })
        .returning(["rule_id"]);

      return { ruleId: rule.rule_id as string };
    });
  });

  app.patch("/api/admin/routing-rules/:ruleId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { ruleId } = req.params as { ruleId: string };
    const body = req.body as {
      name?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      actions?: Record<string, unknown>;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
      if (typeof body.priority === "number") updates.priority = body.priority;
      if (body.conditions && typeof body.conditions === "object") updates.conditions = body.conditions;
      if (body.actions && typeof body.actions === "object") updates.actions = serializeRoutingRuleActions(body.actions);
      if (typeof body.isActive === "boolean") updates.is_active = body.isActive;

      const affected = await trx("routing_rules")
        .where({ tenant_id: tenantId, rule_id: ruleId })
        .update(updates);

      if (!affected) throw app.httpErrors.notFound("Routing rule not found");
      return { updated: true, ruleId };
    });
  });

  app.delete("/api/admin/routing-rules/:ruleId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { ruleId } = req.params as { ruleId: string };
    return withTenantTransaction(tenantId, async (trx) => {
      const deleted = await trx("routing_rules").where({ tenant_id: tenantId, rule_id: ruleId }).del();
      if (!deleted) throw app.httpErrors.notFound("Routing rule not found");
      return { deleted: true, ruleId };
    });
  });

  app.get("/api/admin/dispatch-executions", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = (req.query as {
      caseId?: string;
      conversationId?: string;
      triggerType?: string;
      decisionType?: string;
      from?: string;
      to?: string;
    } | undefined) ?? {};

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("decision_traces as dt")
        .join("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "dt.conversation_id").andOn("c.tenant_id", "=", "dt.tenant_id");
        })
        .leftJoin("conversation_cases as cc", function joinCurrentCase() {
          this.on("cc.case_id", "=", "dt.case_id").andOn("cc.tenant_id", "=", "dt.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "dt.customer_id").andOn("cu.tenant_id", "=", "dt.tenant_id");
        })
        .modify((builder) => {
          builder.where("dt.tenant_id", tenantId).andWhere("dt.trace_kind", "dispatch_execution");
          if (query.conversationId?.trim()) builder.andWhere("dt.conversation_id", query.conversationId.trim());
          if (query.caseId?.trim()) builder.andWhere("dt.case_id", query.caseId.trim());
          if (query.triggerType?.trim()) builder.andWhere("dt.trigger_type", query.triggerType.trim());
          if (query.decisionType?.trim()) builder.andWhere("dt.decision_type", query.decisionType.trim());
          if (query.from && isDateString(query.from)) builder.andWhere("dt.created_at", ">=", `${query.from}T00:00:00.000Z`);
          if (query.to && isDateString(query.to)) builder.andWhere("dt.created_at", "<=", `${query.to}T23:59:59.999Z`);
        })
        .select(
          "dt.trace_id",
          "dt.case_id",
          "dt.conversation_id",
          "dt.trigger_type",
          "dt.trigger_actor_type",
          "dt.decision_type",
          "dt.channel_type",
          "dt.channel_id",
          "dt.customer_tier",
          "dt.customer_language",
          "dt.routing_rule_name",
          "dt.reason",
          "dt.decision_summary",
          "dt.input_snapshot",
          "dt.created_at",
          "cc.title as case_title",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref"
        )
        .orderBy("dt.created_at", "desc")
        .limit(200);

      return {
        items: rows.map((row: any) => {
          const summary = parseJsonRecord(row.decision_summary);
          return {
            executionId: row.trace_id,
            caseId: readStringValue(row.case_id),
            caseTitle: readStringValue(row.case_title),
            conversationId: row.conversation_id,
            triggerType: row.trigger_type,
            triggerActorType: row.trigger_actor_type,
            decisionType: row.decision_type,
            channelType: row.channel_type,
            channelId: row.channel_id,
            customerName: row.customer_name ?? null,
            customerRef: row.customer_ref ?? null,
            customerTier: row.customer_tier ?? null,
            customerLanguage: row.customer_language ?? null,
            routingRuleName: row.routing_rule_name ?? null,
            decisionReason: row.reason ?? null,
            decisionSummary: summary,
            assignedAgentId: typeof summary.assignedAgentId === "string" ? summary.assignedAgentId : null,
            aiAgentId: typeof summary.aiAgentId === "string" ? summary.aiAgentId : null,
            createdAt: toIsoString(row.created_at as string)
          };
        })
      };
    });
  });

  app.get("/api/admin/dispatch-executions/:executionId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { executionId } = req.params as { executionId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const execution = await trx("decision_traces as dt")
        .join("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "dt.conversation_id").andOn("c.tenant_id", "=", "dt.tenant_id");
        })
        .leftJoin("conversation_cases as cc", function joinCurrentCase() {
          this.on("cc.case_id", "=", "dt.case_id").andOn("cc.tenant_id", "=", "dt.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "dt.customer_id").andOn("cu.tenant_id", "=", "dt.tenant_id");
        })
        .where({ "dt.tenant_id": tenantId, "dt.trace_id": executionId, "dt.trace_kind": "dispatch_execution" })
        .select("dt.*", "cc.case_id as current_case_id", "cc.title as case_title", "cu.display_name as customer_name", "cu.external_ref as customer_ref")
        .first<Record<string, unknown>>();

      if (!execution) throw app.httpErrors.notFound("Dispatch execution not found");

      const [candidates, transitions] = await Promise.all([
        Promise.resolve(parseJsonArray(execution.candidates)),
        trx("decision_traces")
          .where({ tenant_id: tenantId, conversation_id: execution.conversation_id as string, trace_kind: "dispatch_transition" })
          .select("*")
          .orderBy("created_at", "desc")
          .limit(30)
      ]);

      return {
        execution: {
          executionId: execution.trace_id,
          caseId: readStringValue(execution.current_case_id),
          caseTitle: readStringValue(execution.case_title),
          conversationId: execution.conversation_id,
          customerName: execution.customer_name ?? null,
          customerRef: execution.customer_ref ?? null,
          triggerType: execution.trigger_type,
          triggerActorType: execution.trigger_actor_type,
          triggerActorId: execution.trigger_actor_id ?? null,
          decisionType: execution.decision_type,
          channelType: execution.channel_type ?? null,
          channelId: execution.channel_id ?? null,
          customerTier: execution.customer_tier ?? null,
          customerLanguage: execution.customer_language ?? null,
          routingRuleId: execution.routing_rule_id ?? null,
          routingRuleName: execution.routing_rule_name ?? null,
          matchedConditions: parseJsonRecord(execution.matched_conditions),
          inputSnapshot: parseJsonRecord(execution.input_snapshot),
          decisionSummary: parseJsonRecord(execution.decision_summary),
          decisionReason: execution.reason ?? null,
          createdAt: toIsoString(execution.created_at as string)
        },
        candidates: candidates.map((row) => ({
          candidateType: typeof row.candidateType === "string" ? row.candidateType : null,
          candidateId: typeof row.candidateId === "string" ? row.candidateId : null,
          candidateLabel: typeof row.candidateLabel === "string" ? row.candidateLabel : null,
          stage: typeof row.stage === "string" ? row.stage : null,
          accepted: Boolean(row.accepted),
          rejectReason: typeof row.rejectReason === "string" ? row.rejectReason : null,
          details: parseJsonRecord(row.details),
          createdAt: null
        })),
        transitions: transitions.map((row) => ({
          transitionId: row.trace_id,
          executionId: row.execution_ref ?? null,
          transitionType: row.decision_type,
          actorType: row.trigger_actor_type ?? null,
          actorId: row.trigger_actor_id ?? null,
          fromOwnerType: row.from_owner_type ?? null,
          fromOwnerId: row.from_owner_id ?? null,
          fromSegmentId: row.from_segment_id ?? null,
          toOwnerType: row.to_owner_type ?? null,
          toOwnerId: row.to_owner_id ?? null,
          toSegmentId: row.to_segment_id ?? null,
          reason: row.reason ?? null,
          payload: parseJsonRecord(row.payload),
          createdAt: toIsoString(row.created_at as string)
        }))
      };
    });
  });

  app.get("/api/admin/dispatch-ops-suggestions", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = (req.query as { from?: string; to?: string } | undefined) ?? {};

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("decision_traces")
        .where({ tenant_id: tenantId, trace_kind: "dispatch_execution" })
        .modify((builder) => {
          if (query.from && isDateString(query.from)) builder.andWhere("created_at", ">=", `${query.from}T00:00:00.000Z`);
          if (query.to && isDateString(query.to)) builder.andWhere("created_at", "<=", `${query.to}T23:59:59.999Z`);
        })
        .select("trace_id", "trigger_type", "decision_type", "routing_rule_name", "reason", "decision_summary", "customer_tier", "channel_type", "candidates", "created_at")
        .orderBy("created_at", "desc")
        .limit(2000);

      const transitions = await trx("decision_traces")
        .where({ tenant_id: tenantId, trace_kind: "dispatch_transition" })
        .modify((builder) => {
          if (query.from && isDateString(query.from)) builder.andWhere("created_at", ">=", `${query.from}T00:00:00.000Z`);
          if (query.to && isDateString(query.to)) builder.andWhere("created_at", "<=", `${query.to}T23:59:59.999Z`);
        })
        .select("execution_ref", "decision_type", "reason", "created_at")
        .orderBy("created_at", "desc")
        .limit(2000);

      const suggestions = buildDispatchSuggestions(rows, transitions, []);
      return {
        summary: {
          executions: rows.length,
          transitions: transitions.length,
          suggestions: suggestions.aiAgents.length + suggestions.teams.length + suggestions.customerSegments.length
        },
        groups: suggestions
      };
    });
  });
}
