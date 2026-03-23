import type { Knex } from "knex";
import type { AIMessage, AIProvider, AIToolCall, AIToolDefinition } from "../../../../../packages/ai-sdk/src/index.ts";
import { skillRegistry, type SkillContext } from "../skills/skill.registry.js";
import {
  evaluateSkillExecutionGate,
  getBoundRuntimePolicies,
  recordSkillInvocation
} from "../skills/runtime-governance.service.js";
import { resolveTenantAISettings } from "../ai/provider-config.service.js";
import {
  buildCustomerIntelligenceContext,
  appendWorkingMemory,
  upsertConversationInsight
} from "../memory/customer-intelligence.service.js";
import {
  assertTenantAIBudgetAllowsUsage,
  recordAIUsage
} from "../ai/usage-meter.service.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  aiAgentId?: string | null;
  moduleId?: string | null;
  skillGroupId?: string | null;
  actorType?: "ai" | "agent" | "workflow";
  requesterId?: string | null;
  preferredSkillNames?: string[];
}

export interface OrchestratorResult {
  /** Generated reply text; null = no AI response, defer to human */
  response: string | null;
  intent: string;
  sentiment: "positive" | "neutral" | "negative" | "angry";
  shouldHandoff: boolean;
  handoffReason?: string;
  tokensUsed: number;
  confidence: number;
  skillsInvoked: string[];
  skillsBlocked?: Array<{ name: string; reason: string }>;
}

type MsgRow = {
  direction: string;
  content: { text?: string };
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
- Search the knowledge base (search_knowledge_base) when answering questions about policies, FAQs, shipping, or returns.
- If the customer is angry, repeatedly unsatisfied, or requests a human agent, respond ONLY with:
  HANDOFF_REQUIRED: <one-sentence reason>
  Do not add anything else when requesting a handoff.`;

// ─── Service ──────────────────────────────────────────────────────────────────

export class OrchestratorService {
  async run(db: Knex | Knex.Transaction, input: OrchestratorInput): Promise<OrchestratorResult> {
    const aiSettings = await resolveTenantAISettings(db, input.tenantId);
    if (!aiSettings) return noAiResult("no_ai_provider");
    const aiAgent = input.aiAgentId
      ? await db<AIAgentRow>("tenant_ai_agents")
        .where({
          tenant_id: input.tenantId,
          ai_agent_id: input.aiAgentId,
          status: "active"
        })
        .select("ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt")
        .first()
      : null;

    const rows = await db<MsgRow>("messages")
      .select("direction", "content")
      .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
      .orderBy("created_at", "desc")
      .limit(20);

    const messages = [...rows].reverse();
    const chatHistory = buildChatHistory(messages);

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
    const preferredSkills = normalizePreferredSkills(input.preferredSkillNames ?? []);
    const tools = skillRegistry
      .toOpenAITools()
      .filter((tool) => runtimePolicy.has(tool.function.name))
      .filter((tool) => preferredSkills.length === 0 || preferredSkills.includes(tool.function.name));
    const skillsInvoked: string[] = [];
    const skillsBlocked: Array<{ name: string; reason: string }> = [];
    const skillCtx: SkillContext = { tenantId: input.tenantId, db };

    // ── Inject memory context into system prompt ──────────────────────────────
    const memoryContext = await buildCustomerIntelligenceContext(db, input.tenantId, input.conversationId, input.customerId);
    const systemPrompt = buildSystemPrompt({
      basePrompt: SYSTEM_PROMPT_BASE,
      memoryContext,
      aiAgent
    });

    try {
      const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
      if (!budgetGate.allowed) {
        return noAiResult(budgetGate.reason ?? "ai_budget_blocked");
      }

      // ── Turn 1: may produce tool_calls ─────────────────────────────────────
      const turn1 = await callLLM(
        aiSettings.provider,
        model,
        [
        { role: "system", content: systemPrompt },
        ...chatHistory
        ],
        tools as unknown as AIToolDefinition[],
        aiSettings.temperature,
        aiSettings.maxTokens
      );

      let finalContent = turn1.content;
      let tokensUsed = turn1.tokensUsed;
      let inputTokens = turn1.inputTokens;
      let outputTokens = turn1.outputTokens;

      // ── Tool execution loop ─────────────────────────────────────────────────
      if (turn1.toolCalls && turn1.toolCalls.length > 0) {
        const round2Messages: AIMessage[] = [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          { role: "assistant", content: turn1.content, toolCalls: turn1.toolCalls }
        ];

        for (const toolCall of turn1.toolCalls) {
          const skill = skillRegistry.get(toolCall.function.name);
          let toolResult: string;
          if (skill) {
            const args = safeParseJson(toolCall.function.arguments);
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

            if (gate.action === "allow") {
              const startedAt = Date.now();
              skillsInvoked.push(toolCall.function.name);
              const result =
                skill.executionMode === "async"
                  ? await scheduleAsyncSkillExecution({
                      tenantId: input.tenantId,
                      conversationId: input.conversationId,
                      customerId: input.customerId,
                      skillName: toolCall.function.name,
                      args
                    })
                  : await skill.execute(args, skillCtx);
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
            } else {
              skillsBlocked.push({ name: toolCall.function.name, reason: gate.reason });
              await recordSkillInvocation(db, {
                tenantId: input.tenantId,
                conversationId: input.conversationId,
                skillName: toolCall.function.name,
                actorType,
                args,
                decision: "blocked",
                denyReason: gate.reason,
                result: { message: gate.detail },
                policyMap: runtimePolicy
              });
              toolResult = JSON.stringify({
                error: gate.reason,
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
          round2Messages.push({
            role: "tool",
            content: toolResult,
            toolCallId: toolCall.id
          });
        }

        // ── Turn 2: final response after tool results ─────────────────────────
        const turn2 = await callLLM(
          aiSettings.provider,
          model,
          round2Messages,
          [],
          aiSettings.temperature,
          aiSettings.maxTokens
        );
        finalContent = turn2.content;
        tokensUsed += turn2.tokensUsed;
        inputTokens += turn2.inputTokens;
        outputTokens += turn2.outputTokens;
      }

      await recordAIUsage(db, {
        tenantId: input.tenantId,
        provider: providerName,
        model,
        feature: "orchestrator",
        inputTokens,
        outputTokens,
        requestCount: turn1.toolCalls && turn1.toolCalls.length > 0 ? 2 : 1,
        metadata: {
          conversationId: input.conversationId,
          aiAgentId: input.aiAgentId ?? null,
          actorType,
          moduleId: input.moduleId ?? null,
          skillGroupId: input.skillGroupId ?? null,
          skillsInvoked
        }
      });

      // ── Parse response ──────────────────────────────────────────────────────
      const intent = finalContent.startsWith("HANDOFF_REQUIRED:")
        ? "handoff_request"
        : classifyIntent(chatHistory);
      const sentiment = detectSentiment(chatHistory);

      // ── Update working memory (fire-and-forget) ───────────────────────────
      const lastUserMsg = chatHistory.filter((m) => m.role === "user").at(-1);
      if (lastUserMsg && !finalContent.startsWith("HANDOFF_REQUIRED:")) {
        const now = Date.now();
        appendWorkingMemory(input.conversationId, [
          { role: "user", content: lastUserMsg.content, ts: now },
          { role: "assistant", content: finalContent, ts: now + 1 }
        ]).catch(() => null);

        // Update conversation summary in PG (fire-and-forget)
        const entities = extractEntitiesFromText(
          chatHistory.map((m) => m.content).join(" ")
        );
        upsertConversationInsight(db, {
          tenantId: input.tenantId,
          customerId: input.customerId,
          conversationId: input.conversationId,
          data: {
            summary: finalContent.slice(0, 400),
            lastIntent: intent,
            lastSentiment: sentiment,
            messageCount: chatHistory.length,
            keyEntities: entities
          }
        }).catch(() => null);
      }

      void scheduleExecutionArchive({
        tenantId: input.tenantId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        aiAgent,
        memoryContext,
        finalContent,
        intent,
        sentiment,
        tokensUsed,
        skillsInvoked,
        skillsBlocked,
        toolCalls: turn1.toolCalls ?? [],
        handoffReason: finalContent.startsWith("HANDOFF_REQUIRED:")
          ? finalContent.replace("HANDOFF_REQUIRED:", "").trim()
          : null
      }).catch(() => null);

      if (finalContent.startsWith("HANDOFF_REQUIRED:")) {
        const reason = finalContent.replace("HANDOFF_REQUIRED:", "").trim();
        return {
          response: null,
          intent,
          sentiment,
          shouldHandoff: true,
          handoffReason: reason,
          tokensUsed,
          confidence: 0.9,
          skillsInvoked,
          skillsBlocked
        };
      }

      return {
        response: finalContent,
        intent,
        sentiment,
        shouldHandoff: false,
        tokensUsed,
        confidence: 0.85,
        skillsInvoked,
        skillsBlocked
      };
    } catch (error) {
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
  finalContent: string;
  intent: string;
  sentiment: string;
  tokensUsed: number;
  skillsInvoked: string[];
  skillsBlocked: Array<{ name: string; reason: string }>;
  toolCalls: AIToolCall[];
  handoffReason: string | null;
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
        handoffReason: input.handoffReason
      }
    }
  });
}

async function scheduleAsyncSkillExecution(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  skillName: string;
  args: Record<string, unknown>;
}) {
  const task = mapAsyncSkillToTask(input.skillName, input.args);
  if (!task) {
    return {
      queued: false,
      error: "async_skill_mapping_missing",
      message: `Skill ${input.skillName} is marked async but no task mapping is configured.`
    };
  }

  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    taskType: task.taskType,
    title: task.title,
    source: "ai",
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

function mapAsyncSkillToTask(skillName: string, args: Record<string, unknown>) {
  if (skillName === "lookup_order") {
    const orderId = typeof args.orderId === "string" ? args.orderId.trim() : "";
    return {
      taskType: "lookup_order_external",
      title: `Order lookup ${orderId || "request"}`,
      message: orderId
        ? `Order lookup for ${orderId} has been queued. Tell the customer you are checking the order and will update them shortly.`
        : "Order lookup has been queued. Tell the customer you are checking the order and will update them shortly.",
      payload: { orderId }
    };
  }

  if (skillName === "track_shipment") {
    const trackingNumber = typeof args.trackingNumber === "string" ? args.trackingNumber.trim() : "";
    const carrier = typeof args.carrier === "string" && args.carrier.trim() ? args.carrier.trim() : "JNE";
    return {
      taskType: "track_shipment_external",
      title: `Shipment tracking ${trackingNumber || "request"}`,
      message: trackingNumber
        ? `Shipment tracking for ${trackingNumber} has been queued. Tell the customer you are checking the shipment and will update them shortly.`
        : "Shipment tracking has been queued. Tell the customer you are checking the shipment and will update them shortly.",
      payload: { trackingNumber, carrier }
    };
  }

  return null;
}

function buildSystemPrompt(input: {
  basePrompt: string;
  memoryContext: string | null;
  aiAgent: AIAgentRow | null | undefined;
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

  if (input.memoryContext) {
    sections.push(input.memoryContext);
  }

  return sections.join("\n\n");
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
  maxTokens: number
): Promise<LLMCallResult> {
  const result = await provider.complete({
    model,
    messages,
    tools,
    toolChoice: tools.length > 0 ? "auto" : "none",
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
    .filter((r) => r.content?.text)
    .map((r) => ({
      role: (r.direction === "outbound" ? "assistant" : "user") as "user" | "assistant",
      content: r.content.text!
    }));
}

function classifyIntent(history: { role: string; content: string }[]): string {
  const text = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  if (text.match(/order|pesanan|订单|注文|ORD/i)) return "order_inquiry";
  if (text.match(/refund|返款|退款|pengembalian/i)) return "refund_request";
  if (text.match(/delivery|pengiriman|配送|配达|track|resi|awb/i)) return "delivery_inquiry";
  if (text.match(/cancel|batal|取消|キャンセル/i)) return "cancellation";
  if (text.match(/complaint|keluhan|投诉|クレーム|complain/i)) return "complaint";
  if (text.match(/payment|bayar|付款|支払|transfer/i)) return "payment_inquiry";
  return "general_inquiry";
}

function detectSentiment(history: { role: string; content: string }[]): OrchestratorResult["sentiment"] {
  const text = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  const angryPhrases = [
    "marah", "kecewa", "jelek", "buruk", "complaint", "penipuan", "fraud",
    "退款", "投诉", "生气", "差评", "angry", "terrible", "worst", "scam",
    "tidak puas", "tidak beres", "bohong", "bohongin"
  ];
  if (angryPhrases.some((kw) => text.includes(kw))) return "angry";

  const positivePhrases = ["terima kasih", "thank", "thanks", "感谢", "ありがとう", "mantap", "bagus", "good"];
  if (positivePhrases.some((kw) => text.includes(kw))) return "positive";

  return "neutral";
}

function noAiResult(reason: string): OrchestratorResult {
  return {
    response: null,
    intent: "unknown",
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

function extractEntitiesFromText(text: string) {
  return {
    orderIds: text.match(/\b[A-Z]{2,5}\d{3,}\b/g) ?? [],
    phones: text.match(/\+?\d{8,15}/g) ?? [],
    addresses: text.includes("地址") || text.includes("alamat") || text.includes("address")
      ? [text.slice(0, 80)]
      : []
  };
}
