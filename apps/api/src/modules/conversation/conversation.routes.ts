import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import { conversationTimeoutQueue, outboundQueue } from "../../infra/queue/queues.js";
import { PresenceService } from "../agent/presence.service.js";
import { ConversationCaseService } from "./conversation-case.service.js";
import { OwnershipService } from "./ownership.service.js";
import { emitConversationUpdatedSnapshot } from "./conversation-realtime.service.js";
import { ConversationSegmentService } from "./conversation-segment.service.js";
import {
  getRecentMessages,
  getConversationSummary,
  markCustomerMessagesRead
} from "../message/message.repository.js";
import { CopilotService } from "../copilot/copilot.service.js";
import { DispatchAuditService } from "../dispatch/dispatch-audit.service.js";
import { realtimeEventBus } from "../realtime/realtime.events.js";
import { getPrimaryTeamContext } from "../routing-engine/human-dispatch.service.js";
import { SkillGatewayService } from "../skills/skill-gateway.service.js";
import { skillRegistry } from "../skills/skill.registry.js";
import {
  getBoundRuntimePolicies,
  evaluateSkillExecutionGate,
  recordSkillInvocation
} from "../skills/runtime-governance.service.js";
import { trackEvent } from "../analytics/analytics.service.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import {
  getConversationInsightRecord,
  getCustomerProfileRecord
} from "../memory/customer-intelligence.service.js";
import { cancelAssignmentAcceptTimeout } from "../sla/conversation-sla.service.js";

const copilotService = new CopilotService();
const skillGateway = new SkillGatewayService();
const conversationCaseService = new ConversationCaseService();
const conversationSegmentService = new ConversationSegmentService();
const ownershipService = new OwnershipService();
const presenceService = new PresenceService();
const dispatchAuditService = new DispatchAuditService();

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    if (req.method === "OPTIONS") return;
    requireAuth(app, req);
  });

  app.get("/api/conversations", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const view = readView(req);

    if (!agentId) {
      throw app.httpErrors.badRequest("Current account has no bound agent profile");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const conversationSortAt = trx.raw("coalesce(c.last_message_at, c.updated_at)");
      const unreadCounts = trx("messages as mu")
        .select("mu.conversation_id")
        .count<{ unread_count: string }>("mu.message_id as unread_count")
        .where({
          "mu.tenant_id": tenantId,
          "mu.direction": "inbound",
          "mu.sender_type": "customer"
        })
        .whereNull("mu.read_at")
        .groupBy("mu.conversation_id")
        .as("uc");

      const query = trx("conversations as c")
        .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
          this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin(unreadCounts, "uc.conversation_id", "c.conversation_id")
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("conversation_cases as cc", function joinCurrentCase() {
          this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
        })
        // Join assigned agent profile + membership for display_name (used by monitor view)
        .leftJoin("agent_profiles as aap", function joinAssignedAgentProfile() {
          this.on("aap.agent_id", "=", "c.assigned_agent_id").andOn("aap.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("tenant_memberships as asm", "asm.membership_id", "aap.membership_id")
        .select(
          "c.conversation_id",
          "c.channel_type",
          "c.channel_id",
          "c.status",
          "c.last_message_preview",
          "c.last_message_at",
          "cu.display_name as customer_name",
          "cu.tier as customer_tier",
          "cu.external_ref as customer_ref",
          "cu.metadata as customer_metadata",
          "cu.tags as customer_tags",
          "qa.status as queue_status",
          "c.assigned_agent_id",
          "cc.current_owner_type",
          "cc.current_owner_id",
          "qa.skill_group_id",
          "asm.display_name as assigned_agent_name",
          "asm.employee_no as assigned_agent_employee_no"
        )
        .select(trx.raw("coalesce(uc.unread_count, 0)::int as unread_count"))
        // Task badge: true when the current agent has an open ticket on this
        // conversation. Task ownership (ticket.assignee_id) is the correct lens —
        // not conversation ownership — so agents only see badges for their own work.
        .select(trx.raw(`
          EXISTS(
            SELECT 1 FROM tickets t_badge
            WHERE t_badge.conversation_id = c.conversation_id
              AND t_badge.tenant_id = c.tenant_id
              AND t_badge.status IN ('open', 'in_progress', 'pending_customer')
              AND t_badge.assignee_id = ?
          ) as has_my_open_ticket
        `, [agentId ?? null]))
        .where("c.tenant_id", tenantId);

      if (view === "mine" && agentId) {
        query
          .where("cc.current_owner_type", "agent")
          .where("cc.current_owner_id", agentId);
      } else if (view === "pending") {
        if (role === "admin" || role === "supervisor") {
          query.where((builder) => {
            builder.where("qa.status", "pending").orWhereNull("qa.assignment_id");
          });
        } else {
          query.whereRaw("1 = 0");
        }
      } else if (view === "monitor" && agentId) {
        // Monitor: conversations actively assigned to OTHER agents only
        query
          .where("cc.current_owner_type", "agent")
          .whereNot("cc.current_owner_id", agentId)
          .whereIn("c.status", ["human_active", "open", "queued"]);
      } else if (view === "follow_up" && agentId) {
        // Follow-up view: conversations (any status, including resolved) that have
        // at least one open ticket assigned to the current agent.
        // This is the "my pending tasks" queue — helps agents track deferred work.
        query.whereExists(
          trx("tickets as t_fu")
            .select(trx.raw("1"))
            .whereRaw("t_fu.conversation_id = c.conversation_id")
            .whereRaw("t_fu.tenant_id = c.tenant_id")
            .whereIn("t_fu.status", ["open", "in_progress", "pending_customer"])
            .where("t_fu.assignee_id", agentId)
        );
      } else {
        // view=all: show all conversations reserved for me, whether already
        // accepted by me or still waiting for my response.
        if (agentId) {
          query.where("c.assigned_agent_id", agentId);
        }
      }

      const q = req.query as Record<string, string | undefined>;
      const before = q.before;
      const limit = Math.min(Number(q.limit ?? 50), 100);

      query.select("c.updated_at").select({ sort_at: conversationSortAt });
      if (before) {
        query.whereRaw("coalesce(c.last_message_at, c.updated_at) < ?", [new Date(before)]);
      }

      const rows = await query
        .orderByRaw("coalesce(c.last_message_at, c.updated_at) desc")
        .orderBy("c.conversation_id", "desc")
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const lastRow = page[page.length - 1] as Record<string, unknown> | undefined;
      const nextCursor = hasMore && lastRow ? String(lastRow.sort_at ?? lastRow.updated_at) : null;

      return { conversations: page, hasMore, nextCursor };
    });
  });

  app.get("/api/conversations/:conversationId", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);

      const row = await trx("conversations as c")
        .leftJoin(
          trx("messages as mu")
            .select("mu.conversation_id")
            .count<{ unread_count: string }>("mu.message_id as unread_count")
            .where({
              "mu.tenant_id": tenantId,
              "mu.direction": "inbound",
              "mu.sender_type": "customer"
            })
            .whereNull("mu.read_at")
            .groupBy("mu.conversation_id")
            .as("uc"),
          "uc.conversation_id",
          "c.conversation_id"
        )
        .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
          this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
        })
        .leftJoin("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .select(
          "c.conversation_id",
          "c.channel_type",
          "c.channel_id",
          "c.status",
          "c.operating_mode",
          "c.last_message_preview",
          "c.last_message_at",
          "cu.customer_id",
          "cu.display_name as customer_name",
          "cu.tier as customer_tier",
          "cu.language as customer_language",
          "cu.external_ref as customer_ref",
          "cu.tags as customer_tags",
          "cu.metadata as customer_metadata",
          "qa.status as queue_status",
          "c.assigned_agent_id",
          "qa.skill_group_id"
        )
        .select(trx.raw("coalesce(uc.unread_count, 0)::int as unread_count"))
        .where({
          "c.tenant_id": tenantId,
          "c.conversation_id": conversationId
        })
        .first();

      if (!row) throw app.httpErrors.notFound("Conversation not found");
      const currentCase = await resolveConversationCaseSnapshot(trx, tenantId, conversationId);
      return {
        ...row,
        case_id: currentCase?.case_id ?? null,
        case_status: currentCase?.status ?? null,
        case_type: currentCase?.case_type ?? null,
        case_title: currentCase?.title ?? null,
        case_summary: currentCase?.summary ?? null,
        case_opened_at: currentCase?.opened_at ? toIsoString(currentCase.opened_at) : null,
        case_last_activity_at: currentCase?.last_activity_at ? toIsoString(currentCase.last_activity_at) : null
      };
    });
  });

  app.get("/api/conversations/:conversationId/messages", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      return getRecentMessages(tenantId, conversationId);
    });
  });

  app.post("/api/conversations/:conversationId/read", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);

      const conversation = await trx("conversations")
        .select("last_message_at")
        .where({
          tenant_id: tenantId,
          conversation_id: conversationId
        })
        .first<{ last_message_at: Date | string | null }>();

      if (!conversation) {
        throw app.httpErrors.notFound("Conversation not found");
      }

      await markCustomerMessagesRead(tenantId, conversationId, trx);

      await emitConversationUpdatedSnapshot(trx, tenantId, conversationId, {
        occurredAt: toIsoString(conversation.last_message_at ?? new Date())
      });

      return { success: true };
    });
  });

  app.get("/api/conversations/:conversationId/skills/preferences", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      const row = await trx("conversation_skill_preferences")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("preferred_skills", "updated_at")
        .first<{ preferred_skills: unknown; updated_at: string }>();

      return {
        conversationId,
        preferredSkills: parseJsonStringArray(row?.preferred_skills),
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
      };
    });
  });

  app.put("/api/conversations/:conversationId/skills/preferences", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { preferredSkills?: string[] } | undefined) ?? {};
    const preferredSkills = normalizeSkillNames(body.preferredSkills ?? []);

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      await trx("conversation_skill_preferences")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          preferred_skills: JSON.stringify(preferredSkills),
          updated_by_type: auth.agentId ? "agent" : "workflow",
          updated_by_id: auth.sub
        })
        .onConflict(["tenant_id", "conversation_id"])
        .merge({
          preferred_skills: JSON.stringify(preferredSkills),
          updated_by_type: auth.agentId ? "agent" : "workflow",
          updated_by_id: auth.sub,
          updated_at: trx.fn.now()
        });

      return { success: true, conversationId, preferredSkills };
    });
  });

  app.get("/api/conversations/:conversationId/skills/recommendations", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const query = (req.query as { actor?: string } | undefined) ?? {};
    const actorType = query.actor === "ai" ? "ai" : "agent";

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      const assignment = await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("module_id", "skill_group_id")
        .first<{ module_id: string | null; skill_group_id: string | null }>();

      const pref = await trx("conversation_skill_preferences")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("preferred_skills")
        .first<{ preferred_skills: unknown }>();

      const result = await skillGateway.recommend(trx, {
        tenantId,
        conversationId,
        actorType,
        moduleId: assignment?.module_id ?? null,
        skillGroupId: assignment?.skill_group_id ?? null,
        preferredSkills: parseJsonStringArray(pref?.preferred_skills)
      });

      return {
        conversationId,
        actorType,
        ...result
      };
    });
  });

  app.get("/api/conversations/:conversationId/copilot", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      return copilotService.generate(trx, { tenantId, conversationId });
    });
  });

  // ── GET /api/conversations/:conversationId/customer-360 ─────────────────────
  // Aggregated customer context for the right-side customer 360 panel:
  // basic profile, tags, recent history, sentiment trend, order clues,
  // latest AI analysis and KB recommendations.
  app.get("/api/conversations/:conversationId/customer-360", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      const base = await trx("conversations as c")
        .join("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .where({ "c.tenant_id": tenantId, "c.conversation_id": conversationId })
        .select(
          "c.conversation_id",
          "c.customer_id",
          "c.channel_type",
          "c.channel_id",
          "c.last_message_preview",
          "c.updated_at as conversation_updated_at",
          "cu.display_name",
          "cu.external_ref",
          "cu.tier",
          "cu.language",
          "cu.timezone",
          "cu.tags",
          "cu.metadata",
          "cu.created_at as customer_created_at",
          "cu.updated_at as customer_updated_at"
        )
        .first<{
          conversation_id: string;
          customer_id: string;
          channel_type: string;
          channel_id: string;
          last_message_preview: string | null;
          conversation_updated_at: string;
          display_name: string | null;
          external_ref: string;
          tier: string;
          language: string;
          timezone: string;
          tags: unknown;
          metadata: unknown;
          customer_created_at: string;
          customer_updated_at: string;
        }>();

      if (!base) throw app.httpErrors.notFound("Conversation not found");

      const [profile, latestInsight, historyRows, sentimentRows, customerTickets, memoryRows, stateRows, aiAnalysis] = await Promise.all([
        getCustomerProfileRecord(trx, tenantId, base.customer_id),
        getConversationInsightRecord(trx, tenantId, conversationId),
        trx("conversation_cases as cc")
          .join("conversations as c", function joinConversation() {
            this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
          })
          .leftJoin("conversation_intelligence as ci", function joinSummary() {
            this.on("ci.case_id", "=", "cc.case_id").andOn("ci.tenant_id", "=", "cc.tenant_id");
          })
          .where({ "cc.tenant_id": tenantId, "cc.customer_id": base.customer_id })
          .select(
            "cc.case_id",
            "cc.title as case_title",
            "cc.case_type",
            "cc.status",
            "c.conversation_id",
            "c.channel_type",
            "cc.last_activity_at",
            "ci.summary",
            "ci.last_intent",
            "ci.last_sentiment"
          )
          .orderBy("cc.last_activity_at", "desc")
          .limit(8),
        trx("conversation_cases as cc")
          .leftJoin("conversation_intelligence as ci", function joinSummary() {
            this.on("ci.case_id", "=", "cc.case_id").andOn("ci.tenant_id", "=", "cc.tenant_id");
          })
          .where({ "cc.tenant_id": tenantId, "cc.customer_id": base.customer_id })
          .whereNotNull("ci.last_sentiment")
          .select("cc.case_id", "cc.last_activity_at", "ci.last_sentiment")
          .orderBy("cc.last_activity_at", "desc")
          .limit(10),
        trx("tickets as t")
          .join("conversation_cases as cc", function joinCase() {
            this.on("cc.case_id", "=", "t.case_id").andOn("cc.tenant_id", "=", "t.tenant_id");
          })
          .where({ "t.tenant_id": tenantId, "cc.customer_id": base.customer_id })
          .select("t.ticket_id", "t.case_id", "t.title", "t.status", "t.priority", "t.created_at")
          .orderBy("t.created_at", "desc")
          .limit(8),
        trx("customer_memory_items")
          .where({ tenant_id: tenantId, customer_id: base.customer_id, status: "active" })
          .where((builder) => {
            builder.whereNull("expires_at").orWhere("expires_at", ">", trx.fn.now());
          })
          .select("memory_type", "title", "summary", "salience", "updated_at")
          .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
          .limit(8),
        trx("customer_state_snapshots")
          .where({ tenant_id: tenantId, customer_id: base.customer_id, status: "active" })
          .select("state_type", "state_payload", "updated_at")
          .orderBy("updated_at", "desc")
          .limit(6),
        copilotService.generate(trx, { tenantId, conversationId })
      ]);

      const orderIdSet = new Set<string>();
      for (const orderId of latestInsight?.keyEntities.orderIds ?? []) {
        orderIdSet.add(orderId);
      }
      for (const row of historyRows) {
        // Add order IDs extracted in historical summaries as lightweight order clues.
        const summaryRow = row as { summary?: string | null };
        if (summaryRow.summary) {
          for (const token of extractOrderLikeTokens(summaryRow.summary)) orderIdSet.add(token);
        }
      }
      const orderClues = Array.from(orderIdSet).slice(0, 12);

      const kbKeywords = [base.last_message_preview, aiAnalysis.summary]
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .join(" ");
      const tsQuery = buildTsQuery(kbKeywords);

      const kbRows = tsQuery
        ? await trx("knowledge_base_entries")
            .where({ tenant_id: tenantId, is_active: true })
            .andWhereRaw("search_vector @@ to_tsquery('simple', ?)", [tsQuery])
            .select("entry_id", "title", "category", "hit_count", "updated_at")
            .orderBy("hit_count", "desc")
            .orderBy("updated_at", "desc")
            .limit(5)
        : [];

      return {
        customer: {
          customerId: base.customer_id,
          name: base.display_name,
          reference: base.external_ref,
          tier: base.tier,
          language: base.language,
          timezone: base.timezone,
          channelType: base.channel_type,
          channelId: base.channel_id,
          tags: parseJsonStringArray(base.tags),
          metadata: parseJsonObject(base.metadata),
          firstContactAt: toIsoString(base.customer_created_at),
          updatedAt: toIsoString(base.customer_updated_at),
          profileSummary: profile?.profileSummary ?? null,
          soulProfile: profile?.soulProfile ?? {},
          operatingNotes: profile?.operatingNotes ?? {},
          stateSnapshot: profile?.stateSnapshot ?? {}
        },
        history: historyRows.map((row) => ({
          caseId: row.case_id as string,
          caseTitle: (row.case_title as string | null) ?? null,
          caseType: (row.case_type as string | null) ?? null,
          conversationId: row.conversation_id as string,
          channelType: row.channel_type as string,
          status: row.status as string,
          summary: (row.summary as string | null) ?? null,
          intent: (row.last_intent as string | null) ?? null,
          sentiment: (row.last_sentiment as string | null) ?? null,
          occurredAt: toIsoString(row.last_activity_at as string)
        })),
        latestConversationIntelligence: latestInsight
          ? {
              summary: latestInsight.summary,
              intent: latestInsight.lastIntent,
              sentiment: latestInsight.lastSentiment,
              keyEntities: latestInsight.keyEntities
            }
          : null,
        memoryItems: memoryRows.map((row) => ({
          memoryType: String(row.memory_type),
          title: row.title ? String(row.title) : null,
          summary: String(row.summary ?? ""),
          salience: Number(row.salience ?? 0),
          updatedAt: toIsoString(row.updated_at as string)
        })),
        stateSnapshots: stateRows.map((row) => ({
          stateType: String(row.state_type),
          payload: parseJsonObject(row.state_payload),
          updatedAt: toIsoString(row.updated_at as string)
        })),
        orderClues,
        customerTickets: customerTickets.map((row) => ({
          ticketId: row.ticket_id as string,
          caseId: (row.case_id as string | null) ?? null,
          title: row.title as string,
          status: row.status as string,
          priority: row.priority as string,
          createdAt: toIsoString(row.created_at as string)
        })),
        sentimentTrend: sentimentRows
          .map((row) => ({
            caseId: row.case_id as string,
            sentiment: String(row.last_sentiment ?? "neutral"),
            occurredAt: toIsoString(row.last_activity_at as string)
          }))
          .reverse(),
        aiAnalysis: {
          summary: aiAnalysis.summary,
          intent: aiAnalysis.intent,
          sentiment: aiAnalysis.sentiment,
          suggestions: aiAnalysis.suggestions
        },
        knowledgeRecommendations: kbRows.map((row) => ({
          entryId: row.entry_id as string,
          title: row.title as string,
          category: row.category as string,
          hitCount: Number(row.hit_count ?? 0),
          updatedAt: toIsoString(row.updated_at as string)
        }))
      };
    });
  });

  app.post("/api/conversations/:conversationId/reply", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const body = req.body as {
      text?: string;
      media?: { url: string; mimeType: string; fileName?: string };
      channelId?: string;
      channelType?: string;
    };

    if (!body?.text?.trim() && !body?.media?.url) {
      throw app.httpErrors.badRequest("Reply text or media is required");
    }

    const summary = await withTenantTransaction(tenantId, async () => {
      return getConversationSummary(tenantId, conversationId);
    });

    if (!summary) throw app.httpErrors.notFound("Conversation not found");

    // Exclusive-assignment guard: only the assigned agent (or admin) may reply
    if (role !== "admin" && agentId) {
      const assignedId = (summary as { assigned_agent_id?: string | null }).assigned_agent_id ?? null;
      if (assignedId && assignedId !== agentId) {
        throw app.httpErrors.forbidden("Only the assigned agent may reply to this conversation");
      }
    }

    await outboundQueue.add(
      "send-outbound",
      {
        tenantId,
        conversationId,
        channelId: body.channelId ?? (summary.channel_id as string),
        channelType: body.channelType ?? (summary.channel_type as string),
        message: {
          text: (body.text ?? "").trim(),
          agentId,
          media: body.media ?? undefined
        }
      },
      { removeOnComplete: 100, removeOnFail: 50 }
    );

    await withTenantTransaction(tenantId, async (trx) => {
      await recordAgentPresenceActivity(trx, tenantId, agentId);
    });

    return { queued: true };
  });

  app.post("/api/conversations/:conversationId/handoff", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { reason?: string }) ?? {};
    const reason = body.reason?.trim() || "Agent requested handoff";

    await withTenantTransaction(tenantId, async (trx) => {
      const before = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id", "current_handler_type", "current_handler_id", "current_segment_id")
        .first<{ customer_id: string; current_handler_type: string | null; current_handler_id: string | null; current_segment_id: string | null } | undefined>();
      if (!before) throw app.httpErrors.notFound("Conversation not found");
      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        segmentId: before.current_segment_id,
        triggerType: "agent_handoff",
        triggerActorType: agentId ? "agent" : "system",
        triggerActorId: agentId ?? null,
        decisionType: "manual_transition",
        decisionSummary: { toOwnerType: "system", reason },
        decisionReason: reason
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id", "current_case_id")
        .first<{ customer_id: string; current_case_id: string | null } | undefined>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");

      await ownershipService.applyTransition(trx, {
        type: "release_to_queue",
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        caseId: conversation.current_case_id,
        reason,
        assignedAgentId: null,
        conversationStatus: "queued"
      });

      await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          status: "pending",
          assigned_agent_id: null,
          handoff_required: true,
          handoff_reason: reason,
          updated_at: new Date()
        });

      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "handoff_requested",
        actor_type: agentId ? "agent" : "system",
        actor_id: agentId ?? null,
        payload: { reason }
      });

      const after = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("current_segment_id")
        .first<{ current_segment_id: string | null } | undefined>();
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        executionId,
        transitionType: "human_to_queue",
        actorType: agentId ? "agent" : "system",
        actorId: agentId ?? null,
        fromOwnerType: before.current_handler_type,
        fromOwnerId: before.current_handler_id,
        fromSegmentId: before.current_segment_id,
        toOwnerType: "system",
        toOwnerId: null,
        toSegmentId: after?.current_segment_id ?? null,
        reason
      });
    });

    const handoffAt = new Date().toISOString();

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: handoffAt
    });

    return { success: true, handoffAt, reason };
  });

  app.post("/api/conversations/:conversationId/assign", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    if (!agentId) throw app.httpErrors.forbidden("Current account has no agent profile");

    const { conversationId } = req.params as { conversationId: string };

    await withTenantTransaction(tenantId, async (trx) => {
      const before = await trx("conversations")
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
      if (!before) throw app.httpErrors.notFound("Conversation not found");

      const lockedConversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .forUpdate()
        .select("assigned_agent_id", "current_case_id", "status")
        .first<{ assigned_agent_id: string | null; current_case_id: string | null; status: string } | undefined>();

      if (!lockedConversation) throw app.httpErrors.notFound("Conversation not found");
      if (!lockedConversation.assigned_agent_id) {
        throw app.httpErrors.conflict("This conversation is not reserved for any agent");
      }
      if (lockedConversation.assigned_agent_id !== agentId) {
        throw app.httpErrors.forbidden("This conversation is reserved for another agent");
      }

      const lockedAssignment = await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .forUpdate()
        .select("status", "assigned_agent_id")
        .first<{ status: string | null; assigned_agent_id: string | null } | undefined>();

      if (!lockedAssignment || lockedAssignment.assigned_agent_id !== agentId) {
        throw app.httpErrors.conflict("This conversation is no longer assigned to you");
      }

      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        segmentId: before.current_segment_id,
        triggerType: "agent_assign",
        triggerActorType: "agent",
        triggerActorId: agentId,
        decisionType: "assignment_accept",
        channelType: before.channel_type,
        channelId: before.channel_id,
        decisionSummary: { toOwnerType: "human", assignedAgentId: agentId },
        decisionReason: "accepted_reserved_assignment"
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);
      const teamContext = await getPrimaryTeamContext(trx, tenantId, agentId);

      if (!lockedConversation.current_case_id) {
        throw app.httpErrors.conflict("Conversation has no active case");
      }
      await ownershipService.applyTransition(trx, {
        type: "activate_human_owner",
        tenantId,
        conversationId,
        customerId: before.customer_id,
        caseId: lockedConversation.current_case_id,
        agentId,
        reason: "accepted-reserved-assignment",
        caseStatus: "in_progress"
      });
      const after = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("current_segment_id")
        .first<{ current_segment_id: string | null } | undefined>();

      await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          status: "assigned",
          department_id: teamContext.departmentId,
          team_id: teamContext.teamId,
          assigned_agent_id: agentId,
          handoff_required: false,
          handoff_reason: null,
          assignment_reason: "accepted_reserved_assignment",
          updated_at: new Date()
        });

      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "agent_assigned",
        actor_type: "agent",
        actor_id: agentId,
        payload: { acceptedReservedAssignment: true }
      });
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        executionId,
        transitionType: "queue_to_human",
        actorType: "agent",
        actorId: agentId,
        fromOwnerType: before.current_handler_type,
        fromOwnerId: before.current_handler_id,
        fromSegmentId: before.current_segment_id,
        toOwnerType: "human",
        toOwnerId: agentId,
        toSegmentId: after?.current_segment_id ?? null,
        reason: "accepted_reserved_assignment"
      });
    });

    await cancelAssignmentAcceptTimeout(conversationId);

    const assignedAt = new Date().toISOString();

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: assignedAt
    });

    return { success: true, assignedAt, agentId };
  });

  // ── POST /api/conversations/:conversationId/transfer ─────────────────────────
  // Direct agent-to-agent transfer (no queue re-entry). Only the currently
  // assigned agent (or an admin) may initiate. The target agent immediately
  // receives full conversation ownership and a fresh AI copilot summary.
  app.post("/api/conversations/:conversationId/transfer", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    if (!agentId) throw app.httpErrors.forbidden("Current account has no agent profile");

    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { targetAgentId?: string; reason?: string } | undefined) ?? {};
    const targetAgentId = body.targetAgentId?.trim();
    const reason = body.reason?.trim() || "Agent transferred conversation";

    if (!targetAgentId) throw app.httpErrors.badRequest("targetAgentId is required");
    if (targetAgentId === agentId) throw app.httpErrors.badRequest("Cannot transfer a conversation to yourself");

    await withTenantTransaction(tenantId, async (trx) => {
      const before = await trx("conversations")
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
      if (!before) throw app.httpErrors.notFound("Conversation not found");
      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        segmentId: before.current_segment_id,
        triggerType: "agent_transfer",
        triggerActorType: "agent",
        triggerActorId: agentId,
        decisionType: "manual_transition",
        channelType: before.channel_type,
        channelId: before.channel_id,
        decisionSummary: { toOwnerType: "human", targetAgentId },
        decisionReason: reason
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);
      // Verify the requesting agent is the current assignee (unless admin)
      if (role !== "admin") {
        const conv = await trx("conversations")
          .select("assigned_agent_id")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .first<{ assigned_agent_id: string | null } | undefined>();

        if (!conv) throw app.httpErrors.notFound("Conversation not found");
        if (conv.assigned_agent_id !== agentId) {
          throw app.httpErrors.forbidden("Only the assigned agent may transfer this conversation");
        }
      }

      // Verify target agent exists in this tenant
      const targetExists = await trx("agent_profiles")
        .where({ tenant_id: tenantId, agent_id: targetAgentId })
        .select("agent_id")
        .first();
      if (!targetExists) throw app.httpErrors.notFound("Target agent not found in this tenant");

      const currentCaseId = await resolveCurrentCaseIdOrThrow(trx, tenantId, conversationId, app);
      await ownershipService.applyTransition(trx, {
        type: "activate_human_owner",
        tenantId,
        conversationId,
        customerId: before.customer_id,
        caseId: currentCaseId,
        agentId: targetAgentId,
        reason: "agent-transferred",
        caseStatus: "in_progress"
      });

      await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          status: "assigned",
          assigned_agent_id: targetAgentId,
          handoff_required: false,
          handoff_reason: null,
          assignment_strategy: "manual",
          assignment_reason: "transferred",
          updated_at: new Date()
        });

      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "agent_transferred",
        actor_type: "agent",
        actor_id: agentId,
        payload: JSON.stringify({ targetAgentId, reason })
      });
      const after = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("current_segment_id")
        .first<{ current_segment_id: string | null } | undefined>();
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        executionId,
        transitionType: "human_to_human_transfer",
        actorType: "agent",
        actorId: agentId,
        fromOwnerType: before.current_handler_type,
        fromOwnerId: before.current_handler_id,
        fromSegmentId: before.current_segment_id,
        toOwnerType: "human",
        toOwnerId: targetAgentId,
        toSegmentId: after?.current_segment_id ?? null,
        reason
      });
    });

    const transferredAt = new Date().toISOString();

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: transferredAt
    });

    // Return a fresh copilot snapshot so the receiving agent sees context immediately
    let copilotSnapshot = null;
    try {
      copilotSnapshot = await withTenantTransaction(tenantId, async (trx) => {
        return copilotService.generate(trx, { tenantId, conversationId });
      });
    } catch {
      // Non-critical — transfer succeeds even if copilot generation fails
    }

    return { success: true, transferredAt, targetAgentId, copilot: copilotSnapshot };
  });

  app.post("/api/conversations/:conversationId/resolve", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { closeLinkedTickets?: boolean }) ?? {};
    const closeLinkedTickets = body.closeLinkedTickets === true;

    let ticketsClosed = 0;
    let resolvedCustomerId = "";
    let resolvedCaseId: string | null = null;

    await withTenantTransaction(tenantId, async (trx) => {
      await recordAgentPresenceActivity(trx, tenantId, agentId);
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select(
          "conversation_id",
          "customer_id",
          "current_case_id",
          "assigned_agent_id",
          "channel_type",
          "channel_id",
          "current_handler_type",
          "current_handler_id",
          "current_segment_id"
        )
        .first<{
          conversation_id: string;
          customer_id: string;
          current_case_id: string | null;
          assigned_agent_id: string | null;
          channel_type: string;
          channel_id: string;
          current_handler_type: string | null;
          current_handler_id: string | null;
          current_segment_id: string | null;
        }>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");
      resolvedCustomerId = conversation.customer_id;
      const caseId = conversation.current_case_id;
      if (!caseId) throw app.httpErrors.conflict("Conversation has no active case");
      resolvedCaseId = caseId;
      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        segmentId: conversation.current_segment_id,
        triggerType: "conversation_resolve",
        triggerActorType: agentId ? "agent" : "system",
        triggerActorId: agentId ?? null,
        decisionType: "manual_transition",
        channelType: conversation.channel_type,
        channelId: conversation.channel_id,
        decisionSummary: { toOwnerType: "system", toStatus: "resolved", closeLinkedTickets },
        decisionReason: "conversation-resolved"
      });

      // Resolve the conversation
      await conversationSegmentService.closeCurrentSegment(trx, {
        tenantId,
        conversationId,
        status: "resolved",
        reason: "conversation-resolved"
      });

      await ownershipService.applyTransition(trx, {
        type: "resolve_conversation",
        tenantId,
        conversationId,
        status: "resolved",
        finalOwnerType: "agent",
        finalOwnerId: agentId,
        resolvedByAgentId: agentId
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
        event_type: "resolved",
        actor_type: agentId ? "agent" : "system",
        actor_id: agentId ?? null,
        payload: {}
      });
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        customerId: conversation.customer_id,
        executionId,
        transitionType: "resolved",
        actorType: agentId ? "agent" : "system",
        actorId: agentId ?? null,
        fromOwnerType: conversation.current_handler_type,
        fromOwnerId: conversation.current_handler_id,
        fromSegmentId: conversation.current_segment_id,
        toOwnerType: "system",
        toOwnerId: null,
        toSegmentId: null,
        reason: "conversation-resolved",
        payload: { closeLinkedTickets }
      });

      // Auto-create CSAT survey scheduled for 10 minutes after resolve.
      await trx("csat_surveys")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: conversation.customer_id,
          agent_id: conversation.assigned_agent_id,
          channel_type: conversation.channel_type,
          channel_id: conversation.channel_id,
          status: "scheduled",
          scheduled_at: trx.raw("now() + interval '10 minutes'"),
          expires_at: trx.raw("now() + interval '72 hours'"),
          survey_token: crypto.randomUUID().replaceAll("-", ""),
          payload: {}
        })
        .onConflict(["tenant_id", "case_id"])
        .merge({
          case_id: caseId,
          agent_id: conversation.assigned_agent_id,
          status: "scheduled",
          scheduled_at: trx.raw("now() + interval '10 minutes'"),
          expires_at: trx.raw("now() + interval '72 hours'"),
          updated_at: trx.fn.now()
        });

      // Optionally close all open tickets linked to this conversation
      if (closeLinkedTickets) {
        const openTickets = await trx("tickets")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .whereIn("status", ["open", "in_progress", "pending_customer"])
          .select("ticket_id", "status");

        if (openTickets.length > 0) {
          ticketsClosed = openTickets.length;
          const now = new Date();

          await trx("tickets")
            .whereIn("ticket_id", openTickets.map((t: { ticket_id: string }) => t.ticket_id))
            .update({ status: "resolved", resolved_at: now, updated_at: now });

          // Append audit events for each closed ticket (append-only, no RLS needed via trx)
          await trx("ticket_events").insert(
            openTickets.map((t: { ticket_id: string; status: string }) => ({
              tenant_id: tenantId,
              ticket_id: t.ticket_id,
              event_type: "status_changed",
              from_value: t.status,
              to_value: "resolved",
              actor_type: agentId ? "agent" : "system",
              actor_id: agentId ?? null,
              metadata: JSON.stringify({ reason: "conversation_resolved" })
            }))
          );
        }
      }
    });

    const resolvedAt = new Date().toISOString();

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: resolvedAt
    });

    trackEvent({
      eventType: "conversation_resolved",
      tenantId,
      conversationId,
      caseId: resolvedCaseId
    });

    void scheduleLongTask({
      tenantId,
      customerId: resolvedCustomerId,
      conversationId,
      caseId: resolvedCaseId,
      taskType: "vector_customer_profile_reindex",
      title: `Vector reindex ${resolvedCustomerId}`,
      source: "workflow",
      priority: 70,
      payload: {
        customerId: resolvedCustomerId
      }
    }).catch(() => null);

    return { success: true, resolvedAt, ticketsClosed };
  });

  // ── POST /api/conversations/:conversationId/reopen ────────────────────────────
  // Allows an agent to proactively re-open a resolved conversation for follow-up.
  //
  // Use case: "I said I'd check and get back to you" — agent resolves/closes the
  // session after promising a follow-up, then comes back the next day (or week)
  // and re-opens to send the answer directly to the customer.
  //
  // assignToSelf (default: true) — assigns the conversation to the calling agent.
  // When false, tries to reassign to the last human handler (if still online),
  // otherwise falls back to the calling agent.
  //
  // After reopen the conversation is "human_active" and the reply box is live.
  app.post("/api/conversations/:conversationId/reopen", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { assignToSelf?: boolean }) ?? {};
    const assignToSelf = body.assignToSelf !== false; // default: true

    if (!agentId) {
      throw app.httpErrors.badRequest("Current account has no bound agent profile");
    }

    let newStatus = "";
    let newAssignedAgentId: string | null = null;

    await withTenantTransaction(tenantId, async (trx) => {
      await recordAgentPresenceActivity(trx, tenantId, agentId);

      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("conversation_id", "status", "customer_id", "channel_type", "channel_id")
        .first<{
          conversation_id: string;
          status: string;
          customer_id: string;
          channel_type: string;
          channel_id: string;
        } | undefined>();

      if (!conversation) throw app.httpErrors.notFound("Conversation not found");
      if (!["resolved", "closed"].includes(conversation.status)) {
        throw app.httpErrors.badRequest("Only resolved or closed conversations can be reopened");
      }

      // Determine which agent becomes the new owner
      let assignedAgentId = agentId;

      if (!assignToSelf) {
        // Try to hand back to the last human handler if they are still online
        const lastSegment = await trx("conversation_segments")
          .where({
            tenant_id: tenantId,
            conversation_id: conversationId,
            owner_type: "human"
          })
          .orderBy("started_at", "desc")
          .select("owner_agent_id")
          .first<{ owner_agent_id: string | null } | undefined>();

        if (lastSegment?.owner_agent_id && lastSegment.owner_agent_id !== agentId) {
          const lastAgent = await trx("agent_profiles")
            .where({ tenant_id: tenantId, agent_id: lastSegment.owner_agent_id })
            .select("agent_id", "last_seen_at")
            .first<{ agent_id: string; last_seen_at: string | Date | null } | undefined>();

          const isOnline =
            lastAgent?.last_seen_at &&
            new Date(lastAgent.last_seen_at).getTime() > Date.now() - 30 * 60 * 1000;

          if (isOnline && lastAgent) {
            assignedAgentId = lastAgent.agent_id;
          }
        }
      }

      // Reactivate the conversation
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
        agentId: assignedAgentId,
        reason: "agent-reopened-for-followup",
        caseStatus: "in_progress"
      });

      // Update queue assignment to match
      await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .update({
          status: "assigned",
          assigned_agent_id: assignedAgentId,
          handoff_required: false,
          handoff_reason: null,
          updated_at: trx.fn.now()
        });

      // Audit trail
      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "reopened",
        actor_type: "agent",
        actor_id: agentId,
        payload: { assignToSelf, assignedAgentId }
      });

      newStatus = "human_active";
      newAssignedAgentId = assignedAgentId;
    });

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: new Date().toISOString()
    });

    trackEvent({ eventType: "conversation_reopened", tenantId, conversationId });

    return { success: true, status: newStatus, assignedAgentId: newAssignedAgentId };
  });

  // ── GET /api/conversations/:conversationId/ai-traces ─────────────────────────
  // Returns the last 20 AI orchestrator traces for a conversation.
  // Powers the AI Transparency panel in the agent workspace copilot tab.
  app.get("/api/conversations/:conversationId/ai-traces", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("ai_traces")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .orderBy("created_at", "desc")
        .limit(20)
        .select(
          "trace_id",
          "supervisor",
          "steps",
          "skills_called",
          "token_usage",
          "total_duration_ms",
          "handoff_reason",
          "error",
          "created_at"
        );

      return {
        traces: rows.map((r) => ({
          traceId: r.trace_id as string,
          supervisor: r.supervisor as string,
          steps: (typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps) as unknown[],
          skillsCalled: (typeof r.skills_called === "string"
            ? JSON.parse(r.skills_called)
            : r.skills_called) as string[],
          tokenUsage: (typeof r.token_usage === "string"
            ? JSON.parse(r.token_usage)
            : r.token_usage) as { prompt: number; completion: number; total: number },
          totalDurationMs: r.total_duration_ms as number,
          handoffReason: (r.handoff_reason as string | null) ?? null,
          error: (r.error as string | null) ?? null,
          createdAt: new Date(r.created_at as string).toISOString()
        }))
      };
    });
  });

  app.get("/api/conversations/:conversationId/tasks", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("async_tasks")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .orderBy("created_at", "desc")
        .limit(50)
        .select(
          "task_id",
          "task_type",
          "title",
          "source",
          "status",
          "result_summary",
          "started_at",
          "completed_at",
          "published_at",
          "created_at"
        );

      return {
        tasks: rows.map((row) => ({
          taskId: row.task_id as string,
          taskType: row.task_type as string,
          title: row.title as string,
          source: row.source as string,
          status: row.status as string,
          resultSummary: (row.result_summary as string | null) ?? null,
          startedAt: row.started_at ? toIsoString(row.started_at as string) : null,
          completedAt: row.completed_at ? toIsoString(row.completed_at as string) : null,
          publishedAt: row.published_at ? toIsoString(row.published_at as string) : null,
          createdAt: toIsoString(row.created_at as string)
        }))
      };
    });
  });

  app.get("/api/conversations/:conversationId/tasks/:taskId", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId, taskId } = req.params as { conversationId: string; taskId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const task = await trx("async_tasks")
        .where({ tenant_id: tenantId, conversation_id: conversationId, task_id: taskId })
        .select(
          "task_id",
          "task_type",
          "title",
          "source",
          "status",
          "result_summary",
          "result_meta",
          "artifact_dir",
          "last_error",
          "created_at",
          "started_at",
          "completed_at",
          "published_at"
        )
        .first();

      if (!task) throw app.httpErrors.notFound("Task not found");

      const artifacts = await trx("async_task_artifacts")
        .where({ tenant_id: tenantId, conversation_id: conversationId, task_id: taskId })
        .orderBy("sequence_no", "asc")
        .select("artifact_id", "kind", "file_name", "file_path", "mime_type", "sequence_no", "size_bytes", "content_preview", "metadata", "created_at");

      return {
        task: {
          taskId: task.task_id as string,
          taskType: task.task_type as string,
          title: task.title as string,
          source: task.source as string,
          status: task.status as string,
          resultSummary: (task.result_summary as string | null) ?? null,
          resultMeta: parseJsonObject(task.result_meta),
          artifactDir: (task.artifact_dir as string | null) ?? null,
          lastError: (task.last_error as string | null) ?? null,
          createdAt: toIsoString(task.created_at as string),
          startedAt: task.started_at ? toIsoString(task.started_at as string) : null,
          completedAt: task.completed_at ? toIsoString(task.completed_at as string) : null,
          publishedAt: task.published_at ? toIsoString(task.published_at as string) : null
        },
        artifacts: artifacts.map((row) => ({
          artifactId: row.artifact_id as string,
          kind: row.kind as string,
          fileName: row.file_name as string,
          filePath: row.file_path as string,
          mimeType: row.mime_type as string,
          sequenceNo: Number(row.sequence_no),
          sizeBytes: Number(row.size_bytes),
          contentPreview: (row.content_preview as string | null) ?? null,
          metadata: parseJsonObject(row.metadata),
          createdAt: toIsoString(row.created_at as string)
        }))
      };
    });
  });

  app.post("/api/conversations/:conversationId/tasks", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as {
      title?: string;
      note?: string;
      documents?: Array<{ kind?: string; fileName?: string; content?: string; mimeType?: string; metadata?: Record<string, unknown> }>;
    } | undefined) ?? {};

    const title = body.title?.trim();
    if (!title) throw app.httpErrors.badRequest("title is required");

    const conversation = await withTenantTransaction(tenantId, async (trx) => {
      return trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id")
        .first<{ customer_id: string }>();
    });
    if (!conversation) throw app.httpErrors.notFound("Conversation not found");

    await scheduleLongTask({
      tenantId,
      customerId: conversation.customer_id,
      conversationId,
      taskType: "conversation_note_archive",
      title,
      source: auth.agentId ? "agent" : "workflow",
      createdById: auth.sub,
      payload: {
        note: body.note?.trim() ?? "",
        documents: Array.isArray(body.documents)
          ? body.documents.map((item) => ({
              kind: typeof item.kind === "string" ? item.kind : "document",
              fileName: typeof item.fileName === "string" ? item.fileName : "document.md",
              content: typeof item.content === "string" ? item.content : "",
              mimeType: typeof item.mimeType === "string" ? item.mimeType : "text/markdown",
              metadata: item.metadata ?? {}
            }))
          : []
      }
    });

    return { queued: true };
  });

  // ── POST /api/conversations/:conversationId/skills/execute ────────────────────
  // Agent-triggered one-click skill execution.
  // Flow: governance gate → skill.execute() → write system message → emit realtime
  app.post("/api/conversations/:conversationId/skills/execute", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { skillName?: string; parameters?: Record<string, unknown> }) ?? {};

    if (!body.skillName?.trim()) throw app.httpErrors.badRequest("skillName is required");
    const skillName = body.skillName.trim();

    const skill = skillRegistry.get(skillName);
    if (!skill) throw app.httpErrors.badRequest(`Skill "${skillName}" is not registered on this server`);

    const parameters = body.parameters ?? {};

    const result = await withTenantTransaction(tenantId, async (trx) => {
      await recordAgentPresenceActivity(trx, tenantId, auth.agentId ?? undefined);
      // Look up the conversation's queue assignment to get module/skillGroup for policy scoping
      const assignment = await trx("queue_assignments")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("module_id", "skill_group_id")
        .first<{ module_id: string | null; skill_group_id: string | null }>();

      // Build policy map and evaluate execution gate
      const policyMap = await getBoundRuntimePolicies(trx, {
        tenantId,
        conversationId,
        moduleId: assignment?.module_id ?? null,
        skillGroupId: assignment?.skill_group_id ?? null,
        actorType: "agent"
      });

      const gate = await evaluateSkillExecutionGate(trx, {
        tenantId,
        conversationId,
        moduleId: assignment?.module_id ?? null,
        skillGroupId: assignment?.skill_group_id ?? null,
        actorType: "agent",
        policyMap,
        skillName,
        args: parameters,
        requesterId: auth.sub
      });

      if (gate.action === "deny") {
        await recordSkillInvocation(trx, {
          tenantId,
          conversationId,
          skillName,
          actorType: "agent",
          args: parameters,
          decision: "blocked",
          denyReason: gate.reason,
          result: { message: gate.detail },
          policyMap
        });
        throw app.httpErrors.forbidden(gate.detail);
      }

      // Execute the skill or enqueue it as an async task when it may block.
      const startedAt = Date.now();
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id")
        .first<{ customer_id: string }>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");

      const skillResult = skill.executionMode === "async"
        ? await enqueueAsyncAgentSkillExecution({
            tenantId,
            customerId: conversation.customer_id,
            conversationId,
            skillName,
            parameters,
            requesterId: auth.sub
          })
        : await skill.execute(parameters, { tenantId, db: trx });
      await recordSkillInvocation(trx, {
        tenantId,
        conversationId,
        skillName,
        actorType: "agent",
        args: parameters,
        decision: "allowed",
        durationMs: Date.now() - startedAt,
        result: skillResult,
        policyMap
      });

      // Persist the result as a system message in the conversation timeline
      const [msgRow] = await trx("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          direction: "system",
          message_type: skill.executionMode === "async" ? "task_update" : "skill_result",
          sender_type: auth.agentId ? "agent" : "system",
          sender_id: auth.sub,
          content: JSON.stringify({ skillName, result: skillResult })
        })
        .returning("message_id");

      return {
        skillName,
        result: skillResult,
        messageId: (msgRow as { message_id: string }).message_id
      };
    });

    // Notify subscribers so the timeline panel reloads the new system message
    realtimeEventBus.emitEvent("message.sent", {
      tenantId,
      conversationId,
      occurredAt: new Date().toISOString()
    });

    trackEvent({ eventType: "skill_executed", tenantId, conversationId, payload: { skillName: result.skillName } });

    return result;
  });

  // ── GET /api/conversations/:conversationId/skills/schemas ─────────────────────
  // Returns the parameter schemas for all registered skills.
  // The agent workspace uses this to render inline parameter forms before execution.
  app.get("/api/conversations/:conversationId/skills/schemas", async (req) => {
    requireAuth(app, req);
    // Return all registered skills with their parameter schemas.
    // Governance is enforced at execution time; schemas are safe to expose.
    const schemas = skillRegistry.list().map((skill) => ({
      name: skill.name,
      description: skill.description,
      parameters: skill.parameters
    }));
    return { schemas };
  });
}

function readView(req: { query?: unknown }) {
  const v = (req.query as { view?: string } | undefined)?.view;
  if (v === "mine" || v === "pending" || v === "monitor" || v === "follow_up") return v;
  return "all";
}

function requireAuth(app: FastifyInstance, req: { auth?: { sub: string; tenantId: string; agentId?: string | null } }) {
  if (!req.auth) {
    throw app.httpErrors.unauthorized("Access token required");
  }
  return req.auth;
}

export { db };

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

function buildTsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return tokens.join(" | ");
}

function extractOrderLikeTokens(input: string): string[] {
  const matches = input.match(/\b[A-Z0-9-]{6,24}\b/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

function normalizeSkillNames(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

async function assertConversationAccess(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    agentId?: string;
    role: string;
    app: FastifyInstance;
  }
) {
  if (input.role === "admin" || !input.agentId) return;

  const conv = await trx("conversations")
    .where({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId
    })
    .select("assigned_agent_id", "conversation_id")
    .first<{ assigned_agent_id: string | null; conversation_id: string } | undefined>();

  if (!conv?.conversation_id) throw input.app.httpErrors.notFound("Conversation not found");

  if (conv.assigned_agent_id && conv.assigned_agent_id !== input.agentId) {
    throw input.app.httpErrors.forbidden("This conversation is assigned to another agent");
  }
}

async function resolveConversationCaseSnapshot(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  return trx("conversation_cases")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .orderByRaw("CASE WHEN status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END")
    .orderBy("last_activity_at", "desc")
    .orderBy("opened_at", "desc")
    .select("case_id", "status", "case_type", "title", "summary", "opened_at", "last_activity_at")
    .first<{
      case_id: string;
      status: string;
      case_type: string | null;
      title: string | null;
      summary: string | null;
      opened_at: string;
      last_activity_at: string;
    } | undefined>();
}

async function resolveCurrentCaseIdOrThrow(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string,
  app: FastifyInstance
) {
  const row = await trx("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();
  if (!row?.current_case_id) {
    throw app.httpErrors.conflict("Conversation has no active case");
  }
  return row.current_case_id;
}

async function recordAgentPresenceActivity(
  trx: Knex.Transaction,
  tenantId: string,
  agentId?: string
) {
  if (!agentId) return;
  await presenceService.recordActivity(trx, { tenantId, agentId });
}

async function enqueueAsyncAgentSkillExecution(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  skillName: string;
  parameters: Record<string, unknown>;
  requesterId: string;
}) {
  const task = mapAsyncConversationSkill(input.skillName, input.parameters);
  if (!task) {
    return {
      queued: false,
      error: "async_skill_mapping_missing",
      message: `Skill ${input.skillName} is marked async but cannot be scheduled.`
    };
  }

  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    taskType: task.taskType,
    title: task.title,
    source: "agent",
    createdById: input.requesterId,
    priority: 80,
    payload: task.payload
  });

  return {
    queued: true,
    async: true,
    taskType: task.taskType,
    message: task.message
  };
}

function mapAsyncConversationSkill(skillName: string, parameters: Record<string, unknown>) {
  if (skillName === "lookup_order") {
    const orderId = typeof parameters.orderId === "string" ? parameters.orderId.trim() : "";
    return {
      taskType: "lookup_order_external",
      title: `Order lookup ${orderId || "request"}`,
      message: orderId ? `Order lookup queued for ${orderId}.` : "Order lookup queued.",
      payload: { orderId }
    };
  }

  if (skillName === "track_shipment") {
    const trackingNumber = typeof parameters.trackingNumber === "string" ? parameters.trackingNumber.trim() : "";
    const carrier = typeof parameters.carrier === "string" && parameters.carrier.trim() ? parameters.carrier.trim() : "JNE";
    return {
      taskType: "track_shipment_external",
      title: `Shipment tracking ${trackingNumber || "request"}`,
      message: trackingNumber ? `Shipment tracking queued for ${trackingNumber}.` : "Shipment tracking queued.",
      payload: { trackingNumber, carrier }
    };
  }

  return null;
}
