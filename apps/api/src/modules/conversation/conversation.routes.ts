import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AIMessage } from "../../../../../packages/ai-sdk/src/index.js";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import { conversationTimeoutQueue, outboundQueue, routingQueue } from "../../infra/queue/queues.js";
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
import { RoutingContextService } from "../routing-engine/routing-context.service.js";
import { UnifiedRoutingEngineService } from "../routing-engine/unified-routing-engine.service.js";
import { RoutingPlanRepository } from "../routing-engine/routing-plan.repository.js";
import { RoutingPlanStepService } from "../routing-engine/routing-plan-step.service.js";
import { recommendCapabilityScripts } from "../agent-skills/capability-recommendation.service.js";
import { listTenantSkillsForPlanning } from "../agent-skills/skill-definition.service.js";
import { suggestCapabilities } from "../agent-skills/skill-planner.service.js";
import { validateCapabilitySuggestions } from "../agent-skills/planner-guard.service.js";
import { runCapabilityScriptExecution } from "../tasks/task-script-execution.service.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import {
  evaluateSkillExecutionGate,
  getBoundRuntimePolicies,
  recordSkillInvocation
} from "../skills/runtime-governance.service.js";
import { trackEvent } from "../analytics/analytics.service.js";
import { CaseTaskService } from "../tasks/case-task.service.js";
import {
  getConversationInsightRecord,
  getCustomerProfileRecord,
  buildCustomerIntelligenceContext
} from "../memory/customer-intelligence.service.js";
import { CustomerAnalysisService } from "../memory/customer-analysis.service.js";
import { cancelAssignmentAcceptTimeout, cancelFollowUpTimeout, scheduleAssignmentAcceptTimeout } from "../sla/conversation-sla.service.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import { recordSkillExecutionAsTask } from "../tasks/ai-task-bridge.service.js";
import { summarizeSkillResult } from "../ai/fact-layer.service.js";
import { enqueueQaReviewForCase } from "../quality-admin/qa-v2.service.js";

const copilotService = new CopilotService();
const conversationCaseService = new ConversationCaseService();
const conversationSegmentService = new ConversationSegmentService();
const ownershipService = new OwnershipService();
const presenceService = new PresenceService();
const dispatchAuditService = new DispatchAuditService();
const routingContextService = new RoutingContextService();
const unifiedRoutingEngineService = new UnifiedRoutingEngineService();
const routingPlanRepository = new RoutingPlanRepository();
const routingPlanStepService = new RoutingPlanStepService();
const caseTaskService = new CaseTaskService();
const customerAnalysisService = new CustomerAnalysisService();

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
      const unreadCounts = buildUnreadCountsSubquery(trx, tenantId);

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
          "c.chat_type",
          "c.chat_external_ref",
          "c.chat_name",
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
          "asm.display_name as assigned_agent_name",
          "asm.employee_no as assigned_agent_employee_no"
        )
        .select(trx.raw("coalesce(uc.unread_count, 0)::int as unread_count"))
        .select(trx.raw(`
          (
            cc.current_owner_type = 'agent'
            AND cc.current_owner_id = ?
            AND cc.status IN ('waiting_customer', 'waiting_internal')
          ) as has_pending_case_work
        `, [agentId ?? null]))
        .where("c.tenant_id", tenantId);

      applyConversationViewFilter(query, { view, agentId, role });

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

      const viewSummaries = await getConversationViewSummaries(trx, { tenantId, agentId, role });

      return { conversations: page, hasMore, nextCursor, viewSummaries };
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
          "c.chat_type",
          "c.chat_external_ref",
          "c.chat_name",
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
          "c.assigned_agent_id"
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

      return getRecentMessages(tenantId, conversationId, trx);
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
        .select("conversation_id")
        .first<{ conversation_id: string }>();

      const pref = await trx("conversation_skill_preferences")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("preferred_skills")
        .first<{ preferred_skills: unknown }>();

      const result = await recommendCapabilityScripts(trx, {
        tenantId,
        conversationId,
        actorType,
        capabilityScope: null,
        preferredSkills: parseJsonStringArray(pref?.preferred_skills)
      });

      return {
        conversationId,
        actorType,
        ...result
      };
    });
  });

  app.get("/api/conversations/:conversationId/executors/schemas", async (req) => {
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

      const conversation = await loadConversationExecutionContext(trx, tenantId, conversationId);
      const availableSkills = await listTenantSkillsForPlanning(trx, {
        tenantId,
        channelType: conversation.channelType,
        actorRole: "agent",
        ownerMode: "agent"
      });

      const schemas = availableSkills.flatMap((skill) =>
        skill.scripts
          .filter((script) => script.enabled)
          .map((script) => ({
            name: script.scriptKey,
            description: skill.description ?? script.name ?? skill.name,
            parameters: normalizeConversationSkillSchema(skill.inputSchema)
          }))
      );

      return { schemas };
    });
  });

  app.post("/api/conversations/:conversationId/executors/execute", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as {
      executorName?: string;
      parameters?: Record<string, unknown>;
    } | undefined) ?? {};

    const executorName = typeof body.executorName === "string" ? body.executorName.trim() : "";
    const parameters = body.parameters && typeof body.parameters === "object" ? body.parameters : {};

    if (!executorName) {
      throw app.httpErrors.badRequest("executorName is required");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });
      await recordAgentPresenceActivity(trx, tenantId, agentId);

      const conversation = await loadConversationExecutionContext(trx, tenantId, conversationId);
      const policyMap = await getBoundRuntimePolicies(trx, {
        tenantId,
        conversationId,
        actorType: "agent"
      });
      const gate = await evaluateSkillExecutionGate(trx, {
        tenantId,
        conversationId,
        actorType: "agent",
        policyMap,
        skillName: executorName,
        args: parameters,
        requesterId: auth.sub
      });
      if (gate.action !== "allow") {
        await recordSkillInvocation(trx, {
          tenantId,
          conversationId,
          skillName: executorName,
          actorType: "agent",
          args: parameters,
          decision: "blocked",
          denyReason: gate.reason
        });
        throw app.httpErrors.forbidden(gate.detail);
      }

      const availableSkills = await listTenantSkillsForPlanning(trx, {
        tenantId,
        channelType: conversation.channelType,
        actorRole: "agent",
        ownerMode: "agent"
      });
      const selectedSkill = availableSkills.find((skill) =>
        skill.scripts.some((script) => script.enabled && script.scriptKey === executorName)
      );
      const script = selectedSkill?.scripts.find((item) => item.enabled && item.scriptKey === executorName);

      if (!selectedSkill || !script) {
        throw app.httpErrors.notFound(`Executor ${executorName} is not available for this conversation`);
      }

      const normalizedParameters = normalizeSkillExecutionArgs({
        inputSchema: selectedSkill.inputSchema,
        parameters
      });

      const startedAt = Date.now();
      try {
        const result = await runCapabilityScriptExecution({
          tenantId,
          customerId: conversation.customerId,
          conversationId,
          capability: {
            capabilityId: selectedSkill.capabilityId,
            slug: selectedSkill.slug,
            name: selectedSkill.name,
            description: selectedSkill.description
          },
          script: {
            scriptKey: script.scriptKey,
            name: script.name,
            fileName: script.fileName,
            language: script.language,
            sourceCode: script.sourceCode,
            requirements: script.requirements,
            envRefs: script.envRefs,
            envBindings: script.envBindings
          },
          args: normalizedParameters
        });

        await recordSkillInvocation(trx, {
          tenantId,
          conversationId,
          skillName: executorName,
          actorType: "agent",
          args: normalizedParameters,
          decision: "allowed",
          durationMs: Date.now() - startedAt,
          result
        });

        return {
          skillName: executorName,
          result,
          messageId: crypto.randomUUID()
        };
      } catch (error) {
        await recordSkillInvocation(trx, {
          tenantId,
          conversationId,
          skillName: executorName,
          actorType: "agent",
          args: normalizedParameters,
          decision: "error",
          durationMs: Date.now() - startedAt,
          result: { error: (error as Error).message }
        });
        throw app.httpErrors.badRequest((error as Error).message);
      }
    });
  });

  app.post("/api/conversations/:conversationId/skills/assist", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as { sourceMessageId?: string | null } | undefined) ?? {};

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, {
        tenantId,
        conversationId,
        agentId,
        role,
        app
      });

      const conversation = await loadConversationExecutionContext(trx, tenantId, conversationId);
      const aiSettings = await resolveTenantAISettingsForScene(trx, tenantId, "agent_assist");
      if (!aiSettings) {
        return { assist: null, reason: "no_ai_provider" };
      }

      const availableSkills = await listTenantSkillsForPlanning(trx, {
        tenantId,
        channelType: conversation.channelType,
        actorRole: "agent",
        ownerMode: "agent"
      });
      if (availableSkills.length === 0) {
        return { assist: null, reason: "no_available_skills" };
      }

      const [aiMessages, customerContext] = await Promise.all([
        loadConversationPlannerMessages(trx, tenantId, conversationId),
        buildCustomerIntelligenceContext(trx, tenantId, conversationId, conversation.customerId).catch(() => null)
      ]);

      // Inject customer context as a lightweight preamble so the Planner
      // understands who the customer is and what they have been discussing.
      const plannerMessages = buildPlannerMessagesWithContext(aiMessages, customerContext);

      const capabilitySuggestions = await suggestCapabilities({
        provider: aiSettings.provider,
        model: aiSettings.model,
        messages: plannerMessages,
        temperature: aiSettings.temperature,
        maxTokens: aiSettings.maxTokens,
        skills: availableSkills
      });

      const validatedSuggestions = await validateCapabilitySuggestions(trx, {
        tenantId,
        conversationId,
        suggestions: capabilitySuggestions,
        availableSkills
      });
      const assistedSkill = validatedSuggestions.candidates[0]?.skill ?? null;
      if (!assistedSkill) {
        return { assist: null, reason: "no_candidate_capability" };
      }

      const sourceMessage = await resolveAssistSourceMessage(
        trx,
        tenantId,
        conversationId,
        body.sourceMessageId ?? null,
        buildRequestOrigin(req)
      );
      if (!sourceMessage) {
        return { assist: null, reason: "no_source_message" };
      }

      const args = await extractSkillAssistArgs({
        provider: aiSettings.provider,
        model: aiSettings.model,
        temperature: aiSettings.temperature,
        maxTokens: aiSettings.maxTokens,
        skill: assistedSkill,
        messages: plannerMessages,
        sourceMessageText: sourceMessage.text,
        sourceAttachments: sourceMessage.attachments,
        customerContext
      });

      const script = assistedSkill.scripts.find((item) => item.enabled);
      if (!script) {
        return { assist: null, reason: "no_script_available" };
      }

      const normalizedArgs = normalizeSkillExecutionArgs({
        inputSchema: assistedSkill.inputSchema,
        parameters: args,
        sourceAttachments: sourceMessage.attachments
      });

      const missingRequiredArgs = findMissingRequiredSkillArgs(assistedSkill.inputSchema, normalizedArgs);
      if (missingRequiredArgs.length > 0) {
        const needInputResult = buildNeedInputAssistResult({
          skillName: script.scriptKey,
          inputSchema: assistedSkill.inputSchema,
          missingFields: missingRequiredArgs
        });
        await recordSkillInvocation(trx, {
          tenantId,
          conversationId,
          skillName: script.scriptKey,
          actorType: "agent",
          args: normalizedArgs,
          decision: "blocked",
          denyReason: "missing_required_args",
          result: needInputResult
        });
        return {
          assist: {
            skillName: script.scriptKey,
            sourceMessageId: sourceMessage.messageId,
            sourceMessagePreview: sourceMessage.text,
            parameters: normalizedArgs,
            result: needInputResult
          }
        };
      }

      const startedAt = Date.now();
      const result = await runCapabilityScriptExecution({
        tenantId,
        customerId: conversation.customerId,
        conversationId,
        capability: {
          capabilityId: assistedSkill.capabilityId,
          slug: assistedSkill.slug,
          name: assistedSkill.name,
          description: assistedSkill.description
        },
        script: {
          scriptKey: script.scriptKey,
          name: script.name,
          fileName: script.fileName,
          language: script.language,
          sourceCode: script.sourceCode,
          requirements: script.requirements,
          envRefs: script.envRefs,
          envBindings: script.envBindings
        },
        args: normalizedArgs
      });

      await recordSkillInvocation(trx, {
        tenantId,
        conversationId,
        skillName: script.scriptKey,
        actorType: "agent",
        args: normalizedArgs,
        decision: "allowed",
        durationMs: Date.now() - startedAt,
        result
      });

      // ── Task Bridge: auto-generate case_task for agent skill execution ──
      await recordSkillExecutionAsTask(trx, {
        tenantId,
        conversationId,
        caseId: conversation.caseId ?? null,
        customerId: conversation.customerId ?? null,
        skillName: script.scriptKey,
        args: normalizedArgs,
        resultSummary: summarizeSkillResult(result as Record<string, unknown>) || "执行完成",
        creatorType: "agent",
        creatorId: agentId ?? null
      }).catch(() => null);

      // Post-process raw skill result through LLM so the frontend receives
      // a clean customerReply + structured timeline (if applicable) instead
      // of raw pipe-delimited text from the Python script.
      const displayResult = await formatSkillResultForDisplay({
        provider: aiSettings.provider,
        model: aiSettings.model,
        temperature: aiSettings.temperature,
        maxTokens: aiSettings.maxTokens,
        rawResult: result,
        sourceMessageText: sourceMessage.text,
        customerContext
      }).catch(() => result); // fallback to raw result on LLM error

      return {
        assist: {
          skillName: script.scriptKey,
          sourceMessageId: sourceMessage.messageId,
          sourceMessagePreview: sourceMessage.text,
          parameters: normalizedArgs,
          result: displayResult
        }
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

      const [profile, latestInsight, historyRows, sentimentRows, memoryRows, stateRows] = await Promise.all([
        getCustomerProfileRecord(trx, tenantId, base.customer_id),
        getConversationInsightRecord(trx, tenantId, conversationId),
        trx("conversation_cases as cc")
          .join("conversations as c", function joinConversation() {
            this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
          })
          .leftJoin("conversation_memory_snapshots as ci", function joinSummary() {
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
            "ci.intent as last_intent",
            "ci.sentiment as last_sentiment"
          )
          .orderBy("cc.last_activity_at", "desc")
          .limit(8),
        trx("conversation_cases as cc")
          .leftJoin("conversation_memory_snapshots as ci", function joinSummary() {
            this.on("ci.case_id", "=", "cc.case_id").andOn("ci.tenant_id", "=", "cc.tenant_id");
          })
          .where({ "cc.tenant_id": tenantId, "cc.customer_id": base.customer_id })
          .whereNotNull("ci.sentiment")
          .select("cc.case_id", "cc.last_activity_at", "ci.sentiment as last_sentiment")
          .orderBy("cc.last_activity_at", "desc")
          .limit(10),
        trx("customer_memory_units")
          .where({ tenant_id: tenantId, customer_id: base.customer_id, status: "active" })
          .where((builder) => {
            builder.whereNull("expires_at").orWhere("expires_at", ">", trx.fn.now());
          })
          .select("memory_type", "title", "summary", "salience", "updated_at")
          .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
          .limit(8),
        trx("customer_memory_states")
          .where({ tenant_id: tenantId, customer_id: base.customer_id, status: "active" })
          .select("state_type", "state_payload", "updated_at")
          .orderBy("updated_at", "desc")
          .limit(6),
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

      const memoryItems = memoryRows.map((row) => ({
        memoryType: String(row.memory_type),
        title: row.title ? String(row.title) : null,
        summary: String(row.summary ?? ""),
        salience: Number(row.salience ?? 0),
        updatedAt: toIsoString(row.updated_at as string)
      }));

      const stateSnapshots = stateRows.map((row) => ({
        stateType: String(row.state_type),
        payload: parseJsonObject(row.state_payload),
        updatedAt: toIsoString(row.updated_at as string)
      }));

      const history = historyRows.map((row) => ({
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
      }));

      const aiAnalysis = await customerAnalysisService.generate(trx, {
        tenantId,
        customerId: base.customer_id,
        conversationId,
        customerName: base.display_name,
        customerLanguage: base.language,
        profileSummary: profile?.profileSummary ?? null,
        latestInsight,
        memoryItems: memoryItems.map((item) => ({
          memoryType: item.memoryType,
          title: item.title,
          summary: item.summary,
          salience: item.salience
        })),
        stateSnapshots: stateSnapshots.map((item) => ({
          stateType: item.stateType,
          payload: item.payload
        })),
        history: history.map((item) => ({
          summary: item.summary,
          intent: item.intent,
          sentiment: item.sentiment
        })),
        orderClues
      });

      const kbKeywords = [base.last_message_preview, latestInsight?.summary, profile?.profileSummary, orderClues.join(" ")]
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
        history,
        latestConversationIntelligence: latestInsight
          ? {
              summary: latestInsight.summary,
              intent: latestInsight.lastIntent,
              sentiment: latestInsight.lastSentiment,
              keyEntities: latestInsight.keyEntities
            }
          : null,
        memoryItems,
        stateSnapshots,
        orderClues,
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
      attachments?: Array<{ url?: string; mimeType?: string; fileName?: string }>;
      replyToMessageId?: string;
      reactionEmoji?: string;
      reactionToMessageId?: string;
      channelId?: string;
      channelType?: string;
    };

    const attachments = normalizeReplyAttachments(body);
    const replyText = (body.text ?? "").trim();
    const outboundMessages = buildReplyMessages({
      text: replyText,
      attachments,
      agentId,
      replyToMessageId: body.replyToMessageId,
      reactionEmoji: body.reactionEmoji,
      reactionToMessageId: body.reactionToMessageId
    });

    if (outboundMessages.length === 0) {
      throw app.httpErrors.badRequest("Reply text, reaction, or attachments are required");
    }

    const summary = await withTenantTransaction(tenantId, async (trx) => {
      return getConversationSummary(tenantId, conversationId, trx);
    });

    if (!summary) throw app.httpErrors.notFound("Conversation not found");

    // Exclusive-assignment guard: only the assigned agent (or admin) may reply
    if (role !== "admin" && agentId) {
      const assignedId = (summary as { assigned_agent_id?: string | null }).assigned_agent_id ?? null;
      if (assignedId && assignedId !== agentId) {
        throw app.httpErrors.forbidden("Only the assigned agent may reply to this conversation");
      }
    }

    const [replyContext, reactionContext] = await withTenantTransaction(tenantId, async (trx) => {
      return Promise.all([
        resolveReplyContext(tenantId, body.replyToMessageId, trx),
        resolveReplyContext(tenantId, body.reactionToMessageId, trx)
      ]);
    });

    for (const message of outboundMessages) {
      await outboundQueue.add(
        "send-outbound",
        {
          tenantId,
          conversationId,
          channelId: body.channelId ?? (summary.channel_id as string),
          channelType: body.channelType ?? (summary.channel_type as string),
          message: {
            ...message,
            replyToMessageId: message.replyToMessageId ?? replyContext.replyToMessageId ?? undefined,
            replyToExternalId: message.replyToMessageId ? replyContext.replyToExternalId ?? undefined : undefined,
            reactionMessageId: message.reactionMessageId ? reactionContext.replyToMessageId ?? undefined : undefined,
            reactionExternalId: message.reactionMessageId ? reactionContext.replyToExternalId ?? undefined : undefined
          }
        },
        { removeOnComplete: 100, removeOnFail: 50 }
      );
    }

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

    const handoffResult = await withTenantTransaction(tenantId, async (trx) => {
      const before = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id", "channel_id", "channel_type", "current_handler_type", "current_handler_id", "current_segment_id", "current_case_id")
        .first<{
          customer_id: string;
          channel_id: string;
          channel_type: string;
          current_handler_type: string | null;
          current_handler_id: string | null;
          current_segment_id: string | null;
          current_case_id: string | null;
        } | undefined>();
      if (!before) throw app.httpErrors.notFound("Conversation not found");
      await recordAgentPresenceActivity(trx, tenantId, agentId);

      const routingContext = await routingContextService.build(trx, {
        tenantId,
        conversationId,
        customerId: before.customer_id,
        channelType: before.channel_type,
        channelId: before.channel_id
      });
      const routingPlan = await unifiedRoutingEngineService.createAgentHandoffPlan(trx, routingContext);
      const planId = await routingPlanRepository.create(trx, routingPlan);
      await routingPlanStepService.record(trx, {
        tenantId,
        planId,
        stepType: "agent_handoff_plan_created",
        status: "completed",
        payload: {
          mode: routingPlan.mode,
          action: routingPlan.action,
          selectedOwnerType: routingPlan.statusPlan.selectedOwnerType,
          aiAgentId: routingPlan.target.aiAgentId,
          fallbackAgentId: routingPlan.fallback?.agentId ?? null
        }
      });

      const executionId = await dispatchAuditService.recordExecution(trx, {
        tenantId,
        conversationId,
        caseId: before.current_case_id,
        customerId: before.customer_id,
        segmentId: before.current_segment_id,
        triggerType: "agent_handoff",
        triggerActorType: agentId ? "agent" : "system",
        triggerActorId: agentId ?? null,
        decisionType: "routing_plan",
        channelType: before.channel_type,
        channelId: before.channel_id,
        routingRuleId: routingPlan.trace.aiSelection.routingRuleId,
        routingRuleName: routingPlan.trace.aiSelection.routingRuleName,
        matchedConditions: routingPlan.trace.aiSelection.matchedConditions,
        inputSnapshot: {
          currentHandlerType: before.current_handler_type ?? null,
          currentHandlerId: before.current_handler_id ?? null,
          reason
        },
        decisionSummary: {
          planId,
          selectedOwnerType: routingPlan.statusPlan.selectedOwnerType,
          aiAgentId: routingPlan.target.aiAgentId,
          aiAgentName: routingPlan.target.aiAgentName,
          fallbackAgentId: routingPlan.fallback?.agentId ?? null
        },
        decisionReason: routingPlan.trace.decision.reason,
        candidates: [
          ...routingPlan.trace.aiSelection.candidates,
          ...routingPlan.trace.humanDispatch.candidates
        ]
      });

      let transitionType: string;
      let toOwnerType: "ai" | "system";
      let toOwnerId: string | null;

      if (routingPlan.target.aiAgentId) {
        await ownershipService.applyTransition(trx, {
          type: "activate_ai_owner",
          tenantId,
          conversationId,
          customerId: before.customer_id,
          caseId: before.current_case_id ?? routingContext.caseId,
          aiAgentId: routingPlan.target.aiAgentId,
          reason,
          caseStatus: "in_progress",
          conversationStatus: "open"
        });

        await trx("queue_assignments")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .update({
            department_id: routingPlan.target.departmentId,
            team_id: routingPlan.target.teamId,
            assigned_agent_id: null,
            assigned_ai_agent_id: routingPlan.target.aiAgentId,
            assignment_strategy: routingPlan.target.strategy,
            priority: routingPlan.target.priority,
            status: "pending",
            assignment_reason: reason,
            handoff_required: false,
            handoff_reason: null,
            updated_at: trx.fn.now()
          });

        await routingPlanStepService.record(trx, {
          tenantId,
          planId,
          stepType: "agent_handoff_plan_applied",
          status: "completed",
          payload: {
            outcome: "assigned_ai_owner",
            aiAgentId: routingPlan.target.aiAgentId
          }
        });
        transitionType = "human_to_ai";
        toOwnerType = "ai";
        toOwnerId = routingPlan.target.aiAgentId;
      } else {
        await ownershipService.applyTransition(trx, {
          type: "release_to_queue",
          tenantId,
          conversationId,
          customerId: before.customer_id,
          caseId: before.current_case_id,
          reason,
          assignedAgentId: routingPlan.target.agentId ?? null,
          conversationStatus: "queued"
        });

        await trx("queue_assignments")
          .where({ tenant_id: tenantId, conversation_id: conversationId })
          .update({
            department_id: routingPlan.target.departmentId,
            team_id: routingPlan.target.teamId,
            assigned_agent_id: routingPlan.target.agentId ?? null,
            assigned_ai_agent_id: null,
            assignment_strategy: routingPlan.target.strategy,
            priority: routingPlan.target.priority,
            status: routingPlan.target.agentId ? "assigned" : "pending",
            assignment_reason: reason,
            handoff_required: true,
            handoff_reason: reason,
            updated_at: trx.fn.now()
          });

        await routingPlanStepService.record(trx, {
          tenantId,
          planId,
          stepType: "agent_handoff_plan_applied",
          status: "completed",
          payload: {
            outcome: routingPlan.target.agentId ? "fallback_human_assigned" : "fallback_queue",
            assignedAgentId: routingPlan.target.agentId ?? null
          }
        });
        transitionType = "human_to_queue";
        toOwnerType = "system";
        toOwnerId = null;
      }

      await trx("conversation_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: "handoff_requested",
        actor_type: agentId ? "agent" : "system",
        actor_id: agentId ?? null,
        payload: {
          reason,
          planId,
          routedTo: routingPlan.target.aiAgentId ? "ai" : "queue",
          aiAgentId: routingPlan.target.aiAgentId ?? null,
          fallbackAgentId: routingPlan.target.agentId ?? null
        }
      });

      const after = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("current_segment_id")
        .first<{ current_segment_id: string | null } | undefined>();
      await dispatchAuditService.recordTransition(trx, {
        tenantId,
        conversationId,
        caseId: before.current_case_id,
        customerId: before.customer_id,
        executionId,
        transitionType,
        actorType: agentId ? "agent" : "system",
        actorId: agentId ?? null,
        fromOwnerType: before.current_handler_type,
        fromOwnerId: before.current_handler_id,
        fromSegmentId: before.current_segment_id,
        toOwnerType,
        toOwnerId,
        toSegmentId: after?.current_segment_id ?? null,
        reason
      });

      return {
        planId,
        customerId: before.customer_id,
        channelType: before.channel_type,
        aiAgentId: routingPlan.target.aiAgentId,
        fallbackAgentId: routingPlan.target.agentId ?? null,
        queueStatus: routingPlan.target.aiAgentId ? "pending" : (routingPlan.target.agentId ? "assigned" : "pending")
      };
    });

    const handoffAt = new Date().toISOString();

    await cancelAssignmentAcceptTimeout(conversationId);
    await cancelFollowUpTimeout(conversationId);

    if (handoffResult.aiAgentId) {
      await routingQueue.add("routing.required", {
        tenantId,
        planId: handoffResult.planId,
        conversationId,
        customerId: handoffResult.customerId,
        channelType: handoffResult.channelType
      }, {
        removeOnComplete: 100,
        removeOnFail: 50
      });
    } else if (["assigned", "pending"].includes(handoffResult.queueStatus)) {
      await scheduleAssignmentAcceptTimeout(tenantId, conversationId, handoffResult.customerId);
    }

    await emitConversationUpdatedSnapshot(db, tenantId, conversationId, {
      occurredAt: handoffAt
    });

    return {
      success: true,
      handoffAt,
      reason,
      routedTo: handoffResult.aiAgentId ? "ai" : "queue",
      aiAgentId: handoffResult.aiAgentId ?? null,
      fallbackAgentId: handoffResult.fallbackAgentId ?? null
    };
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
          assigned_ai_agent_id: null,
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
          assigned_ai_agent_id: null,
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
        decisionSummary: { toOwnerType: "system", toStatus: "resolved" },
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
        payload: {}
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

    if (resolvedCaseId) {
      void enqueueQaReviewForCase(tenantId, resolvedCaseId).catch(() => null);
    }

    return { success: true, resolvedAt };
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
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, { tenantId, conversationId, agentId, role, app });
      const result = await caseTaskService.listConversationTasks(trx, tenantId, conversationId);
      return {
        caseId: result.caseId,
        tasks: result.tasks
      };
    });
  });

  app.get("/api/conversations/:conversationId/tasks/:taskId", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId, taskId } = req.params as { conversationId: string; taskId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, { tenantId, conversationId, agentId, role, app });
      const detail = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!detail) throw app.httpErrors.notFound("Task not found");
      return detail;
    });
  });

  app.post("/api/conversations/:conversationId/tasks", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as {
      title?: string;
      note?: string;
      priority?: string;
      assigneeAgentId?: string | null;
      dueAt?: string | null;
      sourceMessageId?: string | null;
    } | undefined) ?? {};

    const title = body.title?.trim();
    if (!title) throw app.httpErrors.badRequest("title is required");

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, { tenantId, conversationId, agentId, role, app });
      const conversation = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("customer_id")
        .first<{ customer_id: string | null } | undefined>();
      if (!conversation) throw app.httpErrors.notFound("Conversation not found");

      const caseId = await caseTaskService.resolveCurrentOrLatestCaseId(trx, tenantId, conversationId);
      if (!caseId) throw app.httpErrors.conflict("Conversation has no current or historical case");

      if (body.sourceMessageId) {
        const sourceMessage = await trx("messages")
          .where({
            tenant_id: tenantId,
            conversation_id: conversationId,
            message_id: body.sourceMessageId
          })
          .select("message_id")
          .first<{ message_id: string } | undefined>();
        if (!sourceMessage) {
          throw app.httpErrors.badRequest("sourceMessageId does not belong to this conversation");
        }
      }

      const taskId = await caseTaskService.createConversationTask(trx, {
        tenantId,
        conversationId,
        caseId,
        customerId: conversation.customer_id,
        title,
        description: body.note?.trim() ?? null,
        priority: body.priority ?? null,
        assigneeAgentId: body.assigneeAgentId ?? null,
        dueAt: body.dueAt ?? null,
        sourceMessageId: body.sourceMessageId ?? null,
        creatorType: auth.agentId ? "agent" : "workflow",
        creatorIdentityId: auth.sub,
        creatorAgentId: auth.agentId ?? null
      });

      const detail = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!detail) throw app.httpErrors.internalServerError("Task created but could not be loaded");
      return detail;
    });
  });

  app.patch("/api/conversations/:conversationId/tasks/:taskId", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId, taskId } = req.params as { conversationId: string; taskId: string };
    const body = (req.body as {
      status?: string;
      priority?: string;
      assigneeAgentId?: string | null;
      dueAt?: string | null;
    } | undefined) ?? {};

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, { tenantId, conversationId, agentId, role, app });
      const existing = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!existing) throw app.httpErrors.notFound("Task not found");
      await caseTaskService.patchTask(trx, {
        tenantId,
        taskId,
        status: body.status,
        priority: body.priority,
        assigneeAgentId: body.assigneeAgentId,
        dueAt: body.dueAt
      });
      const detail = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!detail) throw app.httpErrors.internalServerError("Task updated but could not be loaded");
      return detail;
    });
  });

  app.post("/api/conversations/:conversationId/tasks/:taskId/comments", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const agentId = auth.agentId ?? undefined;
    const role = (auth as { role?: string }).role ?? "agent";
    const { conversationId, taskId } = req.params as { conversationId: string; taskId: string };
    const body = (req.body as { body?: string } | undefined) ?? {};
    const content = body.body?.trim();
    if (!content) throw app.httpErrors.badRequest("body is required");

    return withTenantTransaction(tenantId, async (trx) => {
      await assertConversationAccess(trx, { tenantId, conversationId, agentId, role, app });
      const existing = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!existing) throw app.httpErrors.notFound("Task not found");
      await caseTaskService.addComment(trx, {
        tenantId,
        taskId,
        body: content,
        authorType: auth.agentId ? "agent" : "workflow",
        authorIdentityId: auth.sub,
        authorAgentId: auth.agentId ?? null
      });
      const detail = await caseTaskService.getConversationTaskDetail(trx, tenantId, conversationId, taskId);
      if (!detail) throw app.httpErrors.internalServerError("Task comment saved but task could not be loaded");
      return detail;
    });
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

async function loadConversationExecutionContext(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const row = await trx("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("customer_id", "channel_type", "current_case_id")
    .first<{ customer_id: string; channel_type: string; current_case_id: string | null } | undefined>();

  if (!row) {
    throw new Error("conversation_not_found");
  }

  return {
    customerId: row.customer_id,
    channelType: row.channel_type,
    caseId: row.current_case_id
  };
}

/**
 * Post-process the raw Python skill result through the LLM to produce:
 *   - customerReply: clean, professional message the agent can send (in customer's language)
 *   - timeline:      structured array of shipping/event records (when applicable)
 *
 * Raw skill scripts often return pipe-delimited text like:
 *   "TIMELINE\ntime: ... | status: ... | description: ... | location: ... | staff:  |"
 * The LLM converts this to a readable reply + typed event list.
 * If the script already returns a clean customerReply (no pipes, no TIMELINE header),
 * the raw result is returned as-is to avoid the extra LLM round-trip.
 */
async function formatSkillResultForDisplay(input: {
  provider: { complete: (request: {
    model: string;
    messages: AIMessage[];
    responseFormat: "json_object";
    temperature: number;
    maxTokens: number;
  }) => Promise<{ content: string }> };
  model: string;
  temperature: number;
  maxTokens: number;
  rawResult: Record<string, unknown>;
  sourceMessageText: string;
  customerContext?: string | null;
}): Promise<Record<string, unknown>> {
  const existingReply =
    typeof input.rawResult.customerReply === "string" ? input.rawResult.customerReply.trim() : "";

  // Detect raw/unformatted output: pipe-delimited fields or ALL-CAPS section headers
  const looksRaw =
    !existingReply ||
    existingReply.includes(" | ") ||
    /^[A-Z_]{3,}\s*\n/m.test(existingReply);

  if (!looksRaw) {
    // Already clean — nothing to do
    return input.rawResult;
  }

  const formatted = await input.provider.complete({
    model: input.model,
    messages: [
      {
        role: "system",
        content: [
          "You are a customer service assistant. Convert a raw skill execution result into a structured display format.",
          "Return valid JSON only with this shape:",
          '{',
          '  "customerReply": "<clean professional message the agent can send to the customer>",',
          '  "timeline": [',
          '    { "time": "YYYY-MM-DD HH:mm:ss", "status": "...", "description": "...", "location": "..." }',
          '  ]',
          '}',
          "",
          "Rules:",
          "- customerReply: concise, friendly summary in the same language the customer used. No raw codes or internal field names.",
          "- timeline: include only events with a non-empty description or status. Omit fields that are empty/null.",
          "- If the result has no event/timeline data, omit the timeline array entirely.",
          "- Never include 'staff', 'problem type', 'code', 'provider', or other internal fields.",
          `Customer original message: ${input.sourceMessageText.slice(0, 300)}`,
          input.customerContext?.trim()
            ? `[Customer context]\n${input.customerContext.trim().slice(0, 300)}`
            : null
        ].filter(Boolean).join("\n")
      },
      {
        role: "user",
        content: `Raw skill result:\n${JSON.stringify(input.rawResult, null, 2).slice(0, 3000)}`
      }
    ],
    responseFormat: "json_object",
    temperature: Math.min(0.3, input.temperature),
    maxTokens: Math.min(input.maxTokens, 900)
  });

  const parsed = parseJsonObject(formatted.content);
  const cleanReply = typeof parsed.customerReply === "string" && parsed.customerReply.trim()
    ? parsed.customerReply.trim()
    : existingReply;

  const timeline = Array.isArray(parsed.timeline)
    ? (parsed.timeline as unknown[])
        .filter((event): event is Record<string, unknown> =>
          Boolean(event && typeof event === "object" && !Array.isArray(event))
        )
        .map((event) => ({
          ...(typeof event.time === "string" && event.time ? { time: event.time } : {}),
          ...(typeof event.status === "string" && event.status ? { status: event.status } : {}),
          ...(typeof event.description === "string" && event.description ? { description: event.description } : {}),
          ...(typeof event.location === "string" && event.location ? { location: event.location } : {})
        }))
        .filter((event) => Object.keys(event).length > 0)
    : undefined;

  return {
    ...input.rawResult,
    customerReply: cleanReply,
    ...(timeline && timeline.length > 0 ? { timeline } : {})
  };
}

/**
 * Prepend a concise customer-context block to the planner message list so
 * both skill selection and arg extraction see the customer's working memory,
 * current intent, and key entities from the conversation snapshot.
 *
 * We use a user+assistant pair so the context sits naturally inside the
 * conversation window without conflicting with the planner's own system prompt.
 */
function buildPlannerMessagesWithContext(
  messages: AIMessage[],
  customerContext: string | null | undefined
): AIMessage[] {
  if (!customerContext?.trim()) return messages;

  const contextBlock = customerContext.trim().slice(0, 1000);
  return [
    { role: "user" as const, content: `[Session context for skill selection]\n${contextBlock}` },
    { role: "assistant" as const, content: "Understood, I'll use this context to select the right skill and extract parameters." },
    ...messages
  ];
}

async function loadConversationPlannerMessages(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
): Promise<AIMessage[]> {
  const rows = await trx("messages")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("direction", "content")
    .orderBy("created_at", "desc")
    .limit(12);

  return [...rows]
    .reverse()
    .map((row) => {
      const content = parseJsonObject(row.content);
      const text = typeof content.text === "string" ? content.text.trim() : "";

      // Include attachment notes so image/media messages are not invisible to the Planner.
      // This mirrors orchestrator's buildChatHistory attachment handling.
      const attachmentNotes =
        row.direction === "inbound" && Array.isArray(content.attachments)
          ? (content.attachments as unknown[])
              .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
              .filter((a) => a.url || a.mediaId)
              .map((a) => {
                const ref = typeof a.url === "string" ? a.url : `[mediaId:${a.mediaId}]`;
                const mime = typeof a.mimeType === "string" ? a.mimeType : "file";
                return `[Attachment: ${ref} (${mime})]`;
              })
              .join(" ")
          : "";

      const combined = [text, attachmentNotes].filter(Boolean).join(" ");
      if (!combined) return null;

      return {
        role: (row.direction === "outbound" ? "assistant" : "user") as "assistant" | "user",
        content: combined
      };
    })
    .filter((item) => item !== null) as AIMessage[];
}

async function resolveAssistSourceMessage(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string,
  sourceMessageId: string | null,
  requestOrigin: string | null
) {
  type AssistAttachment = {
    url: string;
    mimeType: string;
    fileName?: string;
  };

  // Helper: extract text + attachment description from a content blob
  function readAttachments(content: Record<string, unknown>): AssistAttachment[] {
    const attachments = Array.isArray(content.attachments) ? content.attachments : [];
    return (attachments as unknown[])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item): AssistAttachment | null => {
        const rawUrl = typeof item.url === "string" ? item.url.trim() : "";
        if (!rawUrl) return null;
        return {
          url: absolutizeAttachmentUrl(rawUrl, requestOrigin),
          mimeType: typeof item.mimeType === "string" && item.mimeType.trim()
            ? item.mimeType.trim()
            : "application/octet-stream",
          fileName: typeof item.fileName === "string" && item.fileName.trim()
            ? item.fileName.trim()
            : undefined
        };
      })
      .filter((item): item is AssistAttachment => item !== null);
  }

  function extractMessageSummary(content: Record<string, unknown>): { text: string; attachments: AssistAttachment[] } {
    const text = typeof content.text === "string" ? content.text.trim() : "";
    const attachments = readAttachments(content);
    const attachmentDesc = attachments
      .map((a) => {
        const mime = a.mimeType || "file";
        const name = a.fileName ?? "";
        return name ? `[Attachment: ${name} (${mime})]` : `[Attachment: ${mime}]`;
      })
      .join(" ");
    return {
      text: [text, attachmentDesc].filter(Boolean).join(" "),
      attachments
    };
  }

  if (sourceMessageId) {
    const direct = await trx("messages")
      .where({
        tenant_id: tenantId,
        conversation_id: conversationId,
        message_id: sourceMessageId
      })
      .select("message_id", "content")
      .first<{ message_id: string; content: unknown } | undefined>();
    if (direct) {
      const content = parseJsonObject(direct.content);
      const summary = extractMessageSummary(content);
      if (summary.text || summary.attachments.length > 0) {
        return { messageId: direct.message_id, text: summary.text, attachments: summary.attachments };
      }
    }
  }

  // Fallback: most recent inbound customer message that has any content
  const rows = await trx("messages")
    .where({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: "inbound",
      sender_type: "customer"
    })
    .select("message_id", "content")
    .orderBy("created_at", "desc")
    .limit(5);

  for (const row of rows) {
    const content = parseJsonObject(row.content);
    const summary = extractMessageSummary(content);
    if (summary.text || summary.attachments.length > 0) {
      return { messageId: row.message_id as string, text: summary.text, attachments: summary.attachments };
    }
  }

  return null;
}

async function extractSkillAssistArgs(input: {
  provider: { complete: (request: {
    model: string;
    messages: AIMessage[];
    responseFormat: "json_object";
    temperature: number;
    maxTokens: number;
  }) => Promise<{ content: string }> };
  model: string;
  temperature: number;
  maxTokens: number;
  skill: {
    name: string;
    description: string | null;
    inputSchema: Record<string, unknown>;
    skillMarkdown?: string | null;
    formsMarkdown?: string | null;
    referenceMarkdown?: string | null;
  };
  messages: AIMessage[];
  sourceMessageText: string;
  sourceAttachments: Array<{
    url: string;
    mimeType: string;
    fileName?: string;
  }>;
  customerContext?: string | null;
}): Promise<Record<string, unknown>> {
  const attachmentSummary = input.sourceAttachments
    .map((attachment) => {
      const label = attachment.fileName?.trim() || attachment.url || "attachment";
      return `${label} (${attachment.mimeType})`;
    })
    .join(", ");

  const latestRequestContent =
    `Latest customer request to assist:\n${input.sourceMessageText || "[customer sent attachment]"}`
    + (attachmentSummary ? `\nAttachments: ${attachmentSummary}` : "");

  let extracted: Record<string, unknown> = {};
  try {
    const result = await input.provider.complete({
      model: input.model,
      messages: [
        {
          role: "system",
          content: [
            "Extract the arguments required to execute the selected skill.",
            "Return valid JSON only.",
            "Do not invent fields outside the provided input schema.",
            "Return a flat JSON object whose top-level keys match the input schema.",
            "Do not wrap the result in arrays, numbered keys, or nested envelopes.",
            `Selected skill: ${input.skill.name}`,
            `Description: ${input.skill.description ?? ""}`,
            `Input schema: ${JSON.stringify(input.skill.inputSchema)}`,
            input.skill.skillMarkdown?.trim() ? `Skill package:\n${input.skill.skillMarkdown.trim()}` : null,
            input.skill.formsMarkdown?.trim() ? `Forms:\n${input.skill.formsMarkdown.trim()}` : null,
            input.skill.referenceMarkdown?.trim() ? `Reference:\n${input.skill.referenceMarkdown.trim()}` : null,
            input.customerContext?.trim()
              ? `\n[CUSTOMER CONTEXT — use this to fill skill arguments]\n${input.customerContext.trim().slice(0, 1200)}`
              : null
          ].filter(Boolean).join("\n")
        },
        ...input.messages,
        {
          role: "user",
          content: latestRequestContent
        }
      ],
      responseFormat: "json_object",
      temperature: Math.min(0.2, Math.max(0, input.temperature)),
      maxTokens: Math.min(500, Math.max(150, input.maxTokens))
    });

    extracted = normalizeExtractedSkillArgs(parseJsonObject(result.content), input.skill.inputSchema);
  } catch {
    extracted = {};
  }

  return extracted;
}

function normalizeConversationSkillSchema(inputSchema: Record<string, unknown>) {
  const properties = parseJsonObject(inputSchema.properties);
  const required = Array.isArray(inputSchema.required)
    ? inputSchema.required.map((item) => String(item))
    : [];

  const normalizedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      const field = parseJsonObject(value);
      return [key, {
        type: typeof field.type === "string" ? field.type : "string",
        description: typeof field.description === "string" ? field.description : undefined,
        enum: Array.isArray(field.enum) ? field.enum.map((item) => String(item)) : undefined
      }];
    })
  );

  return {
    type: "object" as const,
    properties: normalizedProperties,
    required
  };
}

function normalizeSkillExecutionArgs(input: {
  inputSchema: Record<string, unknown>;
  parameters: Record<string, unknown>;
  sourceAttachments?: Array<{
    url: string;
    mimeType: string;
    fileName?: string;
  }>;
}) {
  const next = { ...input.parameters };
  const properties = parseJsonObject(input.inputSchema.properties);
  if ("image_url" in properties && !readNonEmptyString(next.image_url)) {
    const firstAttachment = input.sourceAttachments?.find((item) => item.url);
    if (firstAttachment?.url) {
      next.image_url = firstAttachment.url;
    }
  }

  delete next.bill_codes;
  delete next.tracking_number;
  delete next.waybill_number;
  delete next.sourceMessageText;
  return next;
}

function normalizeExtractedSkillArgs(
  parameters: Record<string, unknown>,
  inputSchema: Record<string, unknown>
) {
  const properties = parseJsonObject(inputSchema.properties);
  const allowedKeys = new Set(Object.keys(properties));
  const sourceEntries = Object.entries(parameters);
  const flattened: Record<string, unknown> = {};

  const append = (record: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(record)) {
      if (allowedKeys.size === 0 || allowedKeys.has(key)) {
        flattened[key] = value;
      }
    }
  };

  append(parameters);

  for (const [key, value] of sourceEntries) {
    if (!/^\d+$/.test(key)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    append(value as Record<string, unknown>);
  }

  return flattened;
}

function readNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function findMissingRequiredSkillArgs(inputSchema: Record<string, unknown>, parameters: Record<string, unknown>) {
  const required = Array.isArray(inputSchema.required)
    ? inputSchema.required.map((item) => String(item)).filter(Boolean)
    : [];
  return required.filter((field) => {
    const value = parameters[field];
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === undefined;
  });
}

function buildNeedInputAssistResult(input: {
  skillName: string;
  inputSchema: Record<string, unknown>;
  missingFields: string[];
}) {
  const properties = parseJsonObject(input.inputSchema.properties);
  const labels = input.missingFields.map((field) => {
    const property = parseJsonObject(properties[field]);
    return typeof property.description === "string" && property.description.trim()
      ? property.description.trim()
      : field;
  });
  const joined = labels.join("、");
  return {
    status: "need_input",
    missingInputs: input.missingFields,
    message: joined ? `缺少必要参数：${joined}` : "缺少必要参数，暂时无法执行技能。",
    customerReply: joined ? `请先提供${joined}，我再继续帮您处理。` : "请先补充必要信息，我再继续帮您处理。",
    skillName: input.skillName
  };
}

function buildRequestOrigin(req: { protocol?: string; headers: Record<string, unknown> }) {
  const protocol = typeof req.protocol === "string" && req.protocol.trim()
    ? req.protocol.trim()
    : "http";
  const host = typeof req.headers.host === "string" ? req.headers.host.trim() : "";
  return host ? `${protocol}://${host}` : null;
}

function absolutizeAttachmentUrl(rawUrl: string, requestOrigin: string | null) {
  if (/^(?:https?:|data:|blob:)/i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("/")) {
    return requestOrigin ? `${requestOrigin}${rawUrl}` : rawUrl;
  }
  return rawUrl;
}

function buildUnreadCountsSubquery(trx: Knex.Transaction, tenantId: string) {
  return trx("messages as mu")
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
}

function applyConversationViewFilter(
  query: Knex.QueryBuilder,
  input: {
    view: string;
    agentId?: string;
    role: string;
  }
) {
  const { view, agentId, role } = input;

  if (view === "mine" && agentId) {
    query
      .where("cc.current_owner_type", "agent")
      .where("cc.current_owner_id", agentId);
    return;
  }

  if (view === "pending") {
    if (role === "admin" || role === "supervisor") {
      query.where((builder) => {
        builder.where("qa.status", "pending").orWhereNull("qa.assignment_id");
      });
    } else {
      query.whereRaw("1 = 0");
    }
    return;
  }

  if (view === "monitor" && agentId) {
    query
      .where("cc.current_owner_type", "agent")
      .whereNot("cc.current_owner_id", agentId)
      .whereIn("c.status", ["human_active", "open", "queued"]);
    return;
  }

  if (view === "follow_up" && agentId) {
    query
      .where("cc.current_owner_type", "agent")
      .where("cc.current_owner_id", agentId)
      .whereIn("cc.status", ["waiting_customer", "waiting_internal"]);
    return;
  }

  if (agentId) {
    query.where("c.assigned_agent_id", agentId);
  }
}

async function getConversationViewSummaries(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    agentId?: string;
    role: string;
  }
) {
  const views = ["all", "mine", "follow_up"] as const;

  const rows = await Promise.all(views.map(async (view) => {
    const unreadCounts = buildUnreadCountsSubquery(trx, input.tenantId);
    const row = await trx("conversations as c")
      .leftJoin(unreadCounts, "uc.conversation_id", "c.conversation_id")
      .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
        this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
      })
      .leftJoin("conversation_cases as cc", function joinCurrentCase() {
        this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
      })
      .where("c.tenant_id", input.tenantId)
      .modify((query) => applyConversationViewFilter(query, {
        view,
        agentId: input.agentId,
        role: input.role
      }))
      .select(
        trx.raw("count(*)::int as total_conversations"),
        trx.raw("coalesce(sum(coalesce(uc.unread_count, 0)), 0)::int as unread_messages"),
        trx.raw("coalesce(sum(case when coalesce(uc.unread_count, 0) > 0 then 1 else 0 end), 0)::int as unread_conversations")
      )
      .first<{
        total_conversations: number | string | null;
        unread_messages: number | string | null;
        unread_conversations: number | string | null;
      }>();

    return [
      view,
      {
        totalConversations: Number(row?.total_conversations ?? 0),
        unreadMessages: Number(row?.unread_messages ?? 0),
        unreadConversations: Number(row?.unread_conversations ?? 0)
      }
    ] as const;
  }));

  return Object.fromEntries(rows) as Record<"all" | "mine" | "follow_up", {
    totalConversations: number;
    unreadMessages: number;
    unreadConversations: number;
  }>;
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

function normalizeReplyAttachments(body: {
  attachments?: Array<{ url?: string; mimeType?: string; fileName?: string }>;
}) {
  const attachmentRows = Array.isArray(body.attachments) ? body.attachments : [];

  return attachmentRows
    .map((attachment) => ({
      url: typeof attachment.url === "string" ? attachment.url.trim() : "",
      mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType.trim() : "application/octet-stream",
      fileName: typeof attachment.fileName === "string" && attachment.fileName.trim() ? attachment.fileName.trim() : undefined
    }))
    .filter((attachment) => attachment.url.length > 0);
}

async function resolveReplyContext(
  tenantId: string,
  replyToMessageId: string | undefined,
  executor?: Knex | Knex.Transaction
) {
  if (!replyToMessageId) {
    return { replyToMessageId: null, replyToExternalId: null };
  }

  const row = await (executor ?? db)("messages")
    .select("message_id", "external_id")
    .where({ tenant_id: tenantId, message_id: replyToMessageId })
    .first<{ message_id: string; external_id: string | null } | undefined>();

  return {
    replyToMessageId: row?.message_id ?? null,
    replyToExternalId: row?.external_id ?? null
  };
}

type ReplyMessage = {
  text: string;
  agentId?: string;
  replyToMessageId?: string | null;
  reactionEmoji?: string;
  reactionMessageId?: string;
  attachment?: { url: string; mimeType: string; fileName?: string };
};

function buildReplyMessages(input: {
  text: string;
  attachments: Array<{ url: string; mimeType: string; fileName?: string }>;
  agentId?: string;
  replyToMessageId?: string;
  reactionEmoji?: string;
  reactionToMessageId?: string;
}): ReplyMessage[] {
  if (input.reactionEmoji && input.reactionToMessageId) {
    return [{
      text: "",
      agentId: input.agentId,
      replyToMessageId: null,
      reactionEmoji: input.reactionEmoji,
      reactionMessageId: input.reactionToMessageId
    }];
  }

  if (input.attachments.length === 0) {
    return input.text ? [{
      text: input.text,
      agentId: input.agentId,
      replyToMessageId: input.replyToMessageId
    }] : [];
  }

  return input.attachments.map((attachment, index) => ({
    text: index === 0 ? input.text : "",
    agentId: input.agentId,
    replyToMessageId: index === 0 ? input.replyToMessageId : undefined,
    attachment
  }));
}
