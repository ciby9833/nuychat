import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { isDateString, isUniqueViolation, toIsoString } from "../tenant/tenant-admin.shared.js";
import {
  buildDispatchSuggestions,
  normalizeModuleOperatingMode,
  parseJsonArray,
  parseJsonRecord,
  readStringValue,
  serializeRoutingRuleActions
} from "../admin-core/admin-route.shared.js";

export async function adminRoutingRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/modules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("modules")
        .where({ tenant_id: tenantId })
        .select("module_id", "code", "name", "description", "operating_mode", "is_active", "created_at", "updated_at")
        .orderBy("created_at", "asc");

      return rows.map((row) => ({
        moduleId: row.module_id,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        operatingMode: row.operating_mode,
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at as string),
        updatedAt: toIsoString(row.updated_at as string)
      }));
    });
  });

  app.post("/api/admin/modules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      code?: string;
      name?: string;
      description?: string | null;
      operatingMode?: string;
      isActive?: boolean;
    };
    const code = body.code?.trim().toUpperCase();
    const name = body.name?.trim();
    if (!code || !name) throw app.httpErrors.badRequest("code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("modules")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            description: body.description?.trim() || null,
            operating_mode: normalizeModuleOperatingMode(body.operatingMode),
            is_active: body.isActive ?? true
          })
          .returning(["module_id", "code", "name", "description", "operating_mode", "is_active", "created_at", "updated_at"]);

        return {
          moduleId: row.module_id,
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          operatingMode: row.operating_mode,
          isActive: Boolean(row.is_active),
          createdAt: toIsoString(row.created_at as string),
          updatedAt: toIsoString(row.updated_at as string)
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Module code already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/modules/:moduleId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { moduleId } = req.params as { moduleId: string };
    const body = req.body as {
      code?: string;
      name?: string;
      description?: string | null;
      operatingMode?: string;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
        if (typeof body.code === "string" && body.code.trim()) updates.code = body.code.trim().toUpperCase();
        if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
        if (body.description !== undefined) updates.description = body.description?.trim() || null;
        if (body.operatingMode !== undefined) updates.operating_mode = normalizeModuleOperatingMode(body.operatingMode);
        if (typeof body.isActive === "boolean") updates.is_active = body.isActive;

        const affected = await trx("modules")
          .where({ tenant_id: tenantId, module_id: moduleId })
          .update(updates);

        if (!affected) throw app.httpErrors.notFound("Module not found");
        return { updated: true, moduleId };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Module code already exists");
        throw error;
      }
    });
  });

  app.delete("/api/admin/modules/:moduleId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { moduleId } = req.params as { moduleId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const usage = await trx("skill_groups")
        .where({ tenant_id: tenantId, module_id: moduleId })
        .count<{ cnt: string }>("skill_group_id as cnt")
        .first();

      if (Number(usage?.cnt ?? 0) > 0) {
        throw app.httpErrors.conflict("Module is still referenced by skill groups");
      }

      const deleted = await trx("modules")
        .where({ tenant_id: tenantId, module_id: moduleId })
        .del();

      if (!deleted) throw app.httpErrors.notFound("Module not found");
      return { deleted: true, moduleId };
    });
  });

  app.get("/api/admin/skill-groups", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      return trx("skill_groups as sg")
        .leftJoin("modules as m", function joinModules() {
          this.on("m.module_id", "=", "sg.module_id").andOn("m.tenant_id", "=", "sg.tenant_id");
        })
        .where("sg.tenant_id", tenantId)
        .select("sg.skill_group_id", "sg.module_id", "m.name as module_name", "sg.code", "sg.name", "sg.priority", "sg.is_active")
        .orderBy("sg.priority", "asc");
    });
  });

  app.post("/api/admin/skill-groups", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as { moduleId?: string; code?: string; name?: string; priority?: number; isActive?: boolean };
    const moduleId = body.moduleId?.trim();
    const code = body.code?.trim().toUpperCase();
    const name = body.name?.trim();
    if (!moduleId || !code || !name) throw app.httpErrors.badRequest("moduleId, code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const module = await trx("modules").where({ tenant_id: tenantId, module_id: moduleId }).select("module_id").first();
        if (!module) throw app.httpErrors.notFound("Module not found");
        const [row] = await trx("skill_groups")
          .insert({
            tenant_id: tenantId,
            module_id: moduleId,
            code,
            name,
            priority: body.priority ?? 100,
            is_active: body.isActive ?? true
          })
          .returning(["skill_group_id", "code", "name", "priority"]);

        return { skill_group_id: row.skill_group_id, code: row.code, name: row.name, priority: row.priority };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Skill group code already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/skill-groups/:skillGroupId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { skillGroupId } = req.params as { skillGroupId: string };
    const body = req.body as { moduleId?: string; code?: string; name?: string; priority?: number; isActive?: boolean };

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
        if (typeof body.moduleId === "string" && body.moduleId.trim()) {
          const module = await trx("modules").where({ tenant_id: tenantId, module_id: body.moduleId.trim() }).select("module_id").first();
          if (!module) throw app.httpErrors.notFound("Module not found");
          updates.module_id = body.moduleId.trim();
        }
        if (typeof body.code === "string" && body.code.trim()) updates.code = body.code.trim().toUpperCase();
        if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
        if (typeof body.priority === "number") updates.priority = body.priority;
        if (typeof body.isActive === "boolean") updates.is_active = body.isActive;

        const affected = await trx("skill_groups")
          .where({ tenant_id: tenantId, skill_group_id: skillGroupId })
          .update(updates);

        if (!affected) throw app.httpErrors.notFound("Skill group not found");
        return { updated: true, skillGroupId };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Skill group code already exists");
        throw error;
      }
    });
  });

  app.delete("/api/admin/skill-groups/:skillGroupId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { skillGroupId } = req.params as { skillGroupId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const [agentUsage, ruleUsage] = await Promise.all([
        trx("agent_skills").where({ tenant_id: tenantId, skill_group_id: skillGroupId }).count<{ cnt: string }>("id as cnt").first(),
        trx("routing_rules")
          .where({ tenant_id: tenantId })
          .whereRaw(
            "actions #>> '{humanTarget,skillGroupCode}' = (select code from skill_groups where tenant_id = ? and skill_group_id = ?)",
            [tenantId, skillGroupId]
          )
          .count<{ cnt: string }>("rule_id as cnt")
          .first()
      ]);

      if (Number(agentUsage?.cnt ?? 0) > 0 || Number(ruleUsage?.cnt ?? 0) > 0) {
        throw app.httpErrors.conflict("Skill group is still referenced by agents or routing rules");
      }

      const deleted = await trx("skill_groups")
        .where({ tenant_id: tenantId, skill_group_id: skillGroupId })
        .del();

      if (!deleted) throw app.httpErrors.notFound("Skill group not found");
      return { deleted: true, skillGroupId };
    });
  });

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
        items: rows.map((row) => {
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
