import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Knex } from "knex";
import type { AIContentPart, AIMessage, AIProvider, AIToolCall, AIToolDefinition } from "../../../../../packages/ai-sdk/src/index.ts";
import { getUploadsDir } from "../../infra/storage/upload.service.js";
import { runCapabilityScriptExecution } from "../tasks/task-script-execution.service.js";
import {
  evaluateSkillExecutionGate,
  getBoundRuntimePolicies,
  recordSkillInvocation
} from "../skills/runtime-governance.service.js";
import {
  listTenantSkillsForPlanning,
} from "../agent-skills/skill-definition.service.js";
import { suggestCapabilities } from "../agent-skills/skill-planner.service.js";
import {
  recordSkillExecutionTrace,
  recordSkillRun,
  validateCapabilitySuggestions,
  validateToolExecutionAgainstCandidates
} from "../agent-skills/planner-guard.service.js";
import {
  clearConversationCapabilityState,
  getConversationCapabilityState,
  upsertConversationCapabilityState
} from "../agent-skills/capability-state.service.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import {
  buildCustomerIntelligenceContext,
  appendWorkingMemory,
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
  enforcePreReplyPolicy,
  evaluatePreReplyPolicy
} from "../ai/pre-reply-policy.service.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import {
  buildFactSnapshot,
  buildVerifiedFactFromToolResult,
  formatFactSnapshotForPrompt,
  type FactSnapshot,
  type VerifiedFact
} from "../ai/fact-layer.service.js";
import {
  evaluatePointA,
  evaluatePointB,
  type VerifierVerdict
} from "../ai/verifier/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  caseId?: string | null;
  aiAgentId?: string | null;
  moduleId?: string | null;
  skillGroupId?: string | null;
  actorType?: "ai" | "agent" | "workflow";
  requesterId?: string | null;
  preferredSkillNames?: string[];
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

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are a professional customer service AI assistant.

Rules:
- Always reply in the same language the customer uses.
- Be concise, helpful, and empathetic.
- When you need order or shipping information, use the tools provided — do not guess.
- Never ask for phone digits, recipient name, verification details, or extra requirements unless they are explicitly required by the selected skill contract or returned by a tool result/error.
- You are an AI agent.
- At each step, either call tools or answer the user.
- If you need more information, call tools.
- If you already have enough information, answer directly.
- Avoid repeating the same tool call with the same arguments unless new information appears.`;

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

    const model = aiSettings.model;
    const providerName = aiSettings.providerName;
    const actorType = input.actorType ?? "ai";
    const runtimePolicy = await getBoundRuntimePolicies(db, {
      tenantId: input.tenantId,
      moduleId: input.moduleId,
      skillGroupId: input.skillGroupId,
      actorType,
      conversationId: input.conversationId
    });
    const requestedPreferredSkills = normalizePreferredSkills(input.preferredSkillNames ?? []);
    const tenantSkills = await listTenantSkillsForPlanning(db, {
      tenantId: input.tenantId,
      channelType: input.channelType,
      actorRole: actorType,
      moduleId: input.moduleId ?? null,
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
    const plannerSkills = continuationSkill
      ? [continuationSkill]
      : preferredScriptKeys.length > 0
      ? tenantSkills.filter((skill) => skill.scripts.some((script) => preferredScriptKeys.includes(script.scriptKey)))
      : tenantSkills;
    // ── Recent skill context guard ────────────────────────────────────────────
    // If a skill already ran successfully in the last 3 minutes AND its result
    // is visible in chatHistory (assistant turn follows the user turn that
    // triggered it), skip skill selection and let the LLM synthesize a
    // focused answer from existing context.  This prevents redundant re-invocation
    // when the customer asks a follow-up like "what is the latest status?" right
    // after receiving a full logistics dump.
    const hasRecentSkillContext = !continuationSkill && await checkRecentSkillContext(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      chatHistory
    });

    const capabilitySuggestions = continuationSkill
      ? {
          candidates: [{ skillSlug: continuationSkill.slug, reason: "continue_capability_state", confidence: 1 }],
          requiresClarification: false,
          clarificationQuestion: null
        }
      : hasRecentSkillContext
        ? {
            candidates: [],
            requiresClarification: false,
            clarificationQuestion: null
          }
        : await suggestCapabilities({
            provider: aiSettings.provider,
            model,
            messages: chatHistory,
            temperature: aiSettings.temperature,
            maxTokens: aiSettings.maxTokens,
            skills: plannerSkills
          });
    const validatedSuggestions = continuationSkill
      ? {
          candidates: [{ skill: continuationSkill, reason: "continue_capability_state", confidence: 1 }],
          requiresClarification: false,
          clarificationQuestion: null
        }
      : await validateCapabilitySuggestions(db, {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          suggestions: capabilitySuggestions,
          availableSkills: plannerSkills
        });
    const candidateSkills = validatedSuggestions.candidates.map((item) => item.skill).slice(0, 5);
    const selectedSkill = candidateSkills[0] ?? null;
    const selectedScriptKey = selectedSkill?.scripts.find(
      (script) => script.enabled && (preferredScriptKeys.length === 0 || preferredScriptKeys.includes(script.scriptKey))
    )?.scriptKey ?? selectedSkill?.scripts.find((script) => script.enabled)?.scriptKey ?? null;
    const skillRunId = await recordSkillRun(db, {
      tenantId: input.tenantId,
      capabilityId: selectedSkill?.capabilityId ?? null,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: input.caseId ?? null,
      status: candidateSkills.length > 0 ? "planned" : "blocked",
      selectedReason: continuationSkill
        ? "continue_capability_state"
        : validatedSuggestions.candidates[0]?.reason ?? "no_capability_selected",
      confidence: validatedSuggestions.candidates[0]?.confidence ?? 0,
      plannerTrace: {
        capabilitySuggestions,
        candidateSkills: validatedSuggestions.candidates.map((item) => ({
          slug: item.skill.slug,
          reason: item.reason,
          confidence: item.confidence
        })),
        selectedScriptKey
      }
    });
    await recordSkillExecutionTrace(db, {
      runId: skillRunId,
      phase: "planner",
      payload: {
        capabilitySuggestions,
        candidateSkillSlugs: candidateSkills.map((skill) => skill.slug),
        availableSkillSlugs: plannerSkills.map((skill) => skill.slug),
        selectedSkillSlug: selectedSkill?.slug ?? null,
        selectedScriptKey
      }
    });
    if (candidateSkills.length === 0) {
      await recordSkillExecutionTrace(db, {
        runId: skillRunId,
        phase: "guard",
        payload: {
          stage: "capability_suggestion",
          reason: "no_candidate_capability",
          fallbackAction: validatedSuggestions.requiresClarification ? "clarify" : "defer"
        }
      });
      if (validatedSuggestions.requiresClarification) {
        const clarificationReply = validatedSuggestions.clarificationQuestion?.trim() || "请补充继续处理所需的信息。";
        if (clarificationReply) {
          await db("skill_runs")
            .where({ run_id: skillRunId })
            .update({
              status: "completed",
              updated_at: db.fn.now()
            });
          return {
            action: "reply",
            response: clarificationReply,
            intent: "clarification_request",
            sentiment: "neutral",
            shouldHandoff: false,
            handoffReason: undefined,
            tokensUsed: 0,
            confidence: 0.5,
            skillsInvoked: [],
            skillsBlocked: []
          };
        }
      }
    }
    if (selectedSkill && candidateSkills.length === 1 && validatedSuggestions.requiresClarification && !continuationSkill) {
      const clarificationReply = buildClarificationReply({
        plannerDecision: validatedSuggestions,
        selectedSkill
      });
      await upsertConversationCapabilityState(db, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        capabilityId: selectedSkill.capabilityId,
        status: "clarifying",
        clarificationQuestion: clarificationReply,
        missingInputs: Array.isArray(selectedSkill.inputSchema.required)
          ? selectedSkill.inputSchema.required.map((item) => String(item))
          : [],
        resolvedInputs: {},
        lastUserMessage: chatHistory.filter((message) => message.role === "user").at(-1)?.content ?? null
      });
      await db("skill_runs")
        .where({ run_id: skillRunId })
        .update({
          status: "waiting_input",
          updated_at: db.fn.now()
        });
      return {
        action: "reply",
        response: clarificationReply,
        intent: "clarification_request",
        sentiment: "neutral",
        shouldHandoff: false,
        handoffReason: undefined,
        tokensUsed: 0,
        confidence: Math.max(validatedSuggestions.candidates[0]?.confidence ?? 0, 0.5),
        skillsInvoked: [],
        skillsBlocked: []
      };
    }
    const tools = buildRuntimeTools({
      candidateSkills,
      runtimePolicy,
      preferredScriptKeys
    });
    const skillsInvoked: string[] = [];
    const skillsBlocked: Array<{ name: string; reason: string }> = [];

    // ── Build system prompt context ────────────────────────────────────────────
    // Load long-term memory + Fact Layer snapshot in parallel; both feed
    // into the system prompt so the LLM has: identity → history → fresh data → tasks.
    const [memoryContext, factSnapshot] = await Promise.all([
      buildCustomerIntelligenceContext(
        db,
        input.tenantId,
        input.conversationId,
        input.customerId,
        {
          excludeMemoryTypes: selectedSkill || continuationSkill ? ["unresolved_issue"] : []
        }
      ),
      buildFactSnapshot(db, {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId
      })
    ]);
    // Track in-flight verified facts accumulated during this orchestration run
    const runVerifiedFacts: VerifiedFact[] = [...factSnapshot.verifiedFacts];

    const factLayerContext = formatFactSnapshotForPrompt(factSnapshot);
    const systemPrompt = buildSystemPrompt({
      basePrompt: SYSTEM_PROMPT_BASE,
      memoryContext,
      recentSkillContext: factLayerContext,
      aiAgent,
      candidateSkills
    });
    const runtimePrompt = `${systemPrompt}\n\n${ORCHESTRATOR_RESPONSE_CONTRACT}`;

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
      const loopMessages: AIMessage[] = [
        { role: "system", content: runtimePrompt },
        ...llmMessages
      ];
      const seenToolCalls = new Set<string>();
      const verifierSteps: Array<{ point: string; loop?: number; verdict: VerifierVerdict }> = [];
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
          const toolOwner = candidateSkills.find((skill) =>
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
              moduleId: input.moduleId,
              skillGroupId: input.skillGroupId,
              actorType,
              requesterId: input.requesterId ?? null,
              policyMap: runtimePolicy,
              skillName: toolCall.function.name,
              args
            });
            const plannerToolGuard = await validateToolExecutionAgainstCandidates(db, {
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              candidateSkills,
              toolName: toolCall.function.name,
              args
            });

            if (gate.action === "allow" && plannerToolGuard.allowed) {
              const startedAt = Date.now();
              skillsInvoked.push(toolCall.function.name);
              await recordSkillExecutionTrace(db, {
                runId: skillRunId,
                phase: "executor",
                payload: {
                  skillName: toolCall.function.name,
                  args
                }
              });
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
                policyMap: runtimePolicy
              });
              toolResult = JSON.stringify(result);

              // ── Fact Layer: register this tool result as a verified fact ──
              runVerifiedFacts.push(
                buildVerifiedFactFromToolResult(toolCall.function.name, args, result)
              );
            } else {
              const reason = gate.action === "allow"
                ? (plannerToolGuard.allowed ? "guard_unknown" : plannerToolGuard.reason)
                : gate.reason;
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
                  message: gate.action === "allow"
                    ? `Planner guard blocked ${toolCall.function.name}`
                    : gate.detail
                },
                policyMap: runtimePolicy
              });
              await recordSkillExecutionTrace(db, {
                runId: skillRunId,
                phase: "guard",
                payload: {
                  skillName: toolCall.function.name,
                  reason,
                  args
                }
              });
              toolResult = JSON.stringify({
                error: reason,
                message: gate.action === "allow"
                  ? `Planner guard blocked ${toolCall.function.name}`
                  : gate.detail
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

        // ── Verifier Point A: mid-loop evaluation ────────────────────────────
        const pointAVerdict = evaluatePointA({
          runVerifiedFacts,
          factSnapshot,
          loopIndex,
          maxLoops: MAX_AGENT_LOOPS,
          skillsInvoked,
          skillsBlocked,
          loopMessages,
          chatHistory: llmMessages
        });
        verifierSteps.push({ point: "A", loop: loopIndex, verdict: pointAVerdict });
      }

      if (lastToolCalls.length > 0 && !finalContent.trim()) {
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
      }

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
          moduleId: input.moduleId ?? null,
          skillGroupId: input.skillGroupId ?? null,
          skillsInvoked,
          selectedSkillSlug: selectedSkill?.slug ?? null,
          candidateSkillSlugs: candidateSkills.map((skill) => skill.slug)
        }
      });

      // ── Parse response ──────────────────────────────────────────────────────
      const aiDecision = normalizeAIInteractionContract(finalContent, {
        chatHistory,
        defaultAction: "reply"
      });

      // ── Verifier Point B: post-answer evaluation ───────────────────────────
      const pointBVerdict = evaluatePointB({
        finalContent,
        proposedAction: aiDecision.action,
        runVerifiedFacts,
        factSnapshot,
        skillsInvoked,
        loopMessages,
        chatHistory: llmMessages
      });
      verifierSteps.push({ point: "B", verdict: pointBVerdict });

      // If verifier says handoff, override the AI decision
      if (pointBVerdict.action === "handoff" && aiDecision.action !== "handoff") {
        aiDecision.action = "handoff" as AIControlAction;
        aiDecision.handoffReason = pointBVerdict.findings
          .filter((f) => f.triggered)
          .map((f) => f.reason)
          .join("; ");
      }

      const policyEnforcement = enforcePreReplyPolicy({
        policy: preReplyPolicy,
        invokedBindings: skillsInvoked,
        proposedAction: aiDecision.action,
        currentHandoffReason: aiDecision.handoffReason ?? null
      });
      const effectiveAction = policyEnforcement.action;
      const effectiveHandoffReason = policyEnforcement.handoffReason;
      const responseText = effectiveAction === "reply" ? aiDecision.response : null;
      const responseSummary = responseText ?? effectiveHandoffReason ?? finalContent.slice(0, 400);
      if (policyEnforcement.blocked) {
        for (const checkName of policyEnforcement.missingChecks) {
          skillsBlocked.push({ name: checkName, reason: "pre_reply_policy_required" });
        }
      }

      await db("skill_runs")
        .where({ run_id: skillRunId })
        .update({
          status: skillsInvoked.length > 0 ? "succeeded" : effectiveAction === "handoff" ? "blocked" : "completed",
          updated_at: db.fn.now()
        });

      // Only enter "clarifying" capability state when the skill was genuinely
      // awaiting user input (i.e. the planner asked for clarification and the
      // AI replied with a question).  If the skill was blocked by a guard
      // (duplicate, rate-limit, etc.) and the AI synthesised from context,
      // that is NOT a clarification — clear any stale state instead.
      const skillBlockedByGuard = selectedSkill && skillsInvoked.length === 0 && skillsBlocked.some(
        (b) => selectedSkill.scripts.some((s) => s.scriptKey === b.name)
      );
      if (selectedSkill && skillsInvoked.length === 0 && effectiveAction === "reply" && responseText && !skillBlockedByGuard) {
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
        await clearConversationCapabilityState(db, {
          tenantId: input.tenantId,
          conversationId: input.conversationId
        });
      }

      // ── Update working memory (fire-and-forget) ───────────────────────────
      const lastUserMsg = chatHistory.filter((m) => m.role === "user").at(-1);
      if (lastUserMsg && responseText) {
        const now = Date.now();
        appendWorkingMemory(input.conversationId, [
          { role: "user", content: lastUserMsg.content, ts: now },
          { role: "assistant", content: responseText, ts: now + 1 }
        ]).catch(() => null);
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

      void scheduleExecutionArchive({
        tenantId: input.tenantId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        aiAgent,
        memoryContext,
        action: effectiveAction,
        finalContent: responseText ?? "",
        intent: aiDecision.intent,
        sentiment: aiDecision.sentiment,
        tokensUsed,
        skillsInvoked,
        skillsBlocked,
        toolCalls: lastToolCalls,
        handoffReason: effectiveHandoffReason ?? null,
        verifierSteps
      }).catch(() => null);

      if (effectiveAction === "handoff") {
        return {
          action: effectiveAction,
          response: null,
          intent: aiDecision.intent,
          sentiment: aiDecision.sentiment,
          shouldHandoff: true,
          handoffReason: effectiveHandoffReason ?? "human_review_required",
          tokensUsed,
          confidence: aiDecision.confidence,
          skillsInvoked,
          skillsBlocked
        };
      }

      return {
        action: effectiveAction,
        response: responseText,
        intent: aiDecision.intent,
        sentiment: aiDecision.sentiment,
        shouldHandoff: false,
        tokensUsed,
        confidence: aiDecision.confidence,
        skillsInvoked,
        skillsBlocked
      };
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
  verifierSteps: Array<{ point: string; loop?: number; verdict: VerifierVerdict }>;
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
        verifierSteps: input.verifierSteps.map((s) => ({
          point: s.point,
          loop: s.loop,
          action: s.verdict.action,
          summary: s.verdict.summary,
          findings: s.verdict.findings.filter((f) => f.triggered)
        }))
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

function buildSystemPrompt(input: {
  basePrompt: string;
  memoryContext: string | null;
  recentSkillContext: string | null;
  aiAgent: AIAgentRow | null | undefined;
  candidateSkills?: Array<{
    name: string;
    description: string | null;
    skillMarkdown: string | null;
  }>;
}): string {
  const sections = [input.basePrompt];

  if (input.aiAgent) {
    const personaLines = [
      input.aiAgent.name ? `AI seat: ${input.aiAgent.name}` : null,
      input.aiAgent.role_label ? `Role: ${input.aiAgent.role_label}` : null,
      input.aiAgent.personality ? `Personality: ${input.aiAgent.personality}` : null,
      input.aiAgent.scene_prompt ? `Service scope: ${input.aiAgent.scene_prompt}` : null
    ].filter(Boolean);

    if (personaLines.length > 0) {
      sections.push(`Seat persona:\n${personaLines.join("\n")}`);
    }

    if (input.aiAgent.system_prompt) {
      sections.push(`Seat-specific instructions:\n${input.aiAgent.system_prompt}`);
    }
  }

  // Long-term memory & customer profile — who this customer is
  if (input.memoryContext) {
    sections.push(input.memoryContext);
  }

  // Short-term tool results — what was just fetched in this conversation.
  // Placed after memory so the LLM reads: identity → history → fresh data → task.
  if (input.recentSkillContext) {
    sections.push(input.recentSkillContext);
  }

  if (Array.isArray(input.candidateSkills) && input.candidateSkills.length > 0) {
    const candidateLines = input.candidateSkills.map((skill, index) => ([
      `${index + 1}. ${skill.name}`,
      skill.description ? `Summary: ${skill.description}` : null,
      skill.skillMarkdown ? `Skill package:\n${skill.skillMarkdown}` : null
    ].filter(Boolean).join("\n")));
    if (candidateLines.length > 0) {
      sections.push(`Candidate capabilities:\n${candidateLines.join("\n\n")}`);
    }
  } else {
    sections.push("No capability is currently suggested. Do not invent unavailable verification procedures or fake lookup requirements.");
  }

  return sections.join("\n\n");
}

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
      if (tools.length >= 5) return tools;
    }
  }

  return tools;
}

function buildClarificationReply(input: {
  plannerDecision: {
    clarificationQuestion: string | null;
  };
  selectedSkill: {
    name: string;
    inputSchema: Record<string, unknown>;
  };
}) {
  const explicitQuestion = input.plannerDecision.clarificationQuestion?.trim();
  if (explicitQuestion) return explicitQuestion;
  const required = Array.isArray(input.selectedSkill.inputSchema.required)
    ? input.selectedSkill.inputSchema.required.map((item) => String(item)).filter(Boolean)
    : [];
  if (required.length > 0) {
    return `请补充继续处理“${input.selectedSkill.name}”所需的信息：${required.join("、")}。`;
  }
  return `请补充继续处理“${input.selectedSkill.name}”所需的信息。`;
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
        description: "Customer-provided identifier such as order number, waybill, tracking number, or bill code."
      },
      query: {
        type: "string" as const,
        description: "The raw customer query or key lookup value."
      },
      trackingNumber: {
        type: "string" as const,
        description: "Tracking or waybill number if the customer provided one."
      },
      billCodes: {
        type: "string" as const,
        description: "Carrier bill code(s), comma-separated when multiple."
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
  // Pure long-digit sequences (8–20 digits) are treated as order/tracking IDs first;
  // only shorter numeric strings (up to 15 digits, possibly with leading +) that are
  // NOT already captured as order IDs are considered phone numbers.
  const rawOrderIds = [
    ...(text.match(/\b[A-Z]{1,6}-?\d{4,}\b/g) ?? []),  // alphanumeric codes: JT123456, CS-001
    ...(text.match(/\b\d{8,20}\b/g) ?? [])               // pure numeric tracking numbers
  ];
  const orderIds = [...new Set(rawOrderIds)];
  const orderIdSet = new Set(orderIds);
  const phones = (text.match(/\+?\d{8,15}/g) ?? []).filter((p) => !orderIdSet.has(p));
  return {
    orderIds,
    phones: [...new Set(phones)],
    addresses: text.includes("地址") || text.includes("alamat") || text.includes("address")
      ? [text.slice(0, 80)]
      : []
  };
}
