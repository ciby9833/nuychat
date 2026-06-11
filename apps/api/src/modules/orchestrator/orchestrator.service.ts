/**
 * 作用：统一编排数字员工主链，串联轨道判定、上下文组装、工具执行、事实回填与最终回复。
 * 上游：AI seat dispatch / routing execution
 * 下游：semantic-router.service.ts、harness/context-pipeline.ts、runtime-governance、sandbox-evaluator
 * 协作对象：fact-layer.service.ts、customer-intelligence.service.ts、agent-skills/*、tasks/*
 * 不负责：不实现知识检索算法，不承载具体业务脚本逻辑，不长期保存知识编排策略。
 * 变更注意：新增步骤优先下沉到独立 service，避免继续向 orchestrator 堆流程。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Knex } from "knex";
import type { AIContentPart, AIMessage, AIProvider, AIToolCall, AIToolDefinition } from "../../../../../packages/ai-sdk/src/index.ts";
import { getUploadsDir } from "../../infra/storage/upload.service.js";
import { runCapabilityScriptExecution } from "../tasks/task-script-execution.service.js";
import {
  evaluateSkillExecutionGate,
  filterRuntimePoliciesForSkills,
  getBoundRuntimePolicies,
  recordSkillInvocation
} from "../skills/runtime-governance.service.js";
import {
  listTenantSkillsForPlanning,
} from "../agent-skills/skill-definition.service.js";
import { hydrateSkillsForTurn } from "../agent-skills/skill-hydration.service.js";
import {
  recordSkillRun
} from "../agent-skills/planner-guard.service.js";
import {
  clearConversationCapabilityState,
  getConversationCapabilityState,
  upsertConversationCapabilityState
} from "../agent-skills/capability-state.service.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import {
  appendWorkingMemory,
  getWorkingMemory,
  patchLastAssistantTurn,
  upsertConversationInsight
} from "../memory/customer-intelligence.service.js";
import {
  assertTenantAIBudgetAllowsUsage,
  recordAIUsage
} from "../ai/usage-meter.service.js";
import {
  normalizeAIInteractionContract,
  ORCHESTRATOR_RESPONSE_CONTRACT,
  type AIControlAction,
  type AISentiment
} from "../ai/ai-runtime-contract.js";
import {
  composeClarificationTurn,
  composeFinalAnswer
} from "../ai/answer-composer.service.js";
import {
  evaluatePreReplyPolicy
} from "../ai/pre-reply-policy.service.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import {
  buildVerifiedFactFromToolResult,
  buildVerifiedFactFromKnowledgeEntry,
  summarizeSkillResult,
  type VerifiedFact
} from "../ai/fact-layer.service.js";
import { recordSkillExecutionAsTask } from "../tasks/ai-task-bridge.service.js";
// ── Harness Engineering ──────────────────────────────────────────────────────
import {
  assembleSystemPrompt,
  buildPromptLayers,
  runContextPipeline,
  SandboxState
} from "../ai/harness/index.js";
import { routeMessage } from "../ai/semantic-router.service.js";
import { formatKnowledgeEntriesAsContext, searchKnowledgeEntries } from "../knowledge/knowledge-retrieval.service.js";

// ─── Built-in Agent Tools ─────────────────────────────────────────────────────

/**
 * Name of the built-in knowledge-search tool injected into every agent turn.
 * The LLM calls this when it needs to look up policies, FAQs, or product info —
 * instead of the old approach of pre-fetching knowledge only on "knowledge_track".
 */
const SEARCH_KNOWLEDGE_TOOL_NAME = "searchKnowledge";

const SEARCH_KNOWLEDGE_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: SEARCH_KNOWLEDGE_TOOL_NAME,
    description:
      "Search the business knowledge base for policies, FAQs, product information, procedures, or any factual content the tenant has configured. Call this whenever the customer asks a question that may be answered by documented business knowledge.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The search query, ideally phrased as the customer's question or the key concept to look up."
        }
      },
      required: ["query"]
    }
  }
};

/**
 * Tool the LLM calls to explicitly request a human agent.
 * Replaces the old "action=handoff" JSON-contract approach:
 * the model now signals handoff intent as a structured tool call
 * instead of embedding it in the free-text JSON response.
 */
const REQUEST_HANDOFF_TOOL_NAME = "requestHumanHandoff";

const REQUEST_HANDOFF_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: REQUEST_HANDOFF_TOOL_NAME,
    description:
      "Transfer this conversation to a human agent. Call this when the customer explicitly requests a human, when the issue requires human judgment or approval, or when the available tools cannot resolve the customer's problem.",
    parameters: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string" as const,
          description: "Brief operational reason for the handoff (e.g. 'customer_requested_human', 'complex_issue', 'requires_approval')."
        }
      },
      required: ["reason"]
    }
  }
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  caseId?: string | null;
  aiAgentId?: string | null;
  capabilityScope?: string | null;
  actorType?: "ai" | "agent" | "workflow";
  requesterId?: string | null;
  preferredSkillNames?: string[];
  /**
   * True when the conversation is in "fallback_ai" mode — the customer has
   * already been queued for a human agent but no agent is currently available,
   * so the AI is temporarily handling messages. In this mode the AI must NOT
   * call requestHumanHandoff (the customer is already in queue) and should
   * focus on reassuring the customer and answering simple questions.
   */
  isAiFallback?: boolean;
}

export interface OrchestratorResult {
  action: AIControlAction;
  /** Generated reply text; null = no AI response, defer to human */
  response: string | null;
  intent: string;
  sentiment: AISentiment;
  shouldHandoff: boolean;
  handoffReason?: string;
  tokensUsed: number;
  confidence: number;
  skillsInvoked: string[];
  skillsBlocked?: Array<{ name: string; reason: string }>;
}

type MsgRow = {
  direction: string;
  content: {
    text?: string;
    attachments?: Array<{ url?: string; mimeType?: string; fileName?: string }>;
  };
};

type AIAgentRow = {
  ai_agent_id: string;
  name: string;
  role_label: string | null;
  personality: string | null;
  scene_prompt: string | null;
  system_prompt: string | null;
};

// Base system prompt is now in harness/prompt-assembler.ts (single source of truth)

// ─── Service ──────────────────────────────────────────────────────────────────

export class OrchestratorService {
  async run(db: Knex | Knex.Transaction, input: OrchestratorInput): Promise<OrchestratorResult> {
    const aiSettings = await resolveTenantAISettingsForScene(db, input.tenantId, "ai_seat");
    if (!aiSettings) return noAiResult("no_ai_provider");
    const aiAgent = input.aiAgentId
      ? await db<AIAgentRow>("tenant_ai_agents")
        .where("tenant_id", input.tenantId)
        .andWhere("ai_agent_id", input.aiAgentId)
        .andWhere("status", "active")
        .select("ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt")
        .first()
      : null;

    const rows = await db<MsgRow>("messages")
      .select("direction", "content")
      .where("tenant_id", input.tenantId)
      .andWhere("conversation_id", input.conversationId)
      .orderBy("created_at", "desc")
      .limit(20);

    const messages = [...rows].reverse();
    const chatHistory = buildChatHistory(messages);
    // llmMessages carries full-fidelity content (including image attachments as
    // base64-encoded AIContentPart[]) for the actual LLM calls; chatHistory
    // (plain strings) is kept for internal guards, policy evaluation, and memory.
    const llmMessages = await buildLLMMessages(messages);

    if (chatHistory.length === 0) {
      return noAiResult("no_messages");
    }

    // ── Explicit human-transfer gate ──────────────────────────────────────────
    // Detect unambiguous "I want a human agent" messages BEFORE calling the LLM.
    // The orchestrator has zero visibility into real-time queue state, so letting
    // the LLM handle these requests always risks fabricated "no agents available"
    // responses in the wrong language. Short-circuit immediately to handoff.
    //
    // Exception: when isAiFallback=true the customer is ALREADY in the human queue.
    // Calling handoff again would re-queue them and send a duplicate routing notice.
    // Let the LLM handle it with the queue-holding context injected below.
    const lastUserText = chatHistory.filter((m) => m.role === "user").at(-1)?.content ?? "";
    if (isExplicitHumanTransferRequest(lastUserText) && !input.isAiFallback) {
      return {
        action: "handoff",
        response: null,
        intent: "human_handoff",
        sentiment: "neutral",
        shouldHandoff: true,
        handoffReason: "customer_requested_human",
        tokensUsed: 0,
        confidence: 0.99,
        skillsInvoked: []
      };
    }

    const model = aiSettings.model;
    const providerName = aiSettings.providerName;
    const actorType = input.actorType ?? "ai";

    // ── Semantic route — analytics/memory label only ──────────────────────────
    // routeMessage() is kept for analytics metadata and memory encoding.
    // It NO LONGER gates which tools or context layers are loaded.
    // The LLM is now the decision-maker: it sees all available tools and
    // decides autonomously when to call knowledge search, skills, or handoff.
    const semanticRoute = await routeMessage({ chatHistory });

    const runtimePolicy = await getBoundRuntimePolicies(db, {
      tenantId: input.tenantId,
      capabilityScope: input.capabilityScope,
      actorType,
      conversationId: input.conversationId
    });
    const requestedPreferredSkills = normalizePreferredSkills(input.preferredSkillNames ?? []);

    // ── Always load tenant skills ─────────────────────────────────────────────
    // Previously guarded by action_track. Now every turn has access to all
    // tenant-configured skills so the LLM can invoke them for any goal.
    const tenantSkills = await listTenantSkillsForPlanning(db, {
      tenantId: input.tenantId,
      channelType: input.channelType,
      actorRole: actorType,
      capabilityScope: input.capabilityScope ?? null,
      ownerMode: actorType
    });

    const activeCapabilityState = await getConversationCapabilityState(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId
    });
    const continuationSkill = activeCapabilityState
      ? tenantSkills.find((skill) => skill.capabilityId === activeCapabilityState.capabilityId) ?? null
      : null;
    if (activeCapabilityState && !continuationSkill) {
      await clearConversationCapabilityState(db, {
        tenantId: input.tenantId,
        conversationId: input.conversationId
      });
    }
    const preReplyPolicy = await evaluatePreReplyPolicy(db, {
      tenantId: input.tenantId,
      chatHistory,
      preferredSkillNames: requestedPreferredSkills,
      availableSkills: tenantSkills
    });
    const preferredScriptKeys = preReplyPolicy.preferredBindingKeys;

    // ── Agent-model: direct tool dispatch (no planner) ────────────────────────
    // All tenant skills are exposed as tools alongside the built-in
    // searchKnowledge and requestHumanHandoff tools. The LLM decides
    // autonomously which tools to call for each customer goal.
    // continuationSkill is used only to maintain priority ordering for
    // in-progress multi-step flows; it does not gate other tools.
    const selectedSkill = continuationSkill ?? null;
    const hydratedSkills = hydrateSkillsForTurn({
      candidateSkills: tenantSkills,
      selectedSkill: continuationSkill,
      preferredScriptKeys,
      maxSkills: 20   // guard against extreme skill counts; 20 is ample for any real deployment
    });
    const selectedScriptKey = selectedSkill?.scripts.find(
      (script) => script.enabled && (preferredScriptKeys.length === 0 || preferredScriptKeys.includes(script.scriptKey))
    )?.scriptKey ?? selectedSkill?.scripts.find((script) => script.enabled)?.scriptKey ?? null;
    const skillRunId = await recordSkillRun(db, {
      tenantId: input.tenantId,
      capabilityId: selectedSkill?.capabilityId ?? null,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: input.caseId ?? null,
      status: "planned",
      selectedReason: continuationSkill ? "continue_capability_state" : "direct_tool_dispatch",
      confidence: 1,
      plannerTrace: {
        plannerStrategy: "direct",
        capabilitySuggestions: { candidates: [], requiresClarification: false },
        candidateSkills: [],
        hydratedSkillSlugs: hydratedSkills.map((skill) => skill.slug),
        availableSkillCount: tenantSkills.length,
        selectedSkillSlug: selectedSkill?.slug ?? null,
        selectedScriptKey
      }
    });

    const skillTools = buildRuntimeTools({
      candidateSkills: hydratedSkills,
      runtimePolicy: filterRuntimePoliciesForSkills(runtimePolicy, hydratedSkills),
      preferredScriptKeys
    });
    // All built-in tools are exposed: skill tools + knowledge search + human handoff.
    // When isAiFallback=true the customer is already in the human queue — omit the
    // requestHumanHandoff tool so the LLM cannot re-trigger a handoff. The routing
    // worker also has a guard, but removing the tool is the cleaner first line of defence.
    const tools = input.isAiFallback
      ? [...skillTools, SEARCH_KNOWLEDGE_TOOL_DEFINITION]
      : [...skillTools, SEARCH_KNOWLEDGE_TOOL_DEFINITION, REQUEST_HANDOFF_TOOL_DEFINITION];
    const skillsInvoked: string[] = [];
    const skillsBlocked: Array<{ name: string; reason: string }> = [];
    const hydratedRuntimePolicy = filterRuntimePoliciesForSkills(runtimePolicy, hydratedSkills);

    // ── Harness: Context Pipeline ──────────────────────────────────────────────
    // Load customer intelligence + fact snapshot in parallel, then pre-load the
    // most relevant knowledge entries for the current user message.
    //
    // Dual-track knowledge:
    //   Layer 1 (pre-loaded) — top matching entries injected into the system prompt
    //     so the LLM has business context immediately, even before calling any tool.
    //   Layer 2 (tool) — the searchKnowledge tool remains available so the LLM can
    //     run dynamic follow-up queries mid-conversation.
    //
    // ── Correction loop — feedback signal detection ───────────────────────────
    //
    // This pipeline is SEPARATE from the human-dispatch decision chain.
    // It handles knowledge quality feedback ONLY; routing decisions are made
    // elsewhere (routing-decision.service.ts / requestHumanHandoff tool call).
    //
    // Two layers:
    //   A. Per-conversation correction loop (immediate, stateless):
    //      Dissatisfaction signal → exclude previously-used entries → CORRECTION SIGNAL in prompt.
    //      Only affects THIS conversation; other conversations are not affected.
    //
    //   B. Org-level quality counter (deduplicated per conversation):
    //      negative_feedback_count counts DISTINCT CONVERSATIONS that flagged an entry.
    //      One conversation can only contribute +1 per entry, ever, so a single vocal
    //      user cannot inflate the counter across messages.
    //      Threshold: ≥ 3 distinct conversations → needs_review=true flag for admin review.
    //
    // Signals (explicit pushback only — human-transfer requests are NOT feedback signals;
    // they belong to the routing/dispatch chain and are handled by requestHumanHandoff):
    //   (1) Explicit pushback: "不对"/"错了"/"还是不行"/"wrong"/etc.
    //   (2) Repeat question: same topic asked again right after a knowledge-based reply
    //       (≥55% bigram/word token overlap with previous user message)

    const recentWmTurns = await getWorkingMemory(input.conversationId).catch(() => []);
    const lastAssistantWmTurn = [...recentWmTurns].reverse().find((t) => t.role === "assistant");
    const lastUserWmTurn = [...recentWmTurns].reverse().find((t) => t.role === "user");

    // Signal (1): explicit dissatisfaction ("不对", "wrong", "还是不行", etc.)
    const hasExplicitPushback = !!(lastUserText && lastAssistantWmTurn && detectUserPushback(lastUserText));

    // Signal (2): repeat question — same topic asked again after a knowledge-based reply.
    // Only triggers when the last AI turn actually used knowledge entries (knowledgeEntryIds),
    // and the current user message has ≥55% token overlap with their previous message.
    const hasRepeatQuestion = !!(
      lastAssistantWmTurn?.knowledgeEntryIds?.length &&
      lastUserWmTurn?.content &&
      lastUserText &&
      computeTokenOverlap(lastUserText, lastUserWmTurn.content) >= 0.55
    );

    // NOTE: "user requests human after knowledge answer" is intentionally NOT a feedback signal.
    // Requesting a human doesn't mean the knowledge was wrong — the user may have other reasons.
    // Human transfer requests are handled by the requestHumanHandoff tool in the LLM decision (step 4).

    const isFeedbackSignal = hasExplicitPushback || hasRepeatQuestion;
    const excludeEntryIds = isFeedbackSignal ? (lastAssistantWmTurn?.knowledgeEntryIds ?? []) : [];

    const [harnessContext, preloadedKnowledgeEntries] = await Promise.all([
      runContextPipeline(db, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        activeSkillSlug: (selectedSkill || continuationSkill)?.slug ?? null
      }),
      lastUserText
        ? searchKnowledgeEntries(db, {
            tenantId: input.tenantId,
            queryText: lastUserText,
            limit: 3,
            excludeEntryIds: excludeEntryIds.length > 0 ? excludeEntryIds : undefined
          }).catch(() => [])
        : Promise.resolve([])
    ]);

    // Org-level quality signal: increment negative_feedback_count for the flagged entries,
    // but ONLY if this conversation hasn't already counted for these entries
    // (checked via negativeFeedbackCounted on the last assistant WM turn).
    // Threshold: >= 3 distinct conversations → auto-flag for admin review.
    if (isFeedbackSignal && excludeEntryIds.length > 0 && !lastAssistantWmTurn?.negativeFeedbackCounted) {
      db("knowledge_base_entries")
        .where("tenant_id", input.tenantId)
        .whereIn("entry_id", excludeEntryIds)
        .increment("negative_feedback_count", 1)
        .then(() =>
          db("knowledge_base_entries")
            .where("tenant_id", input.tenantId)
            .whereIn("entry_id", excludeEntryIds)
            .where("negative_feedback_count", ">=", 3)
            .update({ needs_review: true, last_flagged_at: db.fn.now() })
        )
        .catch(() => null);

      // Mark this assistant turn so the same conversation never double-counts
      patchLastAssistantTurn(input.conversationId, { negativeFeedbackCounted: true }).catch(() => null);
    }

    const factSnapshot = harnessContext.factSnapshot;

    // Track in-flight verified facts accumulated during this orchestration run
    const runVerifiedFacts: VerifiedFact[] = [...factSnapshot.verifiedFacts];

    // Register pre-loaded knowledge as verified facts so the sandbox guardrail
    // can cross-check AI replies against them.
    if (preloadedKnowledgeEntries.length > 0) {
      runVerifiedFacts.push(
        ...preloadedKnowledgeEntries.map((entry) =>
          buildVerifiedFactFromKnowledgeEntry(entry, lastUserText)
        )
      );
    }

    // ── Harness: Prompt Assembly ────────────────────────────────────────────────
    const promptLayers = buildPromptLayers({ aiAgent: aiAgent ?? null });

    // Queue-holding context: a light hint injected when AI is running as fallback
    // while the customer is already waiting in the human support queue.
    // Purpose: answer the customer's actual question normally, AND if they ask
    // about their wait status, reassure them — without announcing the queue
    // status unprompted on every single message.
    const queueHoldingContext = input.isAiFallback
      ? `[CONTEXT: HUMAN QUEUE ACTIVE]\nThis customer has previously requested a human agent and is currently waiting in the support queue. A human specialist will join soon.\n- Answer their question normally and helpfully.\n- If they ask about wait status or why a human hasn't appeared, reassure them warmly that they are connected and a specialist is on the way.\n- Do NOT proactively announce the queue status on every message — only mention it when directly relevant.`
      : null;

    const correctionSignalReason = hasExplicitPushback
      ? "The customer explicitly said the previous answer was wrong or unhelpful."
      : hasRepeatQuestion
        ? "The customer is asking the same question again, indicating the previous answer did not satisfy them."
        : null;

    const correctionContext = correctionSignalReason
      ? `[CORRECTION SIGNAL]\n${correctionSignalReason}\n- Do NOT repeat the same information or cite the same entries from working memory.\n- Call searchKnowledge with DIFFERENT, more specific search terms to find alternative content.\n- If no new useful information is found, honestly admit the limitation${input.isAiFallback ? " and let the customer know a human specialist is already on the way" : " and call requestHumanHandoff"}.`
      : null;

    const runtimePrompt = assembleSystemPrompt({
      layers: promptLayers,
      routeContext: queueHoldingContext,
      customerIntelligence: harnessContext.customerIntelligence,
      correctionContext,
      knowledgeContext: formatKnowledgeEntriesAsContext(preloadedKnowledgeEntries),
      factContext: harnessContext.factContext,
      candidateSkills: hydratedSkills,
      responseContract: ORCHESTRATOR_RESPONSE_CONTRACT
    });

    // ── Harness: Sandbox ────────────────────────────────────────────────────────
    const sandbox = new SandboxState();

    try {
      const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
      if (!budgetGate.allowed) {
        return noAiResult(budgetGate.reason ?? "ai_budget_blocked");
      }

      let finalContent = "";
      let tokensUsed = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let lastToolCalls: AIToolCall[] = [];
      // Set when the LLM calls requestHumanHandoff tool — skips further loops.
      let handoffRequestedByTool = false;
      let handoffReasonFromTool: string | null = null;
      const loopMessages: AIMessage[] = [
        { role: "system", content: runtimePrompt },
        ...llmMessages
      ];
      const seenToolCalls = new Set<string>();
      const MAX_AGENT_LOOPS = 3;

      for (let loopIndex = 0; loopIndex < MAX_AGENT_LOOPS; loopIndex += 1) {
        const turn = await callLLM(
          aiSettings.provider,
          model,
          loopMessages,
          tools as unknown as AIToolDefinition[],
          aiSettings.temperature,
          aiSettings.maxTokens,
          tools.length === 0 ? "json_object" : "text"
        );

        finalContent = turn.content;
        lastToolCalls = turn.toolCalls ?? [];
        tokensUsed += turn.tokensUsed;
        inputTokens += turn.inputTokens;
        outputTokens += turn.outputTokens;

        if (!turn.toolCalls || turn.toolCalls.length === 0) {
          break;
        }

        loopMessages.push({
          role: "assistant",
          content: turn.content,
          toolCalls: turn.toolCalls
        });

        for (const toolCall of turn.toolCalls) {
          // ── Built-in: searchKnowledge ────────────────────────────────────
          if (toolCall.function.name === SEARCH_KNOWLEDGE_TOOL_NAME) {
            const args = safeParseJson(toolCall.function.arguments);
            const query = typeof args.query === "string" ? args.query.trim() : "";
            let knowledgeResult: string;
            if (query) {
              try {
                const knowledgeEntries = await searchKnowledgeEntries(db, {
                  tenantId: input.tenantId,
                  queryText: query,
                  limit: 4
                });
                const contextText = formatKnowledgeEntriesAsContext(knowledgeEntries);
                knowledgeResult = JSON.stringify({
                  found: knowledgeEntries.length > 0,
                  context: contextText || "No relevant knowledge found."
                });
                // Register knowledge entries as verified facts for guardrail checks
                const knowledgeFacts = knowledgeEntries.map((entry) =>
                  buildVerifiedFactFromKnowledgeEntry(entry, query)
                );
                runVerifiedFacts.push(...knowledgeFacts);
              } catch {
                knowledgeResult = JSON.stringify({ found: false, context: "Knowledge search temporarily unavailable." });
              }
            } else {
              knowledgeResult = JSON.stringify({ found: false, context: "No query provided." });
            }
            loopMessages.push({ role: "tool", content: knowledgeResult, toolCallId: toolCall.id });
            continue;
          }

          // ── Built-in: requestHumanHandoff ────────────────────────────────────
          if (toolCall.function.name === REQUEST_HANDOFF_TOOL_NAME) {
            const args = safeParseJson(toolCall.function.arguments);
            handoffReasonFromTool = typeof args.reason === "string" && args.reason.trim()
              ? args.reason.trim()
              : "human_requested";
            handoffRequestedByTool = true;
            loopMessages.push({ role: "tool", content: JSON.stringify({ acknowledged: true }), toolCallId: toolCall.id });
            break; // break the inner tool-call loop; outer loop guard below will exit
          }

          const toolOwner = hydratedSkills.find((skill) =>
            skill.scripts.some((script) => script.enabled && script.scriptKey === toolCall.function.name)
          ) ?? null;
          const dynamicScript = toolOwner?.scripts.find(
            (script) => script.enabled && script.scriptKey === toolCall.function.name
          ) ?? null;
          let toolResult: string;
          if (dynamicScript) {
            const rawArgs = safeParseJson(toolCall.function.arguments);
            // Resolve local upload paths to base64 data URLs so scripts can
            // access images regardless of network visibility constraints.
            const args = await resolveAttachmentArgs(rawArgs);
            const dedupeKey = `${toolCall.function.name}:${stableJson(args)}`;
            if (seenToolCalls.has(dedupeKey)) {
              skillsBlocked.push({ name: toolCall.function.name, reason: "duplicate_tool_call" });
              toolResult = JSON.stringify({
                error: "duplicate_tool_call",
                message: `Tool ${toolCall.function.name} with the same arguments was already called in this run.`
              });
              loopMessages.push({
                role: "tool",
                content: toolResult,
                toolCallId: toolCall.id
              });
              continue;
            }
            seenToolCalls.add(dedupeKey);
            const gate = await evaluateSkillExecutionGate(db, {
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              capabilityScope: input.capabilityScope,
              actorType,
              requesterId: input.requesterId ?? null,
              policyMap: hydratedRuntimePolicy,
              skillName: toolCall.function.name,
              args
            });

            if (gate.action === "allow") {
              const startedAt = Date.now();
              skillsInvoked.push(toolCall.function.name);
              // Execute the capability script synchronously so the LLM receives
              // the actual structured result in Turn 2 and can synthesize a
              // natural-language reply in the customer's language.
              let scriptOutput: Record<string, unknown>;
              try {
                scriptOutput = await runCapabilityScriptExecution({
                  tenantId: input.tenantId,
                  customerId: input.customerId,
                  conversationId: input.conversationId,
                  capability: {
                    capabilityId: toolOwner!.capabilityId,
                    slug: toolOwner!.slug,
                    name: toolOwner!.name,
                    description: toolOwner!.description
                  },
                  script: {
                    scriptKey: dynamicScript.scriptKey,
                    name: dynamicScript.name,
                    fileName: dynamicScript.fileName,
                    language: dynamicScript.language,
                    sourceCode: dynamicScript.sourceCode,
                    requirements: dynamicScript.requirements,
                    envRefs: dynamicScript.envRefs,
                    envBindings: dynamicScript.envBindings
                  },
                  args
                });
              } catch (execError) {
                scriptOutput = {
                  status: "runtime_error",
                  message: (execError as Error).message ?? "script_execution_failed"
                };
              }
              // Strip customerReply — the LLM generates the user-facing reply in Turn 2
              const { customerReply: _removed, ...toolData } = scriptOutput as Record<string, unknown> & { customerReply?: unknown };
              const result = toolData;
              await recordSkillInvocation(db, {
                tenantId: input.tenantId,
                conversationId: input.conversationId,
                skillName: toolCall.function.name,
                actorType,
                args,
                decision: "allowed",
                durationMs: Date.now() - startedAt,
                result,
                policyMap: hydratedRuntimePolicy
              });
              toolResult = JSON.stringify(result);

              // ── Fact Layer: register this tool result as a verified fact ──
              runVerifiedFacts.push(
                buildVerifiedFactFromToolResult(toolCall.function.name, args, result)
              );

              // ── Task Bridge: auto-generate case_task for AI skill execution ──
              void recordSkillExecutionAsTask(db, {
                tenantId: input.tenantId,
                conversationId: input.conversationId,
                caseId: input.caseId ?? null,
                customerId: input.customerId,
                skillName: toolCall.function.name,
                args,
                resultSummary: summarizeSkillResult(result) || "Execution completed",
                creatorType: "ai",
                creatorId: input.aiAgentId ?? null
              }).catch(() => null);
            } else {
              const reason = gate.reason;
              skillsBlocked.push({ name: toolCall.function.name, reason });
              await recordSkillInvocation(db, {
                tenantId: input.tenantId,
                conversationId: input.conversationId,
                skillName: toolCall.function.name,
                actorType,
                args,
                decision: "blocked",
                denyReason: reason,
                result: {
                  message: gate.detail
                },
                policyMap: hydratedRuntimePolicy
              });
              toolResult = JSON.stringify({
                error: reason,
                message: gate.detail
              });
            }
          } else {
            await recordSkillInvocation(db, {
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              skillName: toolCall.function.name,
              actorType,
              args: safeParseJson(toolCall.function.arguments),
              decision: "error",
              denyReason: "unknown_skill",
              result: { error: `Unknown skill: ${toolCall.function.name}` },
              policyMap: runtimePolicy
            });
            toolResult = JSON.stringify({ error: `Unknown skill: ${toolCall.function.name}` });
          }
          loopMessages.push({
            role: "tool",
            content: toolResult,
            toolCallId: toolCall.id
          });
        }

        // ── Harness Sandbox: Point A (mid-loop) ─────────────────────────────
        const pointARevision = sandbox.runPointA({
          runVerifiedFacts,
          factSnapshot,
          loopIndex,
          maxLoops: MAX_AGENT_LOOPS,
          skillsInvoked,
          skillsBlocked,
          loopMessages,
          chatHistory: llmMessages
        });
        if (pointARevision.modified && pointARevision.revisedContent) {
          loopMessages.push({
            role: "system",
            content: pointARevision.revisedContent
          });
        }
        // If the LLM called requestHumanHandoff, exit the agentic loop immediately
        if (handoffRequestedByTool) break;
      }

      // Apply tool-driven handoff override BEFORE policy evaluation
      if (handoffRequestedByTool) {
        finalContent = JSON.stringify({
          action: "handoff",
          response: "",
          handoffReason: handoffReasonFromTool,
          intent: "human_handoff",
          sentiment: "neutral",
          confidence: 0.95
        });
      }

      // ── Ensure finalContent is JSON ─────────────────────────────────────────
      // When tools are present the LLM runs in "text" mode and may respond with:
      //   (a) an empty string after a tool-call turn (the common case) → force a
      //       json_object call so it wraps the tool result into a proper reply.
      //   (b) a plain-text reply on its final turn (no further tool calls needed)
      //       → wrap it directly into the JSON envelope; no extra LLM call needed.
      // Without this guard the plain-text content fails JSON.parse → action="defer"
      // → the reply is silently dropped even though the LLM produced a good answer.
      {
        const trimmed = finalContent.trim();
        const looksLikeJson = trimmed.startsWith("{");

        if (lastToolCalls.length > 0 && !trimmed) {
          // Case (a): tool-call turn produced no content → ask for JSON summary
          const forcedFinal = await callLLM(
            aiSettings.provider,
            model,
            loopMessages,
            [],
            aiSettings.temperature,
            aiSettings.maxTokens,
            "json_object"
          );
          finalContent = forcedFinal.content;
          tokensUsed += forcedFinal.tokensUsed;
          inputTokens += forcedFinal.inputTokens;
          outputTokens += forcedFinal.outputTokens;
        } else if (trimmed && !looksLikeJson) {
          // Case (b): LLM returned a plain-text reply (not JSON) in tools mode.
          // Wrap it into the expected contract shape so it is not discarded.
          finalContent = JSON.stringify({
            action: "reply",
            response: trimmed,
            intent: "general_inquiry",
            sentiment: "neutral",
            confidence: 0.75
          });
        }
      }

      // ── Parse response ──────────────────────────────────────────────────────
      const aiDecision = normalizeAIInteractionContract(finalContent, {
        chatHistory,
        defaultAction: "reply"
      });

      // ── Harness Sandbox: Point B (post-answer) ────────────────────────────
      const pointBRevision = await sandbox.runPointB({
        finalContent,
        proposedAction: aiDecision.action,
        proposedIntent: aiDecision.intent,
        proposedSentiment: aiDecision.sentiment,
        runVerifiedFacts,
        factSnapshot,
        skillsInvoked,
        loopMessages,
        chatHistory: llmMessages,
        llm: {
          provider: aiSettings.provider,
          model,
          temperature: aiSettings.temperature,
          maxTokens: aiSettings.maxTokens
        }
      });
      const sandboxTokens = sandbox.snapshot.sandboxTokens;
      inputTokens += sandboxTokens.input;
      outputTokens += sandboxTokens.output;

      // ── Record AI usage (AFTER sandbox so rewrite/clarify tokens are included)
      await recordAIUsage(db, {
        tenantId: input.tenantId,
        provider: providerName,
        model,
        feature: "orchestrator",
        inputTokens,
        outputTokens,
        requestCount: Math.max(1, loopMessages.filter((item) => item.role === "assistant").length),
        metadata: {
          conversationId: input.conversationId,
          aiAgentId: input.aiAgentId ?? null,
          actorType,
          semanticTrack: semanticRoute.track,
          capabilityScope: input.capabilityScope ?? null,
          skillsInvoked,
          selectedSkillSlug: selectedSkill?.slug ?? null,
          hydratedSkillSlugs: hydratedSkills.map((skill) => skill.slug)
        }
      });

      if (pointBRevision.modified) {
        if (pointBRevision.action === "handoff") {
          aiDecision.action = "handoff" as AIControlAction;
          aiDecision.handoffReason = pointBRevision.handoffReason ?? "verifier_forced_handoff";
        } else if (pointBRevision.action === "rewrite_answer" && pointBRevision.revisedContent) {
          // Re-parse the rewritten content through the contract normalizer
          const revised = normalizeAIInteractionContract(pointBRevision.revisedContent, {
            chatHistory,
            defaultAction: "reply"
          });
          aiDecision.action = revised.action;
          aiDecision.response = revised.response;
          aiDecision.intent = revised.intent;
          aiDecision.sentiment = revised.sentiment;
          aiDecision.confidence = revised.confidence;
          finalContent = pointBRevision.revisedContent;
        }
      }

      const composedAnswer = composeFinalAnswer({
        aiDecision,
        policyEnforcement: {
          action: aiDecision.action,
          handoffReason: aiDecision.handoffReason ?? null
        },
        finalContent,
        tokensUsed,
        skillsInvoked,
        skillsBlocked
      });
      const effectiveAction = composedAnswer.action;
      const effectiveHandoffReason = composedAnswer.handoffReason;
      const responseText = composedAnswer.responseText;
      const responseSummary = composedAnswer.responseSummary;

      await db("skill_runs")
        .where({ run_id: skillRunId })
        .update({
          status: skillsInvoked.length > 0 ? "succeeded" : effectiveAction === "handoff" ? "blocked" : "completed",
          updated_at: db.fn.now()
        });

      // ── Capability state tracking ─────────────────────────────────────────
      // Without a planner, we track state only for the continuation skill
      // (an in-progress multi-step flow). If the LLM replied without invoking
      // the continuation skill, it's asking for clarification — save that state.
      // If a skill was blocked by a guard, do NOT treat it as clarification.
      const skillBlockedByGuard = selectedSkill && skillsInvoked.length === 0 && skillsBlocked.some(
        (b) => selectedSkill.scripts.some((s) => s.scriptKey === b.name)
      );
      if (selectedSkill && skillsInvoked.length === 0 && effectiveAction === "reply" && responseText && !skillBlockedByGuard) {
        // LLM replied without invoking the continuation skill — it's clarifying
        await upsertConversationCapabilityState(db, {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          customerId: input.customerId,
          capabilityId: selectedSkill.capabilityId,
          status: "clarifying",
          clarificationQuestion: responseText,
          missingInputs: Array.isArray(selectedSkill.inputSchema.required)
            ? selectedSkill.inputSchema.required.map((item) => String(item))
            : [],
          resolvedInputs: {},
          lastUserMessage: chatHistory.filter((message) => message.role === "user").at(-1)?.content ?? null
        });
      } else if (selectedSkill) {
        // Continuation skill was invoked or something else happened — clear stale state
        await clearConversationCapabilityState(db, {
          tenantId: input.tenantId,
          conversationId: input.conversationId
        });
      }

      // ── Update working memory (fire-and-forget) ───────────────────────────
      const lastUserMsg = chatHistory.filter((m) => m.role === "user").at(-1);
      if (lastUserMsg && responseText) {
        const now = Date.now();
        const usedEntryIds = preloadedKnowledgeEntries.map((e) => e.entry_id);
        appendWorkingMemory(input.conversationId, [
          { role: "user", content: lastUserMsg.content, ts: now },
          {
            role: "assistant",
            content: responseText,
            ts: now + 1,
            knowledgeEntryIds: usedEntryIds.length > 0 ? usedEntryIds : undefined,
            // Record sentiment at reply time; used next turn to detect sentiment degradation
            sentimentAtReply: aiDecision.sentiment
          }
        ]).catch(() => null);

        // Increment hit_count for knowledge entries actually used in this reply
        if (usedEntryIds.length > 0) {
          db("knowledge_base_entries")
            .where("tenant_id", input.tenantId)
            .whereIn("entry_id", usedEntryIds)
            .update({ last_used_at: db.fn.now() })
            .then(() =>
              db("knowledge_base_entries")
                .where("tenant_id", input.tenantId)
                .whereIn("entry_id", usedEntryIds)
                .increment("hit_count", 1)
            )
            .catch(() => null);
        }
      }

      const entities = extractEntitiesFromText(
        chatHistory.map((message) => message.content).join(" ")
      );
      await upsertConversationInsight(db, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        data: {
          summary: responseSummary,
          lastIntent: aiDecision.intent,
          lastSentiment: aiDecision.sentiment,
          messageCount: chatHistory.length,
          keyEntities: entities
        }
      }).catch(() => null);

      if (!(selectedSkill && skillsInvoked.length === 0) && aiDecision.intent !== "clarification_request") {
        void scheduleConversationMemoryEncoding({
          tenantId: input.tenantId,
          customerId: input.customerId,
          conversationId: input.conversationId,
          caseId: input.caseId ?? null,
          chatHistory,
          conversationSummary: responseSummary,
          lastIntent: aiDecision.intent,
          lastSentiment: aiDecision.sentiment,
          finalResponse: responseText ?? null
        }).catch(() => null);
      }

      const sandboxSnapshot = sandbox.snapshot;
      void scheduleExecutionArchive({
        tenantId: input.tenantId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        aiAgent,
        memoryContext: harnessContext.customerIntelligence ?? "",
        action: effectiveAction,
        finalContent: responseText ?? "",
        intent: aiDecision.intent,
        sentiment: aiDecision.sentiment,
        tokensUsed,
        skillsInvoked,
        skillsBlocked,
        toolCalls: lastToolCalls,
        handoffReason: effectiveHandoffReason ?? null,
        sandboxSnapshot
      }).catch(() => null);

      return composedAnswer.result;
    } catch (error) {
      if (selectedSkill) {
        await clearConversationCapabilityState(db, {
          tenantId: input.tenantId,
          conversationId: input.conversationId
        }).catch(() => null);
      }
      if (skillRunId) {
        await db("skill_runs")
          .where({ run_id: skillRunId })
          .update({
            status: "failed",
            planner_trace: {
              error: (error as Error).message
            },
            updated_at: db.fn.now()
          })
          .catch(() => null);
      }
      return noAiResult(`api_error: ${(error as Error).message}`);
    }
  }
}

function normalizePreferredSkills(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

async function scheduleExecutionArchive(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  aiAgent: AIAgentRow | null | undefined;
  memoryContext: string;
  action: AIControlAction;
  finalContent: string;
  intent: string;
  sentiment: string;
  tokensUsed: number;
  skillsInvoked: string[];
  skillsBlocked: Array<{ name: string; reason: string }>;
  toolCalls: AIToolCall[];
  handoffReason: string | null;
  sandboxSnapshot: import("../ai/harness/types.js").HarnessSandbox;
}) {
  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    taskType: "ai_execution_archive",
    title: "AI execution archive",
    source: "ai",
    priority: 90,
    payload: {
      summary: [
        input.aiAgent?.name ? `seat=${input.aiAgent.name}` : null,
        `action=${input.action}`,
        `intent=${input.intent}`,
        `sentiment=${input.sentiment}`,
        input.skillsInvoked.length > 0 ? `skills=${input.skillsInvoked.join(",")}` : null,
        input.handoffReason ? `handoff=${input.handoffReason}` : null
      ].filter(Boolean).join(" | "),
      intent: input.intent,
      sentiment: input.sentiment,
      response: input.finalContent,
      context: input.memoryContext,
      executionSteps: {
        aiAgentId: input.aiAgent?.ai_agent_id ?? null,
        aiAgentName: input.aiAgent?.name ?? null,
        tokensUsed: input.tokensUsed,
        skillsInvoked: input.skillsInvoked,
        skillsBlocked: input.skillsBlocked,
        toolCalls: input.toolCalls.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments
        })),
        handoffReason: input.handoffReason,
        // Sandbox steps folded from harness snapshot (replaces separate verifier/reviser arrays)
        sandboxOverride: input.sandboxSnapshot.overrideAction,
        sandboxTokens: input.sandboxSnapshot.sandboxTokens,
        verifierSteps: input.sandboxSnapshot.verifierSteps.map((s) => ({
          point: s.point,
          loop: s.loop,
          action: s.action,
          findings: s.findings.filter((f) => f.triggered)
        })),
        reviserSteps: input.sandboxSnapshot.reviserSteps
      }
    }
  });
}

async function scheduleConversationMemoryEncoding(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  caseId?: string | null;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  conversationSummary: string;
  lastIntent: string;
  lastSentiment: string;
  finalResponse?: string | null;
}) {
  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    caseId: input.caseId ?? null,
    taskType: "memory_encode_conversation_event",
    title: "Conversation memory encoding",
    source: "ai",
    priority: 88,
    schedulerKey: `memory-conversation:${input.conversationId}:${Date.now()}`,
    payload: {
      conversationSummary: input.conversationSummary,
      lastIntent: input.lastIntent,
      lastSentiment: input.lastSentiment,
      finalResponse: input.finalResponse ?? null,
      messages: input.chatHistory.slice(-12).map((message) => ({
        role: message.role,
        content: message.content
      }))
    }
  });
}

// buildSystemPrompt has been moved to harness/prompt-assembler.ts

function buildRuntimeTools(input: {
  candidateSkills: Array<{
    description: string | null;
    inputSchema: Record<string, unknown>;
    scripts: Array<{
      enabled: boolean;
      scriptKey: string;
      name: string;
    }>;
  }>;
  runtimePolicy: Map<string, unknown>;
  preferredScriptKeys: string[];
}): AIToolDefinition[] {
  const tools: AIToolDefinition[] = [];
  const existingNames = new Set<string>();
  for (const skill of input.candidateSkills) {
    for (const script of skill.scripts) {
      if (!script.enabled) continue;
      if (existingNames.has(script.scriptKey)) continue;
      if (!input.runtimePolicy.has(script.scriptKey)) continue;
      if (input.preferredScriptKeys.length > 0 && !input.preferredScriptKeys.includes(script.scriptKey)) continue;

      tools.push({
        type: "function",
        function: {
          name: script.scriptKey,
          description: script.name || skill.description || `Execute ${script.scriptKey}`,
          parameters: toToolParameters(skill.inputSchema)
        }
      });
      existingNames.add(script.scriptKey);
    }
  }

  return tools;
}

function toToolParameters(inputSchema: Record<string, unknown> | undefined) {
  const properties = inputSchema?.properties;
  const required = inputSchema?.required;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    return {
      type: "object" as const,
      properties: properties as Record<string, {
        type: "string" | "number" | "boolean" | "object" | "array";
        description: string;
        enum?: string[];
      }>,
      required: Array.isArray(required) ? required.map((item) => String(item)) : undefined
    };
  }
  return {
    type: "object" as const,
    properties: {
      identifier: {
        type: "string" as const,
        description: "Customer-provided reference identifier (e.g. order number, ticket ID, account number, booking code)."
      },
      query: {
        type: "string" as const,
        description: "The raw customer query or key lookup value."
      },
      image_url: {
        type: "string" as const,
        description: "Image URL or data URL when the customer sent an image."
      },
      question: {
        type: "string" as const,
        description: "Short question for the tool, usually copied from the user's latest request."
      }
    },
    required: []
  };
}

// ─── OpenAI helpers ───────────────────────────────────────────────────────────

interface LLMCallResult {
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls?: AIToolCall[];
}

async function callLLM(
  provider: AIProvider,
  model: string,
  messages: AIMessage[],
  tools: AIToolDefinition[],
  temperature: number,
  maxTokens: number,
  responseFormat: "text" | "json_object" = "text"
): Promise<LLMCallResult> {
  const result = await provider.complete({
    model,
    messages,
    tools,
    toolChoice: tools.length > 0 ? "auto" : "none",
    responseFormat,
    temperature,
    maxTokens
  });

  return {
    content: result.content,
    tokensUsed: result.tokensUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    toolCalls: result.toolCalls
  };
}

// ─── NLP helpers ──────────────────────────────────────────────────────────────

function buildChatHistory(rows: MsgRow[]): { role: "user" | "assistant"; content: string }[] {
  return rows
    .filter((r) => r.content?.text || (r.direction === "inbound" && (r.content?.attachments?.length ?? 0) > 0))
    .map((r) => {
      const text = r.content?.text ?? "";
      // Append attachment markers so the Planner / LLM knows what was sent.
      // The marker format `[Attachment: <path> (<mime>)]` is intentionally plain text:
      // it lets the LLM pass the path as `image_url` in a tool call, and the
      // orchestrator later resolves the path to base64 before script execution.
      const attachmentNotes = r.direction === "inbound"
        ? (r.content?.attachments ?? [])
            .filter((a) => a.url)
            .map((a) => `[Attachment: ${a.url} (${a.mimeType ?? "file"})]`)
            .join(" ")
        : "";
      const combined = [text, attachmentNotes].filter(Boolean).join(" ");
      return {
        role: (r.direction === "outbound" ? "assistant" : "user") as "user" | "assistant",
        content: combined
      };
    });
}

// Full-fidelity version of buildChatHistory for actual LLM calls.
//
// Images are delivered as base64 data URLs rather than remote URLs because:
//   1. Local uploads (data/uploads/) live at localhost which LLM providers cannot fetch.
//   2. Even in production, inlining avoids a round-trip and works for all deployments.
//
// Non-image attachments (PDF, audio, etc.) are described in text so the LLM is
// at least aware they exist even when it cannot process them directly.
//
// Requires a vision-capable model (gpt-4o, gpt-4-turbo, claude-3-*, gemini-1.5-*)
// to actually process image content.
async function buildLLMMessages(rows: MsgRow[]): Promise<AIMessage[]> {
  const results: AIMessage[] = [];

  for (const r of rows) {
    const hasText = Boolean(r.content?.text);
    const attachments = r.direction === "inbound" ? (r.content?.attachments ?? []) : [];
    if (!hasText && attachments.length === 0) continue;

    const text = r.content?.text ?? "";

    if (attachments.length === 0) {
      if (hasText) {
        results.push({
          role: (r.direction === "outbound" ? "assistant" : "user") as "user" | "assistant",
          content: text
        });
      }
      continue;
    }

    const parts: AIContentPart[] = [];
    if (text) parts.push({ type: "text", text });

    for (const att of attachments) {
      if (!att.url) continue;

      if (att.mimeType?.startsWith("image/")) {
        const imageUrl = await resolveAttachmentUrlToModelInput(att.url, att.mimeType);

        parts.push({ type: "image_url", imageUrl, mimeType: att.mimeType });
      } else {
        const label = att.fileName ?? att.url.split("/").pop() ?? "attachment";
        parts.push({ type: "text", text: `[Attachment: ${label} (${att.mimeType ?? "unknown type"})]` });
      }
    }

    results.push({ role: "user", content: parts });
  }

  return results;
}

/**
 * Returns true when:
 *   1. A skill ran successfully in this conversation within the last 3 minutes, AND
 *   2. The skill result is already visible in chatHistory — i.e. the sequence ends
 *      with [..., assistant, user], meaning the customer received the result and is
 *      now asking a follow-up question about the same data.
 *
 * When true, the orchestrator skips skill selection and lets the LLM synthesize
 * a focused reply from the existing conversation context, which:
 *   - Prevents redundant re-invocation of the same skill
 *   - Lets the AI reply in the customer's language (following SYSTEM_PROMPT_BASE)
 *   - Avoids extra LLM planner + tool execution overhead
 *
 * The 3-minute window resets automatically, so a genuinely new query for a
 * different entity (e.g. a new tracking number) will re-invoke normally after
 * the window expires.
 */
async function checkRecentSkillContext(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  }
): Promise<boolean> {
  // Guard: need at least [user, assistant, user] for a follow-up pattern
  const len = input.chatHistory.length;
  if (len < 3) return false;
  if (input.chatHistory[len - 1]?.role !== "user") return false;
  if (input.chatHistory[len - 2]?.role !== "assistant") return false;

  // Query skill_invocations (the authoritative audit table for synchronous
  // executions) instead of skill_runs.  Each allowed invocation stores the raw
  // tool JSON in result (JSONB), which contains the exact identifiers that were
  // fetched — more reliable than parsing the LLM's prose from chatHistory.
  const recentInvocations = (await db("skill_invocations")
    .where("tenant_id", input.tenantId)
    .where("conversation_id", input.conversationId)
    .where("decision", "allowed")
    .where("invoked_at", ">=", db.raw("now() - interval '5 minutes'"))
    .select("result")
    .orderBy("invoked_at", "desc")
    .limit(5)) as Array<{ result: unknown }>;

  if (recentInvocations.length === 0) return false;

  // Entity-identity check against actual skill result data — the Claude-aligned
  // approach.  Claude inspects prior tool_results in its context window to decide
  // whether re-invocation is needed.  We replicate that logic here by scanning
  // the raw JSON payloads for identifiers and comparing against the current
  // user message.
  //
  // Patterns:
  //   \b\d{8,20}\b            — pure-numeric tracking/order IDs (e.g. 570344510454)
  //   \b[A-Z]{1,6}-?\d{4,}\b  — alphanumeric codes (e.g. JT123456, CS-0012)
  const IDENTIFIER_RE = /\b\d{8,20}\b|\b[A-Z]{1,6}-?\d{4,}\b/g;

  const resultText = recentInvocations
    .map((row) =>
      typeof row.result === "string"
        ? row.result
        : JSON.stringify(row.result ?? {})
    )
    .join(" ");

  const knownIds = new Set(
    (resultText.match(IDENTIFIER_RE) ?? []).map((s) => s.toUpperCase())
  );

  const userMsg = input.chatHistory[len - 1]!.content;
  const userIds = [
    ...new Set((userMsg.match(IDENTIFIER_RE) ?? []).map((s) => s.toUpperCase()))
  ];

  // A new identifier in the user's message that is absent from all recent
  // tool results means we have no data for it — must invoke the skill.
  if (userIds.length > 0 && userIds.some((id) => !knownIds.has(id))) return false;

  return true;
}

// Builds a compact [RECENT TOOL RESULTS] block injected into the system prompt.
// This is the key mechanism that aligns NuyChat with Claude's native tool-use
// NOTE: buildRecentSkillInvocationContext removed — replaced by Fact Layer
// (buildFactSnapshot + formatFactSnapshotForPrompt from ai/fact-layer.service.ts)

/**
 * Returns true when the customer's last message is an unambiguous request for a
 * human agent. These are handled deterministically — the LLM is not called because
 * it cannot know real-time agent availability and would fabricate a response.
 *
 * Patterns are intentionally conservative to avoid false positives on phrases like
 * "how artificial intelligence works" (人工智能) or "human error" etc.
 */
const EXPLICIT_HUMAN_TRANSFER_PATTERNS = [
  // Chinese
  /转人工/,
  /要人工/,
  /找人工/,
  /联系人工/,
  /人工客服/,
  /转客服/,
  /转接人工/,
  /需要人工/,
  // English (word-boundary anchored to avoid partial matches)
  /\btransfer.*human\b/i,
  /\bspeak.*(?:to\s+a?\s*)?(?:human|agent|person|representative)\b/i,
  /\btalk.*(?:to\s+a?\s*)?(?:human|agent|person|representative)\b/i,
  /\b(?:live|human)\s+agent\b/i,
  /\breal\s+(?:person|human)\b/i,
  /\bconnect.*human\b/i,
  // Indonesian
  /\bagen\s+manusia\b/i,
  /\bmanusia\s+(?:saja|sekarang)\b/i,
  /\bminta\s+manusia\b/i,
  /\bhubungi\s+(?:agen|manusia)\b/i,
  /\bsambungkan.*manusia\b/i,
  /\balihkan.*manusia\b/i
];

function isExplicitHumanTransferRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return EXPLICIT_HUMAN_TRANSFER_PATTERNS.some((pattern) => pattern.test(t));
}

/**
 * Computes a simple token-overlap ratio between two texts (Jaccard-like on CJK bigrams + Latin words).
 * Used to detect repeat questions: if the user's current message shares >= 55% tokens with their
 * previous message, we treat it as a repeated inquiry after an unsatisfactory answer.
 *
 * Returns a value in [0, 1]. 0 = no overlap, 1 = identical.
 */
function computeTokenOverlap(a: string, b: string): number {
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>();
    // CJK bigrams
    const cjkSegs = text.match(/[一-鿿぀-ヿ가-힯]+/g) ?? [];
    for (const seg of cjkSegs) {
      if (seg.length >= 2) tokens.add(seg);
      for (let i = 0; i < seg.length - 1; i++) tokens.add(seg[i] + seg[i + 1]);
    }
    // Latin words ≥ 2 chars
    for (const w of (text.match(/[a-zA-Z]{2,}/g) ?? [])) tokens.add(w.toLowerCase());
    return tokens;
  };
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / Math.max(ta.size, tb.size);
}

/**
 * Detects when the customer signals that the AI's previous answer was incorrect or unhelpful.
 * Used to trigger a "correction" loop: exclude previously-used knowledge entries and instruct
 * the LLM to search for alternative content rather than repeating the same answer.
 *
 * Intentionally conservative — requires explicit correction signal, not general negativity.
 */
const USER_PUSHBACK_PATTERNS = [
  // Chinese — explicit correction / "wrong"
  /不对[啊吧呀嘛]?/,
  /不是这[个样]?/,
  /说错了/,
  /答错了/,
  /答非所问/,
  /错了[啊吧]?/,
  /不正确/,
  /有误/,
  /你说的不[对是]/,
  // Chinese — "still not working / still the same"
  /还是不[行对]/,
  /还是一样/,
  /还是那样/,
  /依然不[行对]/,
  /仍然不[行对]/,
  /没有[用解决]/,
  /没解决/,
  /没有帮助/,
  /不管用/,
  // Chinese — explicit re-search request
  /重新查[一下查找]*/,
  /再查[一下查找]*/,
  /换个[方式答案]/,
  /换一种/,
  // English
  /\b(wrong|incorrect|not right|that('s| is) (wrong|not right|incorrect))\b/i,
  /\b(still doesn'?t|still not|doesn'?t (work|help)|that didn'?t (work|help))\b/i,
  /\bthat('s| is) not (what|the|correct|right)\b/i,
  /\btry again\b/i,
  /\bdifferent answer\b/i
];

function detectUserPushback(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return USER_PUSHBACK_PATTERNS.some((pattern) => pattern.test(t));
}

function noAiResult(reason: string): OrchestratorResult {
  return {
    action: "handoff",
    response: null,
    intent: "handoff_request",
    sentiment: "neutral",
    shouldHandoff: true,
    handoffReason: reason,
    tokensUsed: 0,
    confidence: 0,
    skillsInvoked: []
  };
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Scan tool-call args for any string value that is a local /uploads/ path and
// convert it to a base64 data URL so scripts receive a self-contained value
// that does not depend on network access to localhost.
async function resolveAttachmentArgs(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && looksLikeAttachmentValue(value)) {
      resolved[key] = await resolveAttachmentUrlToModelInput(value);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

function looksLikeAttachmentValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:")) return true;
  if (trimmed.startsWith("/uploads/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

async function resolveAttachmentUrlToModelInput(rawUrl: string, explicitMimeType?: string): Promise<string> {
  const uploadsDir = getUploadsDir();
  const fileName = extractUploadsFileName(rawUrl);
  if (!fileName) {
    const apiBase = (process.env.API_PUBLIC_BASE ?? "").replace(/\/$/, "");
    return rawUrl.startsWith("http") ? rawUrl : `${apiBase}${rawUrl}`;
  }

  const filePath = path.join(uploadsDir, fileName);
  try {
    const buf = await readFile(filePath);
    const mime = explicitMimeType ?? inferMimeTypeFromFileName(fileName);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    const apiBase = (process.env.API_PUBLIC_BASE ?? "").replace(/\/$/, "");
    return rawUrl.startsWith("http") ? rawUrl : `${apiBase}${rawUrl}`;
  }
}

function extractUploadsFileName(rawUrl: string): string | null {
  if (rawUrl.startsWith("/uploads/")) {
    return rawUrl.slice("/uploads/".length);
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname.slice("/uploads/".length);
    }
  } catch {
    return null;
  }

  return null;
}

function inferMimeTypeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function extractEntitiesFromText(text: string) {
  // Generic reference ID extraction — alphanumeric codes and long digit sequences.
  // Stored as `orderIds` to stay compatible with the memory-layer schema; the
  // values may be any kind of reference ID, not specifically order numbers.
  const rawReferenceIds = [
    ...(text.match(/\b[A-Z]{1,6}-?\d{4,}\b/g) ?? []),  // alphanumeric ref codes (e.g. INV-1234, AB12345)
    ...(text.match(/\b\d{8,20}\b/g) ?? [])               // long numeric strings
  ];
  const orderIds = [...new Set(rawReferenceIds)];
  const orderIdSet = new Set(orderIds);
  const phones = (text.match(/\+?\d{8,15}/g) ?? []).filter((p) => !orderIdSet.has(p));
  return {
    orderIds,
    phones: [...new Set(phones)],
    addresses: [] as string[]
  };
}
