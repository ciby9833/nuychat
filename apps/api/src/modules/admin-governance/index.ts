import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { getDailyReport } from "../analytics/analytics.service.js";
import {
  APP_ROLES,
  PERMISSION_KEYS,
  attachTenantAdminGuard,
  normalizePermissionKey,
  normalizeRole
} from "../tenant/tenant-admin.auth.js";
import {
  normalizeStringArray,
  parseJsonStringArray,
  toIsoString
} from "../tenant/tenant-admin.shared.js";
import {
  deriveAIRisk,
  extractMessagePreview,
  getLatestAITracesByConversation,
  parseJsonValue,
  resolveConversationCaseEffectiveOwner,
  resolveDateRange
} from "../admin-core/admin-route.shared.js";

export async function adminGovernanceRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/ai-conversations", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = (req.query as { aiAgentId?: string; status?: string; datePreset?: string; from?: string; to?: string } | undefined) ?? {};
    const aiAgentId = query.aiAgentId?.trim();
    const status = query.status?.trim();
    const dateRange = resolveDateRange({ preset: query.datePreset, from: query.from, to: query.to, timezone: "Asia/Jakarta" });

    return withTenantTransaction(tenantId, async (trx) => {
      const activityAtExpr = trx.raw("greatest(coalesce(c.last_message_at, to_timestamp(0)), coalesce(qa.last_ai_response_at, to_timestamp(0)))");
      const activityAtSelect = trx.raw(
        "greatest(coalesce(c.last_message_at, to_timestamp(0)), coalesce(qa.last_ai_response_at, to_timestamp(0))) as activity_at"
      );
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
          if (status === "handoff_required") {
            builder.where("qa.handoff_required", true);
          } else if (status === "transferred") {
            builder.where("c.current_handler_type", "human");
          } else if (status) {
            builder.where("c.status", status);
          } else {
            builder.where("c.current_handler_type", "ai").whereIn("c.status", ["open", "bot_active"]);
          }
          builder.whereBetween(activityAtExpr as unknown as string, [dateRange.startIso, dateRange.endIso]);
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
          "cu.tier as customer_tier",
          activityAtSelect
        )
        .orderBy("activity_at", "desc")
        .orderBy("qa.updated_at", "desc");

      const tracesByConversation = await getLatestAITracesByConversation(
        trx,
        tenantId,
        rows.map((row: any) => String(row.conversation_id))
      );

      return {
        items: rows.map((row: any) => ({
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
          activityAt: row.activity_at ? toIsoString(row.activity_at as string) : null,
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
        trx("messages as m")
          .leftJoin("messages as rm", function joinReplyTarget() {
            this.on("rm.message_id", "=", "m.reply_to_message_id").andOn("rm.tenant_id", "=", "m.tenant_id");
          })
          .where({ "m.tenant_id": tenantId, "m.conversation_id": conversationId })
          .select(
            "m.message_id",
            "m.direction",
            "m.sender_type",
            "m.message_type",
            "m.content",
            "m.created_at",
            "m.reply_to_message_id",
            "m.reaction_target_message_id",
            "m.reaction_emoji",
            "rm.content as reply_to_content"
          )
          .orderBy("m.created_at", "asc")
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
          replyToMessageId: (row.reply_to_message_id as string | null) ?? null,
          replyToPreview: row.reply_to_content ? extractMessagePreview(parseJsonValue(row.reply_to_content)) : null,
          reactionTargetMessageId: (row.reaction_target_message_id as string | null) ?? null,
          reactionEmoji: (row.reaction_emoji as string | null) ?? null,
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

    const body = req.body as { updates?: Array<{ role?: string; permissionKey?: string; isAllowed?: boolean }> };
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
          .merge({ is_allowed: item.isAllowed, updated_by_identity_id: actorIdentityId, updated_at: trx.fn.now() });
      }
      return { updated: true, count: updates.length };
    });
  });

  app.get("/api/admin/analytics/daily", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { date?: string };
    const date = query.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? query.date : new Date().toISOString().slice(0, 10);
    return getDailyReport(tenantId, date);
  });

  app.get("/api/admin/conversation-cases", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { status?: string; search?: string; page?: string; pageSize?: string };
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
          this.on(trx.raw("chaia.ai_agent_id::text") as unknown as string, "=", trx.ref("c.current_handler_id")).andOn("chaia.tenant_id", "=", "c.tenant_id");
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
