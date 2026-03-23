import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { outboundQueue } from "../../infra/queue/queues.js";
import { getDailyReport } from "../analytics/analytics.service.js";
import { PresenceService } from "../agent/presence.service.js";
import { ConversationCaseService } from "../conversation/conversation-case.service.js";
import { OwnershipService } from "../conversation/ownership.service.js";
import { ConversationSegmentService } from "../conversation/conversation-segment.service.js";
import { DispatchAuditService } from "../dispatch/dispatch-audit.service.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE, SERVICE_REPLY_SENDER_TYPES } from "../message/message.constants.js";
import { markCustomerMessagesRead } from "../message/message.repository.js";
import { getPrimaryTeamContext } from "../routing-engine/human-dispatch.service.js";
import { normalizeRoutingRuleActions } from "../routing-engine/routing-rule-schema.js";
import { APP_ROLES, PERMISSION_KEYS, attachTenantAdminGuard, normalizePermissionKey, normalizeRole } from "./tenant-admin.auth.js";
import {
  isDateString,
  isTimeString,
  isUniqueViolation,
  normalizeStringArray,
  parseJsonStringArray,
  toIsoString
} from "./tenant-admin.shared.js";

export async function tenantAdminRoutes(app: FastifyInstance) {
  const conversationSegmentService = new ConversationSegmentService();
  const conversationCaseService = new ConversationCaseService();
  const ownershipService = new OwnershipService();
  const dispatchAuditService = new DispatchAuditService();
  const presenceService = new PresenceService();
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
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

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
        const module = await trx("modules")
          .where({ tenant_id: tenantId, module_id: moduleId })
          .select("module_id")
          .first();
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

        return {
          skill_group_id: row.skill_group_id,
          code: row.code,
          name: row.name,
          priority: row.priority
        };
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
          const module = await trx("modules")
            .where({ tenant_id: tenantId, module_id: body.moduleId.trim() })
            .select("module_id")
            .first();
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
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("routing_rules")
        .where({ tenant_id: tenantId })
        .select("rule_id", "name", "priority", "conditions", "actions", "is_active")
        .orderBy("priority", "asc");

      return rows.map((row) => ({
        ...row,
        actions: serializeRoutingRuleActions(row.actions)
      }));
    });
  });

  app.post("/api/admin/routing-rules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const body = req.body as {
      name?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      actions?: Record<string, unknown>;
      isActive?: boolean;
    };

    const ruleName = body.name?.trim();
    if (!ruleName) {
      throw app.httpErrors.badRequest("Rule name is required");
    }

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
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

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
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { ruleId } = req.params as { ruleId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const deleted = await trx("routing_rules")
        .where({ tenant_id: tenantId, rule_id: ruleId })
        .del();

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
          if (query.caseId?.trim()) {
            builder.andWhere("dt.case_id", query.caseId.trim());
          }
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
          const caseId = readStringValue(row.case_id);
          const caseTitle = readStringValue(row.case_title);
          return {
            executionId: row.trace_id,
            caseId,
            caseTitle,
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
        .select(
          "dt.*",
          "cc.case_id as current_case_id",
          "cc.title as case_title",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref"
        )
        .first<Record<string, unknown>>();

      if (!execution) throw app.httpErrors.notFound("Dispatch execution not found");
      const executionInputSnapshot = parseJsonRecord(execution.input_snapshot);
      const executionDecisionSummary = parseJsonRecord(execution.decision_summary);
      const executionCaseId = readStringValue(execution.current_case_id);
      const executionCaseTitle = readStringValue(execution.case_title);

      const [candidates, transitions] = await Promise.all([
        Promise.resolve(parseJsonArray(execution.candidates)),
        trx("decision_traces")
          .where({
            tenant_id: tenantId,
            conversation_id: execution.conversation_id as string,
            trace_kind: "dispatch_transition"
          })
          .select("*")
          .orderBy("created_at", "desc")
          .limit(30)
      ]);

      return {
        execution: {
          executionId: execution.trace_id,
          caseId: executionCaseId,
          caseTitle: executionCaseTitle,
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
          inputSnapshot: executionInputSnapshot,
          decisionSummary: executionDecisionSummary,
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
        .select(
          "trace_id",
          "trigger_type",
          "decision_type",
          "routing_rule_name",
          "reason",
          "decision_summary",
          "customer_tier",
          "channel_type",
          "candidates",
          "created_at"
        )
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

  // ── Overview dashboard stats ─────────────────────────────────────────────────
  app.get("/api/admin/overview", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const [convStats, kbStats, agentStats] = await Promise.all([
        // Conversation counts by status
        trx("conversations")
          .select("status")
          .count("conversation_id as cnt")
          .groupBy("status"),
        // KB entry count
        trx("knowledge_base_entries")
          .where({ is_active: true })
          .count("entry_id as cnt")
          .first(),
        // Agent count
        trx("agent_profiles")
          .count("agent_id as cnt")
          .first()
      ]);

      const byStatus = Object.fromEntries(
        (convStats as Array<{ status: string; cnt: string }>).map((r) => [r.status, Number(r.cnt)])
      );

      return {
        conversations: {
          total: Object.values(byStatus).reduce((a, b) => a + b, 0),
          byStatus
        },
        knowledgeBase: { activeEntries: Number((kbStats as { cnt: string })?.cnt ?? 0) },
        agents: { total: Number((agentStats as { cnt: string })?.cnt ?? 0) }
      };
    });
  });

  app.get("/api/admin/agent-presence", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      await presenceService.refreshTenantPresenceStates(trx, tenantId);

      const activeConversations = trx("conversations")
        .where({ tenant_id: tenantId, status: "human_active", current_handler_type: "human" })
        .whereNotNull("current_handler_id")
        .groupBy("current_handler_id")
        .select("current_handler_id")
        .count<{ current_handler_id: string; active_count: string }[]>("conversation_id as active_count")
        .as("ac");

      const rows = await trx("agent_profiles as ap")
        .join("tenant_memberships as tm", function joinMemberships() {
          this.on("tm.membership_id", "=", "ap.membership_id").andOn("tm.tenant_id", "=", "ap.tenant_id");
        })
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .leftJoin(activeConversations, function joinActiveConversations() {
          this.on(trx.raw("ac.current_handler_id::uuid"), "=", trx.ref("ap.agent_id"));
        })
        .where("ap.tenant_id", tenantId)
        .groupBy("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email", "ac.active_count")
        .select("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email")
        .select("ac.active_count")
        .orderBy("ap.display_name", "asc") as Array<Record<string, unknown>>;

      const byStatus = { online: 0, busy: 0, away: 0, offline: 0 };
      const items = rows.map((row) => {
        const effectiveStatus = String(row.presence_state ?? "offline");
        if (effectiveStatus === "online") byStatus.online += 1;
        else if (effectiveStatus === "busy") byStatus.busy += 1;
        else if (effectiveStatus === "away") byStatus.away += 1;
        else byStatus.offline += 1;

        return {
          agentId: row.agent_id,
          displayName: row.display_name,
          email: row.email,
          status: effectiveStatus,
          lastSeenAt: row.last_heartbeat_at,
          activeConversations: Number((row as { active_count?: string }).active_count ?? 0)
        };
      });

      return {
        summary: {
          total: items.length,
          online: byStatus.online,
          busy: byStatus.busy,
          away: byStatus.away,
          offline: byStatus.offline
        },
        items
      };
    });
  });

  app.get("/api/admin/shift-schedules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("shift_schedules")
        .where({ tenant_id: tenantId })
        .select("shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "created_at", "updated_at")
        .orderBy("created_at", "asc");
      return rows.map((row) => ({
        shiftId: row.shift_id,
        code: row.code,
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    });
  });

  app.post("/api/admin/shift-schedules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      code?: string;
      name?: string;
      startTime?: string;
      endTime?: string;
      timezone?: string;
      isActive?: boolean;
    };
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!code || !name || !isTimeString(body.startTime) || !isTimeString(body.endTime)) {
      throw app.httpErrors.badRequest("code, name, startTime, endTime are required (HH:mm)");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("shift_schedules")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            start_time: body.startTime,
            end_time: body.endTime,
            timezone: body.timezone?.trim() || "Asia/Jakarta",
            is_active: body.isActive ?? true
          })
          .returning(["shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "created_at", "updated_at"]);
        return {
          shiftId: row.shift_id,
          code: row.code,
          name: row.name,
          startTime: row.start_time,
          endTime: row.end_time,
          timezone: row.timezone,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Shift code already exists");
        throw error;
      }
    });
  });

  app.get("/api/admin/agent-shifts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { from?: string; to?: string };
    const from = isDateString(query.from) ? query.from : new Date().toISOString().slice(0, 10);
    const to = isDateString(query.to) ? query.to : from;
    if (from > to) throw app.httpErrors.badRequest("from must be <= to");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("agent_shifts as s")
        .join("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "s.agent_id").andOn("ap.tenant_id", "=", "s.tenant_id");
        })
        .leftJoin("shift_schedules as ss", function joinSchedule() {
          this.on("ss.shift_id", "=", "s.shift_id").andOn("ss.tenant_id", "=", "s.tenant_id");
        })
        .where("s.tenant_id", tenantId)
        .andWhere("s.shift_date", ">=", from)
        .andWhere("s.shift_date", "<=", to)
        .select(
          "s.id",
          "s.agent_id",
          "s.shift_id",
          trx.raw("to_char(s.shift_date, 'YYYY-MM-DD') as shift_date"),
          "s.status",
          "s.note",
          "ap.display_name",
          "ss.code as shift_code",
          "ss.name as shift_name"
        )
        .orderBy("s.shift_date", "asc");

      return rows.map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        agentName: row.display_name,
        shiftId: row.shift_id,
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        shiftDate: String(row.shift_date),
        status: row.status,
        note: row.note
      }));
    });
  });

  app.post("/api/admin/agent-shifts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      agentId?: string;
      shiftId?: string | null;
      shiftDate?: string;
      status?: "scheduled" | "off" | "leave";
      note?: string;
    };
    const agentId = body.agentId?.trim();
    if (!agentId || !isDateString(body.shiftDate)) {
      throw app.httpErrors.badRequest("agentId and shiftDate are required");
    }
    const status = body.status && ["scheduled", "off", "leave"].includes(body.status) ? body.status : "scheduled";

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).first();
      if (!agent) throw app.httpErrors.notFound("Agent not found");

      if (body.shiftId) {
        const shift = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: body.shiftId }).first();
        if (!shift) throw app.httpErrors.notFound("Shift schedule not found");
      }

      const [row] = await trx("agent_shifts")
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          shift_id: body.shiftId ?? null,
          shift_date: body.shiftDate,
          status,
          note: body.note?.trim() || null
        })
        .onConflict(["agent_id", "shift_date"])
        .merge({
          shift_id: body.shiftId ?? null,
          status,
          note: body.note?.trim() || null,
          updated_at: trx.fn.now()
        })
        .returning(["id", "agent_id", "shift_id", "shift_date", "status", "note"]);

      return {
        id: row.id,
        agentId: row.agent_id,
        shiftId: row.shift_id,
        shiftDate: row.shift_date,
        status: row.status,
        note: row.note
      };
    });
  });

  app.post("/api/admin/agent-breaks", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      agentId?: string;
      breakType?: "break" | "lunch" | "training";
      status?: "active" | "ended";
      note?: string;
      endCurrent?: boolean;
    };
    const agentId = body.agentId?.trim();
    if (!agentId) throw app.httpErrors.badRequest("agentId is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).first();
      if (!agent) throw app.httpErrors.notFound("Agent not found");

      if (body.endCurrent) {
        await trx("agent_breaks")
          .where({ tenant_id: tenantId, agent_id: agentId, status: "active" })
          .update({ status: "ended", ended_at: trx.fn.now(), updated_at: trx.fn.now() });
        await presenceService.refreshAgentPresence(trx, tenantId, agentId);
        return { ended: true };
      }

      await trx("agent_breaks")
        .where({ tenant_id: tenantId, agent_id: agentId, status: "active" })
        .update({ status: "ended", ended_at: trx.fn.now(), updated_at: trx.fn.now() });

      const [row] = await trx("agent_breaks")
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          break_type: body.breakType && ["break", "lunch", "training"].includes(body.breakType) ? body.breakType : "break",
          status: "active",
          note: body.note?.trim() || null
        })
        .returning(["break_id", "agent_id", "break_type", "status", "started_at"]);

      await presenceService.refreshAgentPresence(trx, tenantId, agentId);

      return {
        breakId: row.break_id,
        agentId: row.agent_id,
        breakType: row.break_type,
        status: row.status,
        startedAt: row.started_at
      };
    });
  });

  // ── Shift schedule edit / delete ───────────────────────────────────────────
  app.patch("/api/admin/shift-schedules/:shiftId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { shiftId } = req.params as { shiftId: string };
    const body = req.body as {
      name?: string;
      startTime?: string;
      endTime?: string;
      timezone?: string;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: shiftId }).first();
      if (!existing) throw app.httpErrors.notFound("Shift schedule not found");

      const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name?.trim()) patch.name = body.name.trim();
      if (isTimeString(body.startTime)) patch.start_time = body.startTime;
      if (isTimeString(body.endTime)) patch.end_time = body.endTime;
      if (body.timezone?.trim()) patch.timezone = body.timezone.trim();
      if (typeof body.isActive === "boolean") patch.is_active = body.isActive;

      const [row] = await trx("shift_schedules")
        .where({ tenant_id: tenantId, shift_id: shiftId })
        .update(patch)
        .returning(["shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "updated_at"]);

      return {
        shiftId: row.shift_id,
        code: row.code,
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone,
        isActive: row.is_active,
        updatedAt: row.updated_at
      };
    });
  });

  app.delete("/api/admin/shift-schedules/:shiftId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { shiftId } = req.params as { shiftId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: shiftId }).first();
      if (!existing) throw app.httpErrors.notFound("Shift schedule not found");
      // Soft-delete: mark inactive rather than hard-delete to preserve historical agent_shifts
      await trx("shift_schedules")
        .where({ tenant_id: tenantId, shift_id: shiftId })
        .update({ is_active: false, updated_at: trx.fn.now() });
      return { deleted: true };
    });
  });

  // ── Bulk agent-shift upsert ─────────────────────────────────────────────────
  app.post("/api/admin/agent-shifts/bulk", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as {
      items?: Array<{
        agentId?: string;
        shiftId?: string | null;
        shiftDate?: string;
        status?: "scheduled" | "off" | "leave";
        note?: string;
      }>;
    };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw app.httpErrors.badRequest("items array is required");
    }
    const validStatuses = new Set(["scheduled", "off", "leave"]);

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = body.items!
        .filter((item) => item.agentId?.trim() && isDateString(item.shiftDate))
        .map((item) => ({
          tenant_id: tenantId,
          agent_id: item.agentId!.trim(),
          shift_id: item.shiftId ?? null,
          shift_date: item.shiftDate!,
          status: validStatuses.has(item.status ?? "") ? item.status! : "scheduled",
          note: item.note?.trim() || null
        }));

      if (rows.length === 0) throw app.httpErrors.badRequest("No valid items");

      await trx("agent_shifts")
        .insert(rows)
        .onConflict(["agent_id", "shift_date"])
        .merge({ shift_id: trx.raw("EXCLUDED.shift_id"), status: trx.raw("EXCLUDED.status"), note: trx.raw("EXCLUDED.note"), updated_at: trx.fn.now() });

      return { saved: rows.length };
    });
  });

  // ── Supervisor Workbench (Phase E4) ────────────────────────────────────────
  app.get("/api/admin/supervisor/overview", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const waitingConversationIdsQuery = buildSupervisorWaitingConversationIdsQuery(trx, tenantId);
      const [waitingRow, onlineRow, aiRow, todayRow, slaRow, csatRow] = await Promise.all([
        trx.from(waitingConversationIdsQuery.clone().as("sw"))
          .whereNot("sw.owner_bucket", "ai")
          .count<{ cnt: string }>("sw.conversation_id as cnt")
          .first(),
        trx("agent_profiles")
          .where({ tenant_id: tenantId, status: "online" })
          .count<{ cnt: string }>("agent_id as cnt")
          .first(),
        trx.from(waitingConversationIdsQuery.clone().as("sw"))
          .where("sw.owner_bucket", "ai")
          .count<{ cnt: string }>("sw.conversation_id as cnt")
          .first(),
        trx("conversations")
          .where({ tenant_id: tenantId })
          .whereRaw("created_at::date = current_date")
          .count<{ cnt: string }>("conversation_id as cnt")
          .first(),
        trx("sla_breaches")
          .where({ tenant_id: tenantId, status: "open" })
          .count<{ cnt: string }>("breach_id as cnt")
          .first(),
        trx("csat_responses")
          .where({ tenant_id: tenantId })
          .whereRaw("responded_at::date = current_date")
          .avg<{ avg_rating: string }>("rating as avg_rating")
          .first()
      ]);

      return {
        waitingQueue: Number(waitingRow?.cnt ?? 0),
        onlineAgents: Number(onlineRow?.cnt ?? 0),
        aiProcessing: Number(aiRow?.cnt ?? 0),
        todayConversations: Number(todayRow?.cnt ?? 0),
        slaBreaches: Number(slaRow?.cnt ?? 0),
        avgCsatToday: Number(csatRow?.avg_rating ?? 0)
      };
    });
  });

  app.get("/api/admin/supervisor/waiting-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { limit?: string };
    const limit = Math.min(100, Math.max(10, Number(query.limit ?? 30)));

    return withTenantTransaction(tenantId, async (trx) => {
      const waitingConversationIdsQuery = buildSupervisorWaitingConversationIdsQuery(trx, tenantId);
      const rows = await trx.from(waitingConversationIdsQuery.as("sw"))
        .join("conversations as c", function joinConv() {
          this.on("c.conversation_id", "=", "sw.conversation_id").andOn("c.tenant_id", "=", "sw.tenant_id");
        })
        .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
          this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("conversation_cases as cc", function joinCurrentCase() {
          this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("skill_groups as sg", function joinGroup() {
          this.on("sg.skill_group_id", "=", "qa.skill_group_id").andOn("sg.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("departments as d", function joinDepartment() {
          this.on("d.department_id", "=", "qa.department_id").andOn("d.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("teams as t", function joinTeam() {
          this.on("t.team_id", "=", "qa.team_id").andOn("t.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("tenant_ai_agents as ai", function joinAiAgent() {
          this.on("ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("ai.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgentProfile() {
          this.on("ap.agent_id", "=", "qa.assigned_agent_id").andOn("ap.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
        .where("sw.tenant_id", tenantId)
        .select(
          "qa.assignment_id",
          "qa.conversation_id",
          "qa.priority",
          "qa.status as queue_status",
          "qa.assigned_ai_agent_id",
          "qa.assigned_agent_id",
          "ai.name as assigned_ai_agent_name",
          "tm.display_name as assigned_agent_name",
          "sw.owner_bucket",
          "sw.waiting_from",
          "sw.waiting_seconds",
          "c.status as conversation_status",
          "cc.case_id",
          "cc.title as case_title",
          "c.channel_type",
          "c.last_message_preview",
          "c.last_message_at",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref",
          "sg.name as skill_group_name",
          "d.name as department_name",
          "t.name as team_name"
        )
        .orderBy("sw.waiting_from", "asc")
        .limit(limit);

      return rows.map((row) => ({
        assignmentId: row.assignment_id,
        caseId: row.case_id ?? null,
        caseTitle: row.case_title ?? null,
        conversationId: row.conversation_id,
        priority: Number(row.priority ?? 100),
        waitingFrom: toIsoString(row.waiting_from),
        waitingSeconds: Number(row.waiting_seconds ?? 0),
        conversationStatus: row.conversation_status,
        queueStatus: row.queue_status ?? null,
        ownerBucket: row.owner_bucket,
        aiAgentId: row.assigned_ai_agent_id ?? null,
        aiAgentName: row.assigned_ai_agent_name ?? null,
        assignedAgentId: row.assigned_agent_id ?? null,
        assignedAgentName: row.assigned_agent_name ?? null,
        channelType: row.channel_type,
        customerName: row.customer_name,
        customerRef: row.customer_ref,
        skillGroupName: row.skill_group_name,
        departmentName: row.department_name,
        teamName: row.team_name,
        lastMessagePreview: row.last_message_preview,
        lastMessageAt: row.last_message_at ? toIsoString(row.last_message_at) : null
      }));
    });
  });

  app.get("/api/admin/supervisor/all-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      departmentId?: string;
      teamId?: string;
      agentId?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await buildSupervisorConversationWorkbenchRows(trx, tenantId, {
        departmentId: query.departmentId?.trim() || null,
        teamId: query.teamId?.trim() || null,
        agentId: query.agentId?.trim() || null
      });

      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);

      return {
        page,
        pageSize,
        total: rows.length,
        items
      };
    });
  });

  app.get("/api/admin/supervisor/exception-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      departmentId?: string;
      teamId?: string;
      agentId?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await buildSupervisorConversationWorkbenchRows(trx, tenantId, {
        departmentId: query.departmentId?.trim() || null,
        teamId: query.teamId?.trim() || null,
        agentId: query.agentId?.trim() || null
      });

      const exceptions = rows.filter((row) => row.currentExceptionReason);
      const start = (page - 1) * pageSize;
      const items = exceptions.slice(start, start + pageSize);

      return {
        page,
        pageSize,
        total: exceptions.length,
        items
      };
    });
  });

  app.get("/api/admin/supervisor/conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      departmentId?: string;
      teamId?: string;
      agentId?: string;
      scope?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const scope = normalizeSupervisorWorkbenchScope(query.scope);

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await buildSupervisorConversationWorkbenchRows(trx, tenantId, {
        departmentId: query.departmentId?.trim() || null,
        teamId: query.teamId?.trim() || null,
        agentId: query.agentId?.trim() || null
      });
      const filteredRows = filterSupervisorConversationWorkbenchRows(rows, scope);
      const start = (page - 1) * pageSize;
      const items = filteredRows.slice(start, start + pageSize);

      return {
        page,
        pageSize,
        total: filteredRows.length,
        scope,
        items
      };
    });
  });

  app.get("/api/admin/supervisor/agents", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      await presenceService.refreshTenantPresenceStates(trx, tenantId);

      const activeConversations = trx("conversations")
        .where({ tenant_id: tenantId, status: "human_active", current_handler_type: "human" })
        .whereNotNull("current_handler_id")
        .groupBy("current_handler_id")
        .select("current_handler_id")
        .count<{ current_handler_id: string; active_count: string }[]>("conversation_id as active_count")
        .as("ac");

      const rows = await trx("agent_profiles as ap")
        .join("tenant_memberships as tm", function joinMembership() {
          this.on("tm.membership_id", "=", "ap.membership_id").andOn("tm.tenant_id", "=", "ap.tenant_id");
        })
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .leftJoin(activeConversations, function joinActiveConversations() {
          this.on(trx.raw("ac.current_handler_id::uuid"), "=", trx.ref("ap.agent_id"));
        })
        .where("ap.tenant_id", tenantId)
        .groupBy("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email", "ac.active_count")
        .select("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email")
        .select("ac.active_count")
        .orderBy("ap.display_name", "asc") as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        agentId: row.agent_id,
        displayName: row.display_name,
        email: row.email,
        status: row.presence_state,
        lastSeenAt: row.last_heartbeat_at ? toIsoString(row.last_heartbeat_at) : null,
        activeConversations: Number((row as { active_count?: string }).active_count ?? 0)
      }));
    });
  });

  app.post("/api/admin/supervisor/conversations/:conversationId/intervene", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { conversationId } = req.params as { conversationId: string };
    const body = req.body as { text?: string };
    const text = body.text?.trim();
    if (!text) throw app.httpErrors.badRequest("text is required");

    const conversation = await withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("conversation_id", "channel_id", "channel_type")
        .first<{ conversation_id: string; channel_id: string; channel_type: string }>();
      if (!row) throw app.httpErrors.notFound("Conversation not found");

      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "supervisor_intervened",
        actor_type: "supervisor",
        actor_id: actorId,
        payload: { textPreview: text.slice(0, 120) }
      });
      return row;
    });

    await outboundQueue.add(
      "send-outbound",
      {
        tenantId,
        conversationId,
        channelId: conversation.channel_id,
        channelType: conversation.channel_type,
        message: { text, agentId: null }
      },
      { removeOnComplete: 100, removeOnFail: 50 }
    );

    return { queued: true };
  });

  app.post("/api/admin/supervisor/conversations/:conversationId/transfer", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { conversationId } = req.params as { conversationId: string };
    const body = req.body as { targetAgentId?: string };
    const targetAgentId = body.targetAgentId?.trim();
    if (!targetAgentId) throw app.httpErrors.badRequest("targetAgentId is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles")
        .where({ tenant_id: tenantId, agent_id: targetAgentId })
        .select("agent_id")
        .first();
      if (!agent) throw app.httpErrors.notFound("Target agent not found");

      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id", "current_handler_type", "current_handler_id", "current_segment_id", "channel_type", "channel_id")
        .first<{
          customer_id: string;
          current_handler_type: string | null;
          current_handler_id: string | null;
          current_segment_id: string | null;
          channel_type: string;
          channel_id: string;
        } | undefined>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");
      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        segmentId: conversation.current_segment_id,
        triggerType: "supervisor_transfer",
        triggerActorType: "supervisor",
        triggerActorId: actorId,
        decisionType: "manual_transition",
        channelType: conversation.channel_type,
        channelId: conversation.channel_id,
        decisionSummary: { toOwnerType: "human", targetAgentId },
        decisionReason: "supervisor-transfer"
      });

      const teamContext = await getPrimaryTeamContext(trx, tenantId, targetAgentId);

      const affected = await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          department_id: teamContext.departmentId,
          team_id: teamContext.teamId,
          assigned_agent_id: targetAgentId,
          handoff_required: false,
          handoff_reason: null,
          status: "assigned",
          assignment_strategy: "manual",
          assignment_reason: "supervisor-transfer",
          updated_at: trx.fn.now()
        });
      if (!affected) {
        await trx("queue_assignments").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          department_id: teamContext.departmentId,
          team_id: teamContext.teamId,
          assigned_agent_id: targetAgentId,
          status: "assigned",
          assignment_strategy: "manual",
          assignment_reason: "supervisor-transfer",
          priority: 100
        });
      }

      const currentCase = await conversationCaseService.getOrCreateActiveCase(trx, {
        tenantId,
        conversationId,
        customerId: conversation.customer_id
      });

      await ownershipService.applyTransition(trx, {
        type: "activate_human_owner",
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        caseId: currentCase.caseId,
        agentId: targetAgentId,
        reason: "supervisor-transfer",
        caseStatus: "in_progress"
      });
      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "supervisor_transferred",
        actor_type: "supervisor",
        actor_id: actorId,
        payload: { targetAgentId }
      });
      const after = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("current_segment_id")
        .first<{ current_segment_id: string | null } | undefined>();
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        executionId,
        transitionType: "supervisor_transfer",
        actorType: "supervisor",
        actorId,
        fromOwnerType: conversation.current_handler_type,
        fromOwnerId: conversation.current_handler_id,
        fromSegmentId: conversation.current_segment_id,
        toOwnerType: "human",
        toOwnerId: targetAgentId,
        toSegmentId: after?.current_segment_id ?? null,
        reason: "supervisor-transfer"
      });
      return { success: true, conversationId, targetAgentId };
    });
  });

  app.post("/api/admin/supervisor/conversations/:conversationId/force-close", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { conversationId } = req.params as { conversationId: string };
    const body = req.body as { note?: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id")
        .first<{ customer_id: string } | undefined>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");

      await conversationSegmentService.closeCurrentSegment(trx, {
        tenantId,
        conversationId,
        status: "resolved",
        reason: "supervisor-force-close"
      });

      await ownershipService.applyTransition(trx, {
        type: "resolve_conversation",
        tenantId,
        conversationId,
        status: "resolved",
        finalOwnerType: "system",
        finalOwnerId: null,
        resolvedByAgentId: null
      });
      await markCustomerMessagesRead(tenantId, conversationId, trx);
      await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          status: "resolved",
          handoff_required: false,
          handoff_reason: null,
          updated_at: trx.fn.now()
        });
      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "supervisor_force_closed",
        actor_type: "supervisor",
        actor_id: actorId,
        payload: { note: body.note?.trim() || null }
      });
      return { success: true, conversationId };
    });
  });

  app.get("/api/admin/ai-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = (req.query as {
      aiAgentId?: string;
      status?: string;
      datePreset?: string;
      from?: string;
      to?: string;
    } | undefined) ?? {};
    const aiAgentId = query.aiAgentId?.trim();
    const status = query.status?.trim();
    const dateRange = resolveDateRange({
      preset: query.datePreset,
      from: query.from,
      to: query.to,
      timezone: "Asia/Jakarta"
    });

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("queue_assignments as qa")
        .join("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "qa.conversation_id").andOn("c.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("tenant_ai_agents as ai", function joinAiAgent() {
          this.on("ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("ai.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "qa.assigned_agent_id").andOn("ap.tenant_id", "=", "qa.tenant_id");
        })
        .where("qa.tenant_id", tenantId)
        .whereNotNull("qa.assigned_ai_agent_id")
        .modify((builder) => {
          if (aiAgentId) builder.where("qa.assigned_ai_agent_id", aiAgentId);
          if (status === "handoff_required") builder.where("qa.handoff_required", true);
          else if (status === "transferred") builder.where("c.current_handler_type", "human");
          else if (status) builder.where("c.status", status);
          builder.where((dateBuilder) => {
            dateBuilder
              .whereBetween("c.last_message_at", [dateRange.startIso, dateRange.endIso])
              .orWhereBetween("qa.updated_at", [dateRange.startIso, dateRange.endIso]);
          });
        })
        .select(
          "qa.assignment_id",
          "qa.conversation_id",
          "qa.assigned_ai_agent_id",
          "ai.name as ai_agent_name",
          "qa.assigned_agent_id",
          "ap.display_name as assigned_agent_name",
          "qa.handoff_required",
          "qa.handoff_reason",
          "qa.last_ai_response_at",
          "qa.updated_at as assignment_updated_at",
          "c.status as conversation_status",
          "c.current_handler_type",
          "c.last_message_preview",
          "c.last_message_at",
          "c.channel_type",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref",
          "cu.tier as customer_tier"
        )
        .orderBy("qa.updated_at", "desc");

      const tracesByConversation = await getLatestAITracesByConversation(
        trx,
        tenantId,
        rows.map((row) => String(row.conversation_id))
      );

      return {
        items: rows.map((row) => ({
          ...deriveAIRisk({
            handoffRequired: Boolean(row.handoff_required),
            handoffReason: (row.handoff_reason as string | null) ?? null,
            trace: tracesByConversation.get(String(row.conversation_id)) ?? null
          }),
          assignmentId: row.assignment_id,
          conversationId: row.conversation_id,
          aiAgentId: row.assigned_ai_agent_id,
          aiAgentName: row.ai_agent_name ?? null,
          conversationStatus: row.conversation_status,
          currentHandlerType: row.current_handler_type ?? null,
          assignedAgentId: row.assigned_agent_id ?? null,
          assignedAgentName: row.assigned_agent_name ?? null,
          handoffRequired: Boolean(row.handoff_required),
          handoffReason: row.handoff_reason ?? null,
          customerName: row.customer_name ?? null,
          customerRef: row.customer_ref ?? null,
          customerTier: row.customer_tier ?? null,
          channelType: row.channel_type,
          lastMessagePreview: row.last_message_preview ?? null,
          lastMessageAt: row.last_message_at ? toIsoString(row.last_message_at as string) : null,
          lastAiResponseAt: row.last_ai_response_at ? toIsoString(row.last_ai_response_at as string) : null,
          updatedAt: toIsoString(row.assignment_updated_at as string)
        }))
      };
    });
  });

  app.get("/api/admin/ai-conversations/:conversationId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const conversation = await trx("conversations as c")
        .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
          this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("tenant_ai_agents as ai", function joinAiAgent() {
          this.on("ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("ai.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "qa.assigned_agent_id").andOn("ap.tenant_id", "=", "qa.tenant_id");
        })
        .where({ "c.tenant_id": tenantId, "c.conversation_id": conversationId })
        .select(
          "c.conversation_id",
          "c.status",
          "c.channel_type",
          "c.current_handler_type",
          "c.last_message_preview",
          "c.last_message_at",
          "cu.display_name as customer_name",
          "cu.external_ref as customer_ref",
          "cu.tier as customer_tier",
          "cu.language as customer_language",
          "qa.assigned_ai_agent_id",
          "ai.name as ai_agent_name",
          "qa.assigned_agent_id",
          "ap.display_name as assigned_agent_name",
          "qa.handoff_required",
          "qa.handoff_reason",
          "qa.last_ai_response_at"
        )
        .first<Record<string, unknown>>();

      if (!conversation) throw app.httpErrors.notFound("Conversation not found");

      const [messages, traces] = await Promise.all([
        trx("messages")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .select("message_id", "direction", "sender_type", "message_type", "content", "created_at")
          .orderBy("created_at", "asc")
          .limit(200),
        trx("ai_traces")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .select("trace_id", "supervisor", "steps", "skills_called", "handoff_reason", "error", "total_duration_ms", "created_at")
          .orderBy("created_at", "desc")
          .limit(20)
      ]);

      const latestTrace = traces[0]
        ? {
            handoffReason: (traces[0].handoff_reason as string | null) ?? null,
            error: (traces[0].error as string | null) ?? null,
            steps: parseJsonValue(traces[0].steps)
          }
        : null;
      const risk = deriveAIRisk({
        handoffRequired: Boolean(conversation.handoff_required),
        handoffReason: (conversation.handoff_reason as string | null) ?? null,
        trace: latestTrace
      });

      return {
        conversation: {
          conversationId: conversation.conversation_id,
          status: conversation.status,
          channelType: conversation.channel_type,
          currentHandlerType: conversation.current_handler_type ?? null,
          customerName: conversation.customer_name ?? null,
          customerRef: conversation.customer_ref ?? null,
          customerTier: conversation.customer_tier ?? null,
          customerLanguage: conversation.customer_language ?? null,
          aiAgentId: conversation.assigned_ai_agent_id ?? null,
          aiAgentName: conversation.ai_agent_name ?? null,
          assignedAgentId: conversation.assigned_agent_id ?? null,
          assignedAgentName: conversation.assigned_agent_name ?? null,
          handoffRequired: Boolean(conversation.handoff_required),
          handoffReason: conversation.handoff_reason ?? null,
          lastMessagePreview: conversation.last_message_preview ?? null,
          lastMessageAt: conversation.last_message_at ? toIsoString(conversation.last_message_at as string) : null,
          lastAiResponseAt: conversation.last_ai_response_at ? toIsoString(conversation.last_ai_response_at as string) : null,
          riskLevel: risk.riskLevel,
          riskReasons: risk.riskReasons
        },
        messages: messages.map((row) => ({
          messageId: row.message_id,
          direction: row.direction,
          senderType: row.sender_type,
          messageType: row.message_type,
          content: row.content,
          preview: extractMessagePreview(row.content),
          createdAt: toIsoString(row.created_at as string)
        })),
        traces: traces.map((row) => ({
          traceId: row.trace_id,
          supervisor: row.supervisor,
          steps: parseJsonValue(row.steps),
          skillsCalled: parseJsonValue(row.skills_called),
          handoffReason: row.handoff_reason ?? null,
          error: row.error ?? null,
          totalDurationMs: row.total_duration_ms,
          createdAt: toIsoString(row.created_at as string)
        }))
      };
    });
  });

  app.post("/api/admin/supervisor/broadcast", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { text?: string };
    const text = body.text?.trim();
    if (!text) throw app.httpErrors.badRequest("text is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const onlineAgents = await trx("agent_profiles")
        .where({ tenant_id: tenantId, status: "online" })
        .count<{ cnt: string }>("agent_id as cnt")
        .first();

      return {
        success: true,
        actorId,
        message: text,
        recipients: Number(onlineAgents?.cnt ?? 0)
      };
    });
  });

  app.get("/api/admin/permission-policies", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("permission_policies")
        .select("policy_id", "role", "permission_key", "is_allowed", "updated_at")
        .where({ tenant_id: tenantId })
        .orderBy("role", "asc")
        .orderBy("permission_key", "asc");

      return {
        roles: APP_ROLES,
        permissions: PERMISSION_KEYS,
        items: rows.map((row) => ({
          policyId: row.policy_id,
          role: row.role,
          permissionKey: row.permission_key,
          isAllowed: row.is_allowed,
          updatedAt: row.updated_at
        }))
      };
    });
  });

  app.put("/api/admin/permission-policies", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorIdentityId = req.auth?.sub;
    if (!tenantId || !actorIdentityId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      updates?: Array<{ role?: string; permissionKey?: string; isAllowed?: boolean }>;
    };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length === 0) throw app.httpErrors.badRequest("updates is required");

    return withTenantTransaction(tenantId, async (trx) => {
      for (const item of updates) {
        const role = normalizeRole(item.role);
        const permissionKey = normalizePermissionKey(item.permissionKey);
        if (!role || !permissionKey || typeof item.isAllowed !== "boolean") {
          throw app.httpErrors.badRequest("Invalid policy update item");
        }
        await trx("permission_policies")
          .insert({
            tenant_id: tenantId,
            role,
            permission_key: permissionKey,
            is_allowed: item.isAllowed,
            updated_by_identity_id: actorIdentityId
          })
          .onConflict(["tenant_id", "role", "permission_key"])
          .merge({
            is_allowed: item.isAllowed,
            updated_by_identity_id: actorIdentityId,
            updated_at: trx.fn.now()
          });
      }
      return { updated: true, count: updates.length };
    });
  });

  // ── Tenant Marketplace (Catalog / Install Governance) ──────────────────────

  app.get("/api/admin/marketplace/catalog", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { tier?: string; search?: string; status?: string };
    const status = query.status?.trim() || "published";
    const tiers = query.tier?.trim() ? [query.tier.trim()] : ["official", "private", "third_party"];

    return withTenantTransaction(tenantId, async (trx) => {
      const skills = await trx("marketplace_skills as s")
        .select("s.skill_id", "s.slug", "s.name", "s.description", "s.tier", "s.status", "s.latest_version", "s.owner_tenant_id")
        .modify((qb) => {
          qb.where((scope) => {
            scope.whereIn("s.tier", tiers.filter((t) => t !== "private"));
            if (tiers.includes("private")) {
              scope.orWhere((privateScope) => privateScope.where("s.tier", "private").andWhere("s.owner_tenant_id", tenantId));
            }
          });
          if (status) qb.andWhere("s.status", status);
          if (query.search?.trim()) {
            const like = `%${query.search.trim()}%`;
            qb.andWhere((searchScope) => searchScope.whereILike("s.name", like).orWhereILike("s.slug", like).orWhereILike("s.description", like));
          }
        })
        .orderBy("s.tier", "asc")
        .orderBy("s.name", "asc");

      const skillIds = skills.map((row: Record<string, unknown>) => row.skill_id as string);
      if (skillIds.length === 0) return { skills: [] };

      const [releases, installs] = await Promise.all([
        trx("marketplace_skill_releases")
          .select("release_id", "skill_id", "version", "published_at")
          .whereIn("skill_id", skillIds)
          .andWhere("is_active", true)
          .orderBy("published_at", "desc"),
        trx("marketplace_skill_installs")
          .select("install_id", "skill_id", "release_id", "status")
          .where({ tenant_id: tenantId })
          .whereIn("skill_id", skillIds)
      ]);

      const latestReleaseBySkill = new Map<string, { releaseId: string; version: string; publishedAt: string }>();
      for (const release of releases) {
        const sid = release.skill_id as string;
        if (!latestReleaseBySkill.has(sid)) {
          latestReleaseBySkill.set(sid, {
            releaseId: release.release_id as string,
            version: release.version as string,
            publishedAt: new Date(release.published_at as string).toISOString()
          });
        }
      }

      const installBySkill = new Map(
        installs.map((row) => [
          row.skill_id as string,
          {
            installId: row.install_id as string,
            releaseId: row.release_id as string,
            status: row.status as "active" | "disabled"
          }
        ])
      );

      return {
        skills: skills.map((row: Record<string, unknown>) => ({
          skillId: row.skill_id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          tier: row.tier,
          status: row.status,
          latestVersion: row.latest_version,
          latestRelease: latestReleaseBySkill.get(row.skill_id as string) ?? null,
          installed: installBySkill.get(row.skill_id as string) ?? null
        }))
      };
    });
  });

  app.get("/api/admin/marketplace/installs", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("marketplace_skill_installs as mi")
        .join("marketplace_skills as s", "s.skill_id", "mi.skill_id")
        .join("marketplace_skill_releases as r", "r.release_id", "mi.release_id")
        .select(
          "mi.install_id",
          "mi.skill_id",
          "s.name as skill_name",
          "s.slug as skill_slug",
          "s.tier as skill_tier",
          "mi.release_id",
          "r.version as release_version",
          "mi.status",
          "mi.enabled_modules",
          "mi.enabled_skill_groups",
          "mi.enabled_for_ai",
          "mi.enabled_for_agent",
          "mi.rate_limit_per_minute",
          "mi.ai_whitelisted",
          "mi.installed_at",
          "mi.updated_at"
        )
        .where({ "mi.tenant_id": tenantId })
        .orderBy("mi.installed_at", "desc");

      return {
        installs: rows.map((row) => ({
          installId: row.install_id,
          skillId: row.skill_id,
          skillName: row.skill_name,
          skillSlug: row.skill_slug,
          skillTier: row.skill_tier,
          releaseId: row.release_id,
          releaseVersion: row.release_version,
          status: row.status,
          enabledModules: parseJsonStringArray(row.enabled_modules),
          enabledSkillGroups: parseJsonStringArray(row.enabled_skill_groups),
          enabledForAi: Boolean(row.enabled_for_ai),
          enabledForAgent: Boolean(row.enabled_for_agent),
          rateLimitPerMinute: Number(row.rate_limit_per_minute ?? 60),
          aiWhitelisted: Boolean(row.ai_whitelisted ?? true),
          installedAt: new Date(row.installed_at as string).toISOString(),
          updatedAt: new Date(row.updated_at as string).toISOString()
        }))
      };
    });
  });

  app.post("/api/admin/marketplace/catalog/:skillId/install", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { skillId } = req.params as { skillId: string };
    const body = req.body as { releaseId?: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const skill = await trx("marketplace_skills")
        .where({ skill_id: skillId })
        .select("skill_id", "tier", "owner_tenant_id", "status")
        .first<{ skill_id: string; tier: string; owner_tenant_id: string | null; status: string }>();

      if (!skill) throw app.httpErrors.notFound("Marketplace skill not found");
      if (skill.status !== "published") throw app.httpErrors.conflict("Only published skills can be installed");
      if (skill.tier === "private" && skill.owner_tenant_id !== tenantId) {
        throw app.httpErrors.forbidden("Private skill can only be installed by the owner tenant");
      }

      const release = body.releaseId
        ? await trx("marketplace_skill_releases")
            .where({ release_id: body.releaseId, skill_id: skillId, is_active: true })
            .select("release_id", "version")
            .first<{ release_id: string; version: string }>()
        : await trx("marketplace_skill_releases")
            .where({ skill_id: skillId, is_active: true })
            .orderBy("published_at", "desc")
            .select("release_id", "version")
            .first<{ release_id: string; version: string }>();

      if (!release) throw app.httpErrors.notFound("Active release not found");

      const [installed] = await trx("marketplace_skill_installs")
        .insert({
          tenant_id: tenantId,
          skill_id: skillId,
          release_id: release.release_id,
          status: "active",
          installed_by_identity_id: req.auth?.sub ?? null,
          enabled_modules: JSON.stringify([]),
          enabled_skill_groups: JSON.stringify([]),
          enabled_for_ai: true,
          enabled_for_agent: true,
          rate_limit_per_minute: 60,
          ai_whitelisted: true
        })
        .onConflict(["tenant_id", "skill_id"])
        .merge({
          release_id: release.release_id,
          status: "active",
          updated_at: trx.fn.now()
        })
        .returning(["install_id", "tenant_id", "skill_id", "release_id", "status", "installed_at", "updated_at"]);

      return {
        installId: installed.install_id,
        tenantId: installed.tenant_id,
        skillId: installed.skill_id,
        releaseId: installed.release_id,
        releaseVersion: release.version,
        status: installed.status,
        installedAt: new Date(installed.installed_at as string).toISOString(),
        updatedAt: new Date(installed.updated_at as string).toISOString()
      };
    });
  });

  app.patch("/api/admin/marketplace/installs/:installId/governance", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { installId } = req.params as { installId: string };
    const body = req.body as {
      status?: "active" | "disabled";
      releaseId?: string;
      enabledModules?: string[];
      enabledSkillGroups?: string[];
      enabledForAi?: boolean;
      enabledForAgent?: boolean;
      rateLimitPerMinute?: number;
      aiWhitelisted?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("marketplace_skill_installs")
        .where({ install_id: installId, tenant_id: tenantId })
        .select("install_id", "skill_id")
        .first<{ install_id: string; skill_id: string }>();

      if (!existing) throw app.httpErrors.notFound("Marketplace install not found");

      if (body.enabledSkillGroups && body.enabledSkillGroups.length > 0) {
        const rows = await trx("skill_groups")
          .where({ tenant_id: tenantId })
          .whereIn("skill_group_id", body.enabledSkillGroups)
          .count("skill_group_id as cnt")
          .first<{ cnt: string }>();
        if (Number(rows?.cnt ?? 0) !== body.enabledSkillGroups.length) {
          throw app.httpErrors.badRequest("enabledSkillGroups contains unknown group id");
        }
      }

      if (body.releaseId) {
        const release = await trx("marketplace_skill_releases")
          .where({ release_id: body.releaseId, skill_id: existing.skill_id, is_active: true })
          .first();
        if (!release) throw app.httpErrors.badRequest("releaseId is invalid for this install");
      }

      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.releaseId !== undefined) updates.release_id = body.releaseId;
      if (body.enabledModules !== undefined) updates.enabled_modules = JSON.stringify(normalizeStringArray(body.enabledModules));
      if (body.enabledSkillGroups !== undefined) updates.enabled_skill_groups = JSON.stringify(normalizeStringArray(body.enabledSkillGroups));
      if (body.enabledForAi !== undefined) updates.enabled_for_ai = body.enabledForAi;
      if (body.enabledForAgent !== undefined) updates.enabled_for_agent = body.enabledForAgent;
      if (body.rateLimitPerMinute !== undefined) {
        updates.rate_limit_per_minute = Math.max(1, Math.min(10000, Math.floor(body.rateLimitPerMinute)));
      }
      if (body.aiWhitelisted !== undefined) updates.ai_whitelisted = body.aiWhitelisted;

      const [updated] = await trx("marketplace_skill_installs")
        .where({ install_id: installId, tenant_id: tenantId })
        .update(updates)
        .returning([
          "install_id",
          "tenant_id",
          "skill_id",
          "release_id",
          "status",
          "enabled_modules",
          "enabled_skill_groups",
          "enabled_for_ai",
          "enabled_for_agent",
          "rate_limit_per_minute",
          "ai_whitelisted",
          "updated_at"
        ]);

      return {
        installId: updated.install_id,
        tenantId: updated.tenant_id,
        skillId: updated.skill_id,
        releaseId: updated.release_id,
        status: updated.status,
        enabledModules: parseJsonStringArray(updated.enabled_modules),
        enabledSkillGroups: parseJsonStringArray(updated.enabled_skill_groups),
        enabledForAi: Boolean(updated.enabled_for_ai),
        enabledForAgent: Boolean(updated.enabled_for_agent),
        rateLimitPerMinute: Number(updated.rate_limit_per_minute ?? 60),
        aiWhitelisted: Boolean(updated.ai_whitelisted ?? true),
        updatedAt: new Date(updated.updated_at as string).toISOString()
      };
    });
  });

  app.delete("/api/admin/marketplace/installs/:installId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { installId } = req.params as { installId: string };
    return withTenantTransaction(tenantId, async (trx) => {
      const deleted = await trx("marketplace_skill_installs")
        .where({ install_id: installId, tenant_id: tenantId })
        .del();

      if (!deleted) throw app.httpErrors.notFound("Marketplace install not found");
      return { success: true, installId };
    });
  });

  // ── Analytics: daily event report ────────────────────────────────────────────
  // GET /api/admin/analytics/daily?date=YYYY-MM-DD
  // Returns a per-event-type breakdown for the given calendar date.
  // Falls back to an empty report when ClickHouse is unavailable.
  app.get("/api/admin/analytics/daily", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { date?: string };
    // Default to today (UTC date) when no date param provided
    const date = query.date?.match(/^\d{4}-\d{2}-\d{2}$/)
      ? query.date
      : new Date().toISOString().slice(0, 10);

    return getDailyReport(tenantId, date);
  });

  app.get("/api/admin/conversation-cases", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as {
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const status = query.status?.trim();

    return withTenantTransaction(tenantId, async (trx) => {
      const base = trx("conversation_cases as cc")
        .join("conversations as c", function joinConversation() {
          this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
          this.on("qa.conversation_id", "=", "cc.conversation_id").andOn("qa.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "cc.customer_id").andOn("cu.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as ap", function joinOwnerAgent() {
          this.on("ap.agent_id", "=", "cc.current_owner_id").andOn("ap.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
        .leftJoin("tenant_ai_agents as aia", function joinOwnerAi() {
          this.on("aia.ai_agent_id", "=", "cc.current_owner_id").andOn("aia.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as fap", function joinFinalOwnerAgent() {
          this.on("fap.agent_id", "=", "cc.final_owner_id").andOn("fap.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("tenant_memberships as ftm", "ftm.membership_id", "fap.membership_id")
        .leftJoin("tenant_ai_agents as faia", function joinFinalOwnerAi() {
          this.on("faia.ai_agent_id", "=", "cc.final_owner_id").andOn("faia.tenant_id", "=", "cc.tenant_id");
        })
        .leftJoin("agent_profiles as rap", function joinReservedAgent() {
          this.on("rap.agent_id", "=", "qa.assigned_agent_id").andOn("rap.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("tenant_memberships as rtm", "rtm.membership_id", "rap.membership_id")
        .leftJoin("tenant_ai_agents as raia", function joinReservedAi() {
          this.on("raia.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("raia.tenant_id", "=", "qa.tenant_id");
        })
        .leftJoin("tenant_ai_agents as chaia", function joinCurrentHandlerAi() {
          this.on(trx.raw("chaia.ai_agent_id::text"), "=", trx.ref("c.current_handler_id"))
            .andOn("chaia.tenant_id", "=", "c.tenant_id");
        })
        .where("cc.tenant_id", tenantId)
        .modify((qb) => {
          if (status) qb.andWhere("cc.status", status);
          if (search) {
            const like = `%${search}%`;
            qb.andWhere((scope) => {
              scope
                .whereILike("cc.case_id", like)
                .orWhereILike("cc.title", like)
                .orWhereILike("cc.summary", like)
                .orWhereILike("cu.display_name", like)
                .orWhereILike("cu.external_ref", like)
                .orWhereILike("c.conversation_id", like);
            });
          }
        });

      const [rows, countRow] = await Promise.all([
        base
          .clone()
          .select(
            "cc.case_id",
            "cc.conversation_id",
            "cc.status",
            "cc.case_type",
            "cc.title",
            "cc.summary",
            "cc.current_owner_type",
            "cc.current_owner_id",
            "cc.final_owner_type",
            "cc.final_owner_id",
            "cc.resolved_by_agent_id",
            "c.current_handler_type",
            "c.current_handler_id",
            "qa.assigned_agent_id",
            "qa.assigned_ai_agent_id",
            "cc.opened_at",
            "cc.closed_at",
            "cc.last_activity_at",
            "c.channel_type",
            "cu.display_name as customer_name",
            "cu.external_ref as customer_ref",
            "tm.display_name as owner_agent_name",
            "aia.name as owner_ai_name",
            "ftm.display_name as final_owner_agent_name",
            "faia.name as final_owner_ai_name",
            "rtm.display_name as reserved_agent_name",
            "raia.name as reserved_ai_name",
            "chaia.name as current_handler_ai_name"
          )
          .orderBy("cc.last_activity_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        base.clone().count<{ cnt: string }>("cc.case_id as cnt").first()
      ]) as [Array<Record<string, unknown>>, { cnt?: string } | undefined];

      return {
        page,
        pageSize,
        total: Number(countRow?.cnt ?? 0),
        items: rows.map((row) => {
          const effectiveOwner = resolveConversationCaseEffectiveOwner(row);
          return {
            caseId: row.case_id,
            conversationId: row.conversation_id,
            status: row.status,
            caseType: row.case_type ?? null,
            title: row.title ?? null,
            summary: row.summary ?? null,
            channelType: row.channel_type,
            customerName: row.customer_name ?? null,
            customerRef: row.customer_ref ?? null,
            ownerType: effectiveOwner.ownerType,
            ownerId: effectiveOwner.ownerId,
            ownerName: effectiveOwner.ownerName,
            openedAt: toIsoString(row.opened_at),
            closedAt: row.closed_at ? toIsoString(row.closed_at) : null,
            lastActivityAt: toIsoString(row.last_activity_at)
          };
        })
      };
    });
  });
}

function readStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function extractMessagePreview(content: unknown): string {
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as unknown;
      return extractMessagePreview(parsed);
    } catch {
      return content;
    }
  }

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
    if (record.media && typeof record.media === "object") return "[media]";
  }

  return "-";
}

type LatestAITrace = {
  handoffReason: string | null;
  error: string | null;
  steps: unknown;
};

async function getLatestAITracesByConversation(
  trx: Knex.Transaction,
  tenantId: string,
  conversationIds: string[]
): Promise<Map<string, LatestAITrace>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await trx("ai_traces")
    .where({ tenant_id: tenantId })
    .whereIn("conversation_id", conversationIds)
    .select("conversation_id", "steps", "handoff_reason", "error", "created_at")
    .orderBy("conversation_id", "asc")
    .orderBy("created_at", "desc");

  const latest = new Map<string, LatestAITrace>();
  for (const row of rows) {
    const conversationId = String(row.conversation_id);
    if (latest.has(conversationId)) continue;
    latest.set(conversationId, {
      handoffReason: (row.handoff_reason as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      steps: parseJsonValue(row.steps)
    });
  }

  return latest;
}

function deriveAIRisk(input: {
  handoffRequired: boolean;
  handoffReason: string | null;
  trace: LatestAITrace | null;
}): { riskLevel: "normal" | "attention" | "high"; riskReasons: string[] } {
  const reasons: string[] = [];
  let high = false;
  let attention = false;

  const handoffReason = (input.handoffReason ?? input.trace?.handoffReason ?? "").toLowerCase();
  const traceError = (input.trace?.error ?? "").trim();
  const intent = extractTraceIntent(input.trace?.steps);

  if (input.handoffRequired) {
    high = true;
    reasons.push("AI 已请求转人工");
  }

  if (traceError) {
    high = true;
    reasons.push("AI 执行异常");
  }

  if (matchesRiskReason(handoffReason, ["complaint", "angry", "refund", "dispute", "legal", "abuse", "escalat"])) {
    high = true;
    reasons.push("会话涉及敏感投诉或争议");
  }

  if (matchesRiskReason(handoffReason, ["unknown", "unclear", "blocked", "policy", "no_active_ai_agent"])) {
    attention = true;
    reasons.push("AI 判断不稳定或能力受限");
  }

  if (intent === "unknown") {
    attention = true;
    reasons.push("意图识别不明确");
  }

  return {
    riskLevel: high ? "high" : attention ? "attention" : "normal",
    riskReasons: Array.from(new Set(reasons))
  };
}

function extractTraceIntent(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const record = step as Record<string, unknown>;
    if (record.step === "intent" && typeof record.output === "string") {
      return record.output.toLowerCase();
    }
  }
  return null;
}

function matchesRiskReason(reason: string, keywords: string[]): boolean {
  if (!reason) return false;
  return keywords.some((keyword) => reason.includes(keyword));
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>);
}

function buildDispatchSuggestions(
  executions: Array<Record<string, unknown>>,
  transitions: Array<Record<string, unknown>>,
  teamCandidates: Array<Record<string, unknown>>
) {
  const aiAgents: Array<{
    key: string;
    severity: "high" | "medium" | "low";
    category: string;
    title: string;
    summary: string;
    metrics: Record<string, number | string>;
    recommendation: string;
  }> = [];
  const teams: typeof aiAgents = [];
  const customerSegments: typeof aiAgents = [];

  const byRule = new Map<string, Array<Record<string, unknown>>>();
  for (const row of executions) {
    const ruleName = typeof row.routing_rule_name === "string" && row.routing_rule_name.trim()
      ? row.routing_rule_name.trim()
      : "未命名默认规则";
    const bucket = byRule.get(ruleName) ?? [];
    bucket.push(row);
    byRule.set(ruleName, bucket);
  }

  const transitionsByExecution = new Map<string, Array<Record<string, unknown>>>();
  for (const row of transitions) {
    const executionId = typeof row.execution_ref === "string" ? row.execution_ref : "";
    if (!executionId) continue;
    const bucket = transitionsByExecution.get(executionId) ?? [];
    bucket.push(row);
    transitionsByExecution.set(executionId, bucket);
  }

  const aiBuckets = new Map<string, Array<Record<string, unknown>>>();
  const customerBuckets = new Map<string, Array<Record<string, unknown>>>();
  const teamCandidateBuckets = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      total: number;
      accepted: number;
      rejected: number;
      rejectReasons: Map<string, number>;
      noEligibleAgent: number;
    }
  >();

  for (const row of executions) {
    const summary = parseJsonRecord(row.decision_summary);
    const aiAgentId = typeof summary.aiAgentId === "string" ? summary.aiAgentId : null;
    const teamId = typeof summary.teamId === "string" ? summary.teamId : null;
    const customerKey = `${typeof row.customer_tier === "string" ? row.customer_tier : "unknown"}::${typeof row.channel_type === "string" ? row.channel_type : "unknown"}`;

    if (aiAgentId) {
      const bucket = aiBuckets.get(aiAgentId) ?? [];
      bucket.push(row);
      aiBuckets.set(aiAgentId, bucket);
    }

    const customerBucket = customerBuckets.get(customerKey) ?? [];
    customerBucket.push(row);
    customerBuckets.set(customerKey, customerBucket);
  }

  const normalizedTeamCandidates = teamCandidates.length > 0
    ? teamCandidates
    : executions.flatMap((row) => {
        const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
        return parseJsonArray(row.candidates)
          .filter((candidate) => candidate.candidateType === "team")
          .map((candidate) => ({
            executionRef: executionId,
            candidate_id: candidate.candidateId,
            candidate_label: candidate.candidateLabel,
            accepted: candidate.accepted,
            reject_reason: candidate.rejectReason,
            details: candidate.details ?? {}
          }));
      });

  for (const row of normalizedTeamCandidates) {
    const teamId = typeof row.candidate_id === "string" ? row.candidate_id : "";
    if (!teamId) continue;
    const teamName = typeof row.candidate_label === "string" && row.candidate_label.trim()
      ? row.candidate_label.trim()
      : teamId.slice(0, 8);
    const bucket = teamCandidateBuckets.get(teamId) ?? {
      teamId,
      teamName,
      total: 0,
      accepted: 0,
      rejected: 0,
      rejectReasons: new Map<string, number>(),
      noEligibleAgent: 0
    };
    bucket.total += 1;
    if (row.accepted) {
      bucket.accepted += 1;
    } else {
      bucket.rejected += 1;
      const rejectReason = typeof row.reject_reason === "string" && row.reject_reason.trim()
        ? row.reject_reason.trim()
        : "unknown";
      bucket.rejectReasons.set(rejectReason, (bucket.rejectReasons.get(rejectReason) ?? 0) + 1);
      if (
        rejectReason === "team_has_no_eligible_agent" ||
        rejectReason === "agent_on_break" ||
        rejectReason === "agent_not_scheduled" ||
        rejectReason === "outside_shift_window" ||
        rejectReason === "agent_concurrency_disabled" ||
        rejectReason === "agent_concurrency_full"
      ) {
        bucket.noEligibleAgent += 1;
      }
    }
    teamCandidateBuckets.set(teamId, bucket);
  }

  for (const [ruleName, rows] of byRule.entries()) {
    if (rows.length < 5) continue;

    const aiRows = rows.filter((row) => row.trigger_type === "ai_routing");
    const fallbackAi = aiRows.filter((row) => row.reason === "first_active_ai_agent").length;
    const noEligible = rows.filter((row) => row.reason === "no-eligible-agent").length;
    const manualTransferCount = rows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) =>
        transition.decision_type === "human_to_human_transfer" ||
        transition.decision_type === "supervisor_transfer"
      );
    }).length;
    const aiHandoffCount = aiRows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;

    if (noEligible / rows.length >= 0.25) {
      teams.push({
        key: `${ruleName}-capacity-gap`,
        severity: "high",
        category: "capacity",
        title: `规则 ${ruleName} 存在明显供给缺口`,
        summary: `该规则命中的会话中，有较高比例最终没有找到可分配人工。`,
        metrics: {
          totalExecutions: rows.length,
          noEligibleAgent: noEligible,
          ratio: Number((noEligible / rows.length).toFixed(2))
        },
        recommendation: "优先检查该规则关联的技能组、团队排班、presence 和并发上限，必要时扩大团队范围。"
      });
    }

    if (aiRows.length >= 5 && aiHandoffCount / aiRows.length >= 0.4) {
      aiAgents.push({
        key: `${ruleName}-ai-handoff`,
        severity: "medium",
        category: "ai_quality",
        title: `规则 ${ruleName} 的 AI 转人工比例偏高`,
        summary: `AI 已命中的会话里，较多最终仍然进入人工队列。`,
        metrics: {
          aiExecutions: aiRows.length,
          aiHandoff: aiHandoffCount,
          ratio: Number((aiHandoffCount / aiRows.length).toFixed(2))
        },
        recommendation: "检查该规则是否更适合 human_first，或替换更匹配的 AI 座席与提示词。"
      });
    }

    if (aiRows.length >= 5 && fallbackAi / aiRows.length >= 0.5) {
      aiAgents.push({
        key: `${ruleName}-ai-fallback`,
        severity: "medium",
        category: "routing",
        title: `规则 ${ruleName} 过度依赖 AI fallback`,
        summary: `多数 AI 路由没有命中明确的 AI 绑定，而是退回到默认 active AI。`,
        metrics: {
          aiExecutions: aiRows.length,
          fallbackAi,
          ratio: Number((fallbackAi / aiRows.length).toFixed(2))
        },
        recommendation: "为该规则明确配置 aiAgentId，避免不同 AI 能力混用导致结果不稳定。"
      });
    }

    if (manualTransferCount / rows.length >= 0.2) {
      teams.push({
        key: `${ruleName}-manual-transfer`,
        severity: "low",
        category: "ownership",
        title: `规则 ${ruleName} 的人工转移偏多`,
        summary: `进入该规则的会话后，较多又被人工二次转移。`,
        metrics: {
          totalExecutions: rows.length,
          manualTransfers: manualTransferCount,
          ratio: Number((manualTransferCount / rows.length).toFixed(2))
        },
        recommendation: "检查目标部门/团队是否过宽，或者技能组是否需要进一步细分，减少人工二次分流。"
      });
    }
  }

  for (const [aiAgentId, rows] of aiBuckets.entries()) {
    if (rows.length < 5) continue;
    const handoffCount = rows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;
    if (handoffCount / rows.length >= 0.45) {
      aiAgents.push({
        key: `${aiAgentId}-handoff-rate`,
        severity: "high",
        category: "ai_agent",
        title: `AI 座席 ${aiAgentId.slice(0, 8)} 转人工偏高`,
        summary: `该 AI 座席处理的会话里，较多最终仍然进入人工队列。`,
        metrics: {
          aiAgentId,
          executions: rows.length,
          aiHandoff: handoffCount,
          ratio: Number((handoffCount / rows.length).toFixed(2))
        },
        recommendation: "优先检查该 AI 座席的人设、提示词、适用场景，必要时缩小其可处理范围。"
      });
    }
  }

  for (const bucket of teamCandidateBuckets.values()) {
    if (bucket.total < 5 || bucket.rejected === 0) continue;
    const sortedReasons = [...bucket.rejectReasons.entries()].sort((a, b) => b[1] - a[1]);
    const [topRejectReason, topRejectCount] = sortedReasons[0] ?? ["unknown", 0];
    const topRejectRatio = topRejectCount / bucket.rejected;
    const noEligibleRatio = bucket.noEligibleAgent / bucket.total;

    if (noEligibleRatio >= 0.25) {
      teams.push({
        key: `${bucket.teamId}-capacity-gap`,
        severity: "high",
        category: "team_capacity",
        title: `团队 ${bucket.teamName} 经常因无可用座席被淘汰`,
        summary: `该团队进入候选范围后，较高比例因班次、休息或并发原因没有可接单座席。`,
        metrics: {
          teamId: bucket.teamId,
          candidateCount: bucket.total,
          noEligible: bucket.noEligibleAgent,
          ratio: Number(noEligibleRatio.toFixed(2)),
          topRejectReason
        },
        recommendation: describeTeamRejectRecommendation(topRejectReason)
      });
      continue;
    }

    if (topRejectReason === "team_not_selected" && topRejectRatio >= 0.6) {
      teams.push({
        key: `${bucket.teamId}-not-selected`,
        severity: "medium",
        category: "team_priority",
        title: `团队 ${bucket.teamName} 常进候选但很少最终命中`,
        summary: `该团队具备接单资格，但在团队层决策中大多被其他团队优先选走。`,
        metrics: {
          teamId: bucket.teamId,
          candidateCount: bucket.total,
          rejected: bucket.rejected,
          ratio: Number((bucket.rejected / bucket.total).toFixed(2)),
          topRejectReason
        },
        recommendation: "检查该团队的负载、主团队归属和规则范围，确认它是否应该承担更高优先级，或改为更明确的 team 定向规则。"
      });
    }
  }

  for (const [bucketKey, rows] of customerBuckets.entries()) {
    if (rows.length < 8) continue;
    const [tier, channel] = bucketKey.split("::");
    const aiRows = rows.filter((row) => row.trigger_type === "ai_routing");
    const aiHandoffCount = aiRows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;
    if (aiRows.length >= 5 && aiHandoffCount / aiRows.length >= 0.5) {
      customerSegments.push({
        key: `${bucketKey}-segment-ai`,
        severity: "medium",
        category: "customer_segment",
        title: `${tier} / ${channel} 客群 AI 转人工偏高`,
        summary: `这个客户等级和渠道组合下，AI 接待后仍然大量进入人工。`,
        metrics: {
          tier,
          channel,
          aiExecutions: aiRows.length,
          aiHandoff: aiHandoffCount,
          ratio: Number((aiHandoffCount / aiRows.length).toFixed(2))
        },
        recommendation: "评估该客群是否更适合 human_first，或为其单独配置更匹配的 AI 与规则。"
      });
    }
  }

  return {
    aiAgents: aiAgents.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8),
    teams: teams.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8),
    customerSegments: customerSegments.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8)
  };
}

function severityRank(value: "high" | "medium" | "low") {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function describeTeamRejectRecommendation(reason: string) {
  if (reason === "agent_on_break") {
    return "优先检查该团队 break 规则和高峰期休息安排，避免候选团队整体在关键时段失去可接单能力。";
  }
  if (reason === "agent_not_scheduled" || reason === "outside_shift_window") {
    return "优先检查该团队排班覆盖与规则时段是否匹配，必要时调整班次覆盖或收窄该规则的生效范围。";
  }
  if (reason === "agent_concurrency_disabled" || reason === "agent_concurrency_full") {
    return "优先检查该团队并发上限和实时负载，必要时提高并发配置或扩充同技能座席。";
  }
  return "优先检查该团队的排班、休息、presence 和并发配置，确认它在命中规则的时段内确实有可接单座席。";
}

function serializeRoutingRuleActions(value: unknown) {
  const normalized = normalizeRoutingRuleActions(value);
  return {
    executionMode: normalized.executionMode,
    humanTarget: {
      ...(normalized.humanTarget.departmentId ? { departmentId: normalized.humanTarget.departmentId } : {}),
      ...(normalized.humanTarget.departmentCode ? { departmentCode: normalized.humanTarget.departmentCode } : {}),
      ...(normalized.humanTarget.teamId ? { teamId: normalized.humanTarget.teamId } : {}),
      ...(normalized.humanTarget.teamCode ? { teamCode: normalized.humanTarget.teamCode } : {}),
      ...(normalized.humanTarget.skillGroupCode ? { skillGroupCode: normalized.humanTarget.skillGroupCode } : {}),
      ...(normalized.humanTarget.assignmentStrategy ? { assignmentStrategy: normalized.humanTarget.assignmentStrategy } : {})
    },
    aiTarget: {
      ...(normalized.aiTarget.aiAgentId ? { aiAgentId: normalized.aiTarget.aiAgentId } : {}),
      ...(normalized.aiTarget.assignmentStrategy ? { assignmentStrategy: normalized.aiTarget.assignmentStrategy } : {})
    },
    ...(normalized.overflowPolicy.humanToAiThresholdPct !== null ||
    normalized.overflowPolicy.aiToHumanThresholdPct !== null ||
    normalized.overflowPolicy.aiSoftConcurrencyLimit !== null
      ? {
          overflowPolicy: {
            ...(normalized.overflowPolicy.humanToAiThresholdPct !== null
              ? { humanToAiThresholdPct: normalized.overflowPolicy.humanToAiThresholdPct }
              : {}),
            ...(normalized.overflowPolicy.aiToHumanThresholdPct !== null
              ? { aiToHumanThresholdPct: normalized.overflowPolicy.aiToHumanThresholdPct }
              : {}),
            ...(normalized.overflowPolicy.aiSoftConcurrencyLimit !== null
              ? { aiSoftConcurrencyLimit: normalized.overflowPolicy.aiSoftConcurrencyLimit }
              : {})
          }
        }
      : {}),
    ...(normalized.hybridPolicy.strategy
      ? {
          hybridPolicy: {
            strategy: normalized.hybridPolicy.strategy
          }
        }
      : {}),
    ...(normalized.overrides.customerRequestsHuman ||
    normalized.overrides.humanRequestKeywords.length > 0 ||
    normalized.overrides.aiUnhandled
      ? {
          overrides: {
            ...(normalized.overrides.customerRequestsHuman
              ? { customerRequestsHuman: normalized.overrides.customerRequestsHuman }
              : {}),
            ...(normalized.overrides.humanRequestKeywords.length > 0
              ? { humanRequestKeywords: normalized.overrides.humanRequestKeywords }
              : {}),
            ...(normalized.overrides.aiUnhandled
              ? { aiUnhandled: normalized.overrides.aiUnhandled }
              : {})
          }
        }
      : {}),
    ...(normalized.fallbackTarget
      ? {
          fallbackTarget: {
            ...(normalized.fallbackTarget.departmentId ? { departmentId: normalized.fallbackTarget.departmentId } : {}),
            ...(normalized.fallbackTarget.teamId ? { teamId: normalized.fallbackTarget.teamId } : {}),
            ...(normalized.fallbackTarget.skillGroupCode ? { skillGroupCode: normalized.fallbackTarget.skillGroupCode } : {}),
            ...(normalized.fallbackTarget.assignmentStrategy ? { assignmentStrategy: normalized.fallbackTarget.assignmentStrategy } : {})
          }
        }
      : {})
  };
}

function resolveDateRange(input: {
  preset?: string;
  from?: string;
  to?: string;
  timezone: string;
}): { startIso: string; endIso: string } {
  if (input.preset === "custom" && isDateString(input.from) && isDateString(input.to)) {
    return {
      startIso: zonedDateBoundaryToIso(input.from, "start"),
      endIso: zonedDateBoundaryToIso(input.to, "end")
    };
  }

  const today = formatDateInTimezone(new Date(), input.timezone);
  if (input.preset === "yesterday") {
    const y = shiftDateString(today, -1);
    return { startIso: zonedDateBoundaryToIso(y, "start"), endIso: zonedDateBoundaryToIso(y, "end") };
  }
  if (input.preset === "last7d") {
    const start = shiftDateString(today, -6);
    return { startIso: zonedDateBoundaryToIso(start, "start"), endIso: zonedDateBoundaryToIso(today, "end") };
  }

  return { startIso: zonedDateBoundaryToIso(today, "start"), endIso: zonedDateBoundaryToIso(today, "end") };
}

function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function shiftDateString(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function zonedDateBoundaryToIso(date: string, boundary: "start" | "end"): string {
  const suffix = boundary === "start" ? "T00:00:00+07:00" : "T23:59:59.999+07:00";
  return new Date(`${date}${suffix}`).toISOString();
}

function buildSupervisorWaitingConversationIdsQuery(
  trx: Knex.Transaction,
  tenantId: string
) {
  const latestCustomerMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_customer_message_at: string | Date | null }[]>(
      "m.created_at as latest_customer_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "inbound")
    .where("m.sender_type", CUSTOMER_MESSAGE_SENDER_TYPE)
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lcm");

  const latestServiceMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_service_message_at: string | Date | null }[]>(
      "m.created_at as latest_service_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "outbound")
    .whereIn("m.sender_type", [...SERVICE_REPLY_SENDER_TYPES])
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lsm");

  return trx("conversations as c")
    .leftJoin(latestCustomerMessageQuery, function joinLatestCustomerMessage() {
      this.on("lcm.conversation_id", "=", "c.conversation_id").andOn("lcm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(latestServiceMessageQuery, function joinLatestServiceMessage() {
      this.on("lsm.conversation_id", "=", "c.conversation_id").andOn("lsm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .where("c.tenant_id", tenantId)
    .whereNotIn("c.status", ["resolved", "closed"])
    .whereNotNull("lcm.latest_customer_message_at")
    .where((builder) => {
      builder
        .whereNull("lsm.latest_service_message_at")
        .orWhereRaw("lcm.latest_customer_message_at > lsm.latest_service_message_at");
    })
    .select(
      "c.tenant_id",
      "c.conversation_id",
      "lcm.latest_customer_message_at as waiting_from",
      trx.raw(
        "GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - lcm.latest_customer_message_at))))::int as waiting_seconds"
      ),
      trx.raw(`
        case
          when qa.assigned_ai_agent_id is not null and c.status in ('open', 'bot_active') then 'ai'
          else 'human'
        end as owner_bucket
      `)
    );
}

async function buildSupervisorConversationWorkbenchRows(
  trx: Knex.Transaction,
  tenantId: string,
  filters: {
    departmentId: string | null;
    teamId: string | null;
    agentId: string | null;
  }
) {
  const latestCustomerMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_customer_message_at: string | Date | null }[]>(
      "m.created_at as latest_customer_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "inbound")
    .where("m.sender_type", CUSTOMER_MESSAGE_SENDER_TYPE)
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lcm");

  const latestServiceMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_service_message_at: string | Date | null }[]>(
      "m.created_at as latest_service_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "outbound")
    .whereIn("m.sender_type", [...SERVICE_REPLY_SENDER_TYPES])
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lsm");

  const reassignCountQuery = trx("conversation_events as ce")
    .select("ce.tenant_id", "ce.conversation_id")
    .count<{ tenant_id: string; conversation_id: string; reassign_count: string }[]>("ce.event_type as reassign_count")
    .where("ce.tenant_id", tenantId)
    .where("ce.event_type", "assignment_reassigned")
    .groupBy("ce.tenant_id", "ce.conversation_id")
    .as("rc");

  const waitingConversationIdsQuery = buildSupervisorWaitingConversationIdsQuery(trx, tenantId).as("sw");

  const rows = await trx("conversations as c")
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("conversation_cases as cc", function joinCurrentCase() {
      this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("customers as cu", function joinCustomer() {
      this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("departments as d", function joinDepartment() {
      this.on("d.department_id", "=", "qa.department_id").andOn("d.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("teams as t", function joinTeam() {
      this.on("t.team_id", "=", "qa.team_id").andOn("t.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("agent_profiles as current_ap", function joinCurrentAgent() {
      this.on("current_ap.agent_id", "=", "cc.current_owner_id").andOn("current_ap.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_memberships as current_tm", "current_tm.membership_id", "current_ap.membership_id")
    .leftJoin("tenant_ai_agents as current_ai", function joinCurrentAi() {
      this.on("current_ai.ai_agent_id", "=", "cc.current_owner_id").andOn("current_ai.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_ai_agents as current_handler_ai", function joinCurrentHandlerAi() {
      this.on(trx.raw("current_handler_ai.ai_agent_id::text"), "=", trx.ref("c.current_handler_id"))
        .andOn("current_handler_ai.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("agent_profiles as reserved_ap", function joinReservedAgent() {
      this.on("reserved_ap.agent_id", "=", "qa.assigned_agent_id").andOn("reserved_ap.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("tenant_memberships as reserved_tm", "reserved_tm.membership_id", "reserved_ap.membership_id")
    .leftJoin("tenant_ai_agents as reserved_ai", function joinReservedAi() {
      this.on("reserved_ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("reserved_ai.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin(latestCustomerMessageQuery, function joinLatestCustomerMessage() {
      this.on("lcm.conversation_id", "=", "c.conversation_id").andOn("lcm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(latestServiceMessageQuery, function joinLatestServiceMessage() {
      this.on("lsm.conversation_id", "=", "c.conversation_id").andOn("lsm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(reassignCountQuery, function joinReassignCounts() {
      this.on("rc.conversation_id", "=", "c.conversation_id").andOn("rc.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(waitingConversationIdsQuery, function joinWaitingConversations() {
      this.on("sw.conversation_id", "=", "c.conversation_id").andOn("sw.tenant_id", "=", "c.tenant_id");
    })
    .where("c.tenant_id", tenantId)
    .modify((qb) => {
      if (filters.departmentId) qb.andWhere("qa.department_id", filters.departmentId);
      if (filters.teamId) qb.andWhere("qa.team_id", filters.teamId);
      if (filters.agentId) {
        qb.andWhere((scope) => {
          scope
            .where("qa.assigned_agent_id", filters.agentId)
            .orWhere("c.assigned_agent_id", filters.agentId)
            .orWhere((inner) => inner.where("cc.current_owner_type", "agent").andWhere("cc.current_owner_id", filters.agentId));
        });
      }
    })
    .select(
      "c.conversation_id",
      "c.status as conversation_status",
      "c.channel_type",
      "c.last_message_preview",
      "c.last_message_at",
      "c.current_handler_type",
      "c.current_handler_id",
      "c.assigned_agent_id as conversation_assigned_agent_id",
      "qa.assignment_id",
      "qa.status as queue_status",
      "qa.handoff_required",
      "qa.handoff_reason",
      "qa.assigned_agent_id",
      "qa.assigned_ai_agent_id",
      "qa.department_id",
      "qa.team_id",
      "cc.case_id",
      "cc.title as case_title",
      "cc.current_owner_type",
      "cc.current_owner_id",
      "cu.display_name as customer_name",
      "cu.external_ref as customer_ref",
      "d.name as department_name",
      "t.name as team_name",
      "current_tm.display_name as current_owner_agent_name",
      "current_ai.name as current_owner_ai_name",
      "current_handler_ai.name as current_handler_ai_name",
      "reserved_tm.display_name as reserved_owner_agent_name",
      "reserved_ai.name as reserved_owner_ai_name",
      "lcm.latest_customer_message_at",
      "lsm.latest_service_message_at",
      "rc.reassign_count",
      "sw.owner_bucket",
      "sw.waiting_from",
      "sw.waiting_seconds"
    )
    .orderByRaw("COALESCE(lcm.latest_customer_message_at, c.last_message_at, c.updated_at) desc nulls last") as Array<Record<string, unknown>>;

  return rows.map((row) => mapSupervisorConversationWorkbenchRow(row));
}

function mapSupervisorConversationWorkbenchRow(row: Record<string, unknown>) {
  const currentResponsible = resolveSupervisorCurrentResponsible(row);
  const reservedResponsible = resolveSupervisorReservedResponsible(row);
  const latestCustomerMessageAt = toOptionalIsoString(row.latest_customer_message_at);
  const latestServiceMessageAt = toOptionalIsoString(row.latest_service_message_at);
  const hasFirstResponse = Boolean(latestServiceMessageAt);
  const currentExceptionReason = deriveSupervisorExceptionReason({
    conversationStatus: readNullableString(row.conversation_status),
    queueStatus: readNullableString(row.queue_status),
    handoffRequired: Boolean(row.handoff_required),
    handoffReason: readNullableString(row.handoff_reason),
    latestCustomerMessageAt,
    latestServiceMessageAt,
    currentResponsibleType: currentResponsible.ownerType,
    reservedResponsibleType: reservedResponsible.ownerType
  });

  return {
    assignmentId: readNullableString(row.assignment_id),
    conversationId: String(row.conversation_id),
    caseId: readNullableString(row.case_id),
    caseTitle: readNullableString(row.case_title),
    conversationStatus: readNullableString(row.conversation_status),
    queueStatus: readNullableString(row.queue_status),
    channelType: readNullableString(row.channel_type),
    customerName: readNullableString(row.customer_name),
    customerRef: readNullableString(row.customer_ref),
    departmentId: readNullableString(row.department_id),
    departmentName: readNullableString(row.department_name),
    teamId: readNullableString(row.team_id),
    teamName: readNullableString(row.team_name),
    lastMessagePreview: readNullableString(row.last_message_preview),
    lastMessageAt: toOptionalIsoString(row.last_message_at),
    lastCustomerMessageAt: latestCustomerMessageAt,
    lastServiceMessageAt: latestServiceMessageAt,
    waitingFrom: toOptionalIsoString(row.waiting_from),
    waitingSeconds: Number(row.waiting_seconds ?? 0),
    ownerBucket: readNullableString(row.owner_bucket),
    hasFirstResponse,
    reassignCount: Number(row.reassign_count ?? 0),
    currentResponsibleType: currentResponsible.ownerType,
    currentResponsibleId: currentResponsible.ownerId,
    currentResponsibleName: currentResponsible.ownerName,
    reservedResponsibleType: reservedResponsible.ownerType,
    reservedResponsibleId: reservedResponsible.ownerId,
    reservedResponsibleName: reservedResponsible.ownerName,
    currentExceptionReason
  };
}

function normalizeSupervisorWorkbenchScope(value: unknown): "all" | "waiting" | "exception" | "active" | "resolved" {
  if (
    value === "all" ||
    value === "waiting" ||
    value === "exception" ||
    value === "active" ||
    value === "resolved"
  ) {
    return value;
  }
  return "all";
}

function filterSupervisorConversationWorkbenchRows(
  rows: Array<ReturnType<typeof mapSupervisorConversationWorkbenchRow>>,
  scope: "all" | "waiting" | "exception" | "active" | "resolved"
) {
  if (scope === "all") return rows;
  if (scope === "waiting") {
    return rows.filter((row) => row.waitingSeconds > 0);
  }
  if (scope === "exception") {
    return rows.filter((row) => Boolean(row.currentExceptionReason));
  }
  if (scope === "resolved") {
    return rows.filter((row) => row.conversationStatus === "resolved" || row.conversationStatus === "closed");
  }
  return rows.filter((row) => row.conversationStatus !== "resolved" && row.conversationStatus !== "closed");
}

function resolveSupervisorCurrentResponsible(row: Record<string, unknown>) {
  const currentOwnerType = readNullableString(row.current_owner_type);
  const currentOwnerId = readNullableString(row.current_owner_id);
  if (currentOwnerType && currentOwnerType !== "system" && currentOwnerId) {
    return {
      ownerType: currentOwnerType,
      ownerId: currentOwnerId,
      ownerName: readNullableString(row.current_owner_agent_name) ?? readNullableString(row.current_owner_ai_name)
    };
  }

  const currentHandlerType = readNullableString(row.current_handler_type);
  const currentHandlerId = readNullableString(row.current_handler_id);
  if (currentHandlerType === "ai" && currentHandlerId) {
    return {
      ownerType: "ai",
      ownerId: currentHandlerId,
      ownerName: readNullableString(row.current_handler_ai_name) ?? readNullableString(row.current_owner_ai_name)
    };
  }

  if (currentHandlerType === "human" && readNullableString(row.conversation_assigned_agent_id)) {
    return {
      ownerType: "agent",
      ownerId: readNullableString(row.conversation_assigned_agent_id),
      ownerName: readNullableString(row.reserved_owner_agent_name)
    };
  }

  return {
    ownerType: currentOwnerType,
    ownerId: currentOwnerId,
    ownerName: null
  };
}

function resolveSupervisorReservedResponsible(row: Record<string, unknown>) {
  const assignedAgentId = readNullableString(row.assigned_agent_id);
  if (assignedAgentId) {
    return {
      ownerType: "agent",
      ownerId: assignedAgentId,
      ownerName: readNullableString(row.reserved_owner_agent_name)
    };
  }

  const assignedAiAgentId = readNullableString(row.assigned_ai_agent_id);
  if (assignedAiAgentId) {
    return {
      ownerType: "ai",
      ownerId: assignedAiAgentId,
      ownerName: readNullableString(row.reserved_owner_ai_name)
    };
  }

  const conversationAssignedAgentId = readNullableString(row.conversation_assigned_agent_id);
  if (conversationAssignedAgentId) {
    return {
      ownerType: "agent",
      ownerId: conversationAssignedAgentId,
      ownerName: readNullableString(row.reserved_owner_agent_name)
    };
  }

  const currentHandlerType = readNullableString(row.current_handler_type);
  const currentHandlerId = readNullableString(row.current_handler_id);
  if (currentHandlerType === "ai" && currentHandlerId) {
    return {
      ownerType: "ai",
      ownerId: currentHandlerId,
      ownerName: readNullableString(row.current_handler_ai_name) ?? readNullableString(row.current_owner_ai_name)
    };
  }

  return {
    ownerType: null,
    ownerId: null,
    ownerName: null
  };
}

function deriveSupervisorExceptionReason(input: {
  conversationStatus: string | null;
  queueStatus: string | null;
  handoffRequired: boolean;
  handoffReason: string | null;
  latestCustomerMessageAt: string | null;
  latestServiceMessageAt: string | null;
  currentResponsibleType: string | null;
  reservedResponsibleType: string | null;
}) {
  if (input.handoffReason === "unanswered_auto_closed") return "unanswered_auto_closed";
  if (!input.latestCustomerMessageAt) return null;
  if (!input.latestServiceMessageAt) {
    if (input.reservedResponsibleType === "ai" || input.currentResponsibleType === "ai") return "awaiting_ai_first_response";
    if (input.reservedResponsibleType === "agent" || input.currentResponsibleType === "agent") return "awaiting_agent_first_response";
    return "unassigned_no_first_response";
  }
  if (new Date(input.latestCustomerMessageAt).getTime() > new Date(input.latestServiceMessageAt).getTime()) {
    if (input.handoffRequired) return input.handoffReason ?? "handoff_pending";
    if (input.reservedResponsibleType === "ai" || input.currentResponsibleType === "ai") return "awaiting_ai_reply";
    if (input.reservedResponsibleType === "agent" || input.currentResponsibleType === "agent") return "awaiting_agent_reply";
    return "awaiting_assignment";
  }
  return null;
}

function toOptionalIsoString(value: unknown): string | null {
  if (!value) return null;
  return toIsoString(value);
}

function normalizeModuleOperatingMode(value: unknown): "human_first" | "ai_first" | "ai_autonomous" | "workflow_first" {
  if (
    value === "human_first" ||
    value === "ai_first" ||
    value === "ai_autonomous" ||
    value === "workflow_first"
  ) {
    return value;
  }
  return "ai_first";
}

function resolveConversationCaseEffectiveOwner(row: Record<string, unknown>): {
  ownerType: string | null;
  ownerId: string | null;
  ownerName: string | null;
} {
  const caseStatus = readNullableString(row.status);
  const currentOwnerType = readNullableString(row.current_owner_type);
  const currentOwnerId = readNullableString(row.current_owner_id);
  if (currentOwnerType && currentOwnerType !== "system" && currentOwnerId) {
    return {
      ownerType: currentOwnerType,
      ownerId: currentOwnerId,
      ownerName: readNullableString(row.owner_agent_name) ?? readNullableString(row.owner_ai_name)
    };
  }

  const reservedAgentId = readNullableString(row.assigned_agent_id);
  if (reservedAgentId) {
    return {
      ownerType: "agent",
      ownerId: reservedAgentId,
      ownerName: readNullableString(row.reserved_agent_name)
    };
  }

  const currentHandlerType = readNullableString(row.current_handler_type);
  const currentHandlerId = readNullableString(row.current_handler_id);
  if (currentHandlerType === "ai" && currentHandlerId) {
    return {
      ownerType: "ai",
      ownerId: currentHandlerId,
      ownerName: readNullableString(row.current_handler_ai_name)
    };
  }

  if (caseStatus === "resolved" || caseStatus === "closed") {
    const finalOwnerType = readNullableString(row.final_owner_type);
    const finalOwnerId = readNullableString(row.final_owner_id);
    if (finalOwnerType && finalOwnerType !== "system" && finalOwnerId) {
      return {
        ownerType: finalOwnerType,
        ownerId: finalOwnerId,
        ownerName: readNullableString(row.final_owner_agent_name) ?? readNullableString(row.final_owner_ai_name)
      };
    }
  }

  const reservedAiId = readNullableString(row.assigned_ai_agent_id);
  if (reservedAiId) {
    return {
      ownerType: "ai",
      ownerId: reservedAiId,
      ownerName: readNullableString(row.reserved_ai_name)
    };
  }

  return {
    ownerType: currentOwnerType,
    ownerId: currentOwnerId,
    ownerName: null
  };
}

function readNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
