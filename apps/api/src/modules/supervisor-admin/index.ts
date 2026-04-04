import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { outboundQueue } from "../../infra/queue/queues.js";
import { PresenceService } from "../agent/presence.service.js";
import { ConversationCaseService } from "../conversation/conversation-case.service.js";
import { OwnershipService } from "../conversation/ownership.service.js";
import { ConversationSegmentService } from "../conversation/conversation-segment.service.js";
import { DispatchAuditService } from "../dispatch/dispatch-audit.service.js";
import { markCustomerMessagesRead } from "../message/message.repository.js";
import { getPrimaryTeamContext } from "../routing-engine/human-dispatch.service.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { toIsoString } from "../tenant/tenant-admin.shared.js";
import { loadConversationPreview } from "../conversation/conversation-preview.service.js";
import {
  buildSupervisorConversationWorkbenchRows,
  buildSupervisorWaitingConversationIdsQuery,
  filterSupervisorConversationWorkbenchRows,
  normalizeSupervisorWorkbenchScope,
  resolveDateRange
} from "../admin-core/admin-route.shared.js";
import { enqueueQaReviewForCase } from "../quality-admin/qa-v2.service.js";

export async function supervisorAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  const conversationSegmentService = new ConversationSegmentService();
  const conversationCaseService = new ConversationCaseService();
  const ownershipService = new OwnershipService();
  const dispatchAuditService = new DispatchAuditService();
  const presenceService = new PresenceService();

  app.get("/api/admin/supervisor/overview", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const waitingConversationIdsQuery = buildSupervisorWaitingConversationIdsQuery(trx, tenantId);
      const [waitingRow, onlineRow, aiRow, todayRow, slaRow, csatRow] = await Promise.all([
        trx.from(waitingConversationIdsQuery.clone().as("sw")).whereNot("sw.owner_bucket", "ai").count<{ cnt: string }>("sw.conversation_id as cnt").first(),
        trx("agent_profiles").where({ tenant_id: tenantId, status: "online" }).count<{ cnt: string }>("agent_id as cnt").first(),
        trx.from(waitingConversationIdsQuery.clone().as("sw")).where("sw.owner_bucket", "ai").count<{ cnt: string }>("sw.conversation_id as cnt").first(),
        trx("conversations").where({ tenant_id: tenantId }).whereRaw("created_at::date = current_date").count<{ cnt: string }>("conversation_id as cnt").first(),
        trx("sla_breaches").where({ tenant_id: tenantId, status: "open" }).count<{ cnt: string }>("breach_id as cnt").first(),
        trx("csat_responses").where({ tenant_id: tenantId }).whereRaw("responded_at::date = current_date").avg<{ avg_rating: string }>("rating as avg_rating").first()
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
    const query = req.query as { departmentId?: string; teamId?: string; agentId?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await buildSupervisorConversationWorkbenchRows(trx, tenantId, {
        departmentId: query.departmentId?.trim() || null,
        teamId: query.teamId?.trim() || null,
        agentId: query.agentId?.trim() || null
      });
      const start = (page - 1) * pageSize;
      return { page, pageSize, total: rows.length, items: rows.slice(start, start + pageSize) };
    });
  });

  app.get("/api/admin/supervisor/exception-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { departmentId?: string; teamId?: string; agentId?: string; page?: string; pageSize?: string };
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
      return { page, pageSize, total: exceptions.length, items: exceptions.slice(start, start + pageSize) };
    });
  });

  app.get("/api/admin/supervisor/conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { departmentId?: string; teamId?: string; agentId?: string; scope?: string; page?: string; pageSize?: string };
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
      return { page, pageSize, total: filteredRows.length, scope, items: filteredRows.slice(start, start + pageSize) };
    });
  });

  app.get("/api/admin/human-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      agentId?: string;
      scope?: string;
      datePreset?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));
    const scope = normalizeSupervisorWorkbenchScope(query.scope);
    const dateRange = resolveDateRange({
      preset: query.datePreset,
      from: query.from,
      to: query.to,
      timezone: "Asia/Jakarta"
    });

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await buildSupervisorConversationWorkbenchRows(trx, tenantId, {
        departmentId: null,
        teamId: null,
        agentId: query.agentId?.trim() || null
      });
      const filteredRows = filterSupervisorConversationWorkbenchRows(rows, scope).filter((row) => {
        const activityAt = row.lastMessageAt ?? row.lastCustomerMessageAt ?? row.lastServiceMessageAt ?? row.waitingFrom;
        if (!activityAt) return false;
        return activityAt >= dateRange.startIso && activityAt <= dateRange.endIso;
      });
      const missingCaseConversationIds = filteredRows
        .filter((row) => !row.caseId)
        .map((row) => row.conversationId);
      const latestCases = missingCaseConversationIds.length > 0
        ? await trx("conversation_cases as cc")
            .select("cc.conversation_id", "cc.case_id", "cc.title")
            .where("cc.tenant_id", tenantId)
            .whereIn("cc.conversation_id", missingCaseConversationIds)
            .orderBy("cc.last_activity_at", "desc")
        : [];
      const latestCaseByConversation = new Map<string, { caseId: string; caseTitle: string | null }>();
      for (const row of latestCases) {
        const conversationId = row.conversation_id as string;
        if (!latestCaseByConversation.has(conversationId)) {
          latestCaseByConversation.set(conversationId, {
            caseId: row.case_id as string,
            caseTitle: (row.title as string | null) ?? null
          });
        }
      }
      const start = (page - 1) * pageSize;
      return {
        page,
        pageSize,
        total: filteredRows.length,
        scope,
        items: filteredRows.slice(start, start + pageSize).map((row) => {
          const latestCase = !row.caseId ? latestCaseByConversation.get(row.conversationId) : null;
          return {
            ...row,
            caseId: row.caseId ?? latestCase?.caseId ?? null,
            caseTitle: row.caseTitle ?? latestCase?.caseTitle ?? null
          };
        })
      };
    });
  });

  app.get("/api/admin/human-conversations/:conversationId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const preview = await loadConversationPreview(trx, tenantId, conversationId);
      if (!preview) throw app.httpErrors.notFound("Conversation not found");
      return preview;
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
          this.on(trx.raw("ac.current_handler_id::uuid") as unknown as string, "=", trx.ref("ap.agent_id"));
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
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: targetAgentId }).select("agent_id").first();
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
          assigned_ai_agent_id: null,
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
          assigned_ai_agent_id: null,
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

    let closedCaseId: string | null = null;

    const result = await withTenantTransaction(tenantId, async (trx) => {
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id", "current_case_id", "current_segment_id", "status")
        .first<{
          customer_id: string;
          current_case_id: string | null;
          current_segment_id: string | null;
          status: string;
        } | undefined>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");
      closedCaseId = conversation.current_case_id ?? null;

      if (conversation.current_case_id && conversation.current_segment_id) {
        await conversationSegmentService.closeCurrentSegment(trx, {
          tenantId,
          conversationId,
          status: "resolved",
          reason: "supervisor-force-close"
        });
      }

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
        .update({ status: "resolved", handoff_required: false, handoff_reason: null, updated_at: trx.fn.now() });

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

    if (closedCaseId) {
      void enqueueQaReviewForCase(tenantId, closedCaseId).catch(() => null);
    }

    return result;
  });

  app.post("/api/admin/supervisor/broadcast", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { text?: string };
    const text = body.text?.trim();
    if (!text) throw app.httpErrors.badRequest("text is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const onlineAgents = await trx("agent_profiles").where({ tenant_id: tenantId, status: "online" }).count<{ cnt: string }>("agent_id as cnt").first();
      return { success: true, actorId, message: text, recipients: Number(onlineAgents?.cnt ?? 0) };
    });
  });
}
