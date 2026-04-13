/**
 * 作用：根据用户请求从租户能力目录中建议候选 skills，当前服务主要用于 action track 的能力预选。
 * 上游：orchestrator.service.ts
 * 下游：planner-guard.service.ts、后续 skill-hydration.service.ts
 * 协作对象：skill-definition.service.ts、usage-meter.service.ts
 * 不负责：不决定知识轨道，不执行脚本，不做最终回复生成。
 * 变更注意：第一阶段后 knowledge/clarification 轨道不应再依赖本服务；后续应从“选技能”演进为“选动作域”。
 */

import type { AIMessage, AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";
import type { Knex } from "knex";
import type { ProviderName } from "../../../../../packages/ai-sdk/src/index.js";

import type { CapabilitySuggestionResult, TenantSkillDefinition } from "./contracts.js";
import { buildSkillPlannerCatalog } from "./skill-definition.service.js";
import { recordAIUsage } from "../ai/usage-meter.service.js";

// ─── Smart Planner Threshold ────────────────────────────────────────────────
// When available skills ≤ this number, skip LLM planner and use all as candidates.
// The main LLM (with tool definitions + skill markdown) is smart enough to pick
// the right tool from a small set — adding a planner call is pure token waste.
//
// Reference: OpenAI function calling best practices recommend ≤ 20 tools for
// reliable selection; Claude handles 5-10 tools natively without routing.
const SMART_PLANNER_THRESHOLD = 5;

const CAPABILITY_SUGGESTER_CONTRACT = `Return valid JSON only.

JSON shape:
{
  "candidates": [
    {
      "skillSlug": "<skill slug>",
      "reason": "<brief reason>",
      "confidence": 0.0
    }
  ],
  "requiresClarification": false,
  "clarificationQuestion": "<question or empty string>"
}

Rules:
- Suggest up to 5 candidate skills, ordered from strongest to weakest.
- Prefer a small, precise candidate set over a broad one.
- Do not invent skills that are not in the provided catalog.
- Include a skill when it may help answer the request, even if another skill may also be needed later.
- Use requiresClarification=true only when the customer must provide missing information before any candidate can run.
- Keep reasons short and concrete.`;

type PlannerCallResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
};

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function clampConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

// ─── Smart Planning: 3-tier strategy ────────────────────────────────────────
//
//   Tier 1 (≤ 5 skills): Use ALL as candidates. No LLM planner call.
//           The main agentic LLM sees tool definitions + skill markdown and
//           picks the right one. This is how Claude/GPT-4o work natively.
//
//   Tier 2 (> 5, rule-filtered ≤ 5): Rule-based pre-filter using customer
//           message keywords + skill triggerHints/name/description. If the
//           filtered set is ≤ 5, use them directly.
//
//   Tier 3 (rule-filtered > 5): Call LLM planner to select from the full
//           catalog — only when the rule filter can't narrow it down.
//
// This saves ~3000 tokens per request for most real-world tenants (which
// typically have 1-5 active skills).

export async function smartPlanCapabilities(input: {
  provider: AIProvider;
  providerName?: ProviderName;
  model: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  skills: TenantSkillDefinition[];
  db?: Knex | Knex.Transaction;
  tenantId?: string;
}): Promise<CapabilitySuggestionResult & { plannerStrategy: "direct" | "rule_filter" | "llm_planner" }> {
  if (input.skills.length === 0) {
    return {
      candidates: [],
      requiresClarification: false,
      clarificationQuestion: null,
      plannerStrategy: "direct"
    };
  }

  // Tier 1: Small skill set — use all directly
  if (input.skills.length <= SMART_PLANNER_THRESHOLD) {
    return {
      candidates: input.skills.map((skill) => ({
        skillSlug: skill.slug,
        reason: "direct_candidate",
        confidence: 0.8
      })),
      requiresClarification: false,
      clarificationQuestion: null,
      plannerStrategy: "direct"
    };
  }

  // Tier 2: Rule-based pre-filter by keyword relevance
  const customerText = extractCustomerText(input.messages);
  const scored = input.skills.map((skill) => ({
    skill,
    score: computeKeywordRelevance(skill, customerText)
  }));
  scored.sort((a, b) => b.score - a.score);
  const filtered = scored.filter((item) => item.score > 0).slice(0, SMART_PLANNER_THRESHOLD);

  if (filtered.length > 0 && filtered.length <= SMART_PLANNER_THRESHOLD) {
    return {
      candidates: filtered.map((item) => ({
        skillSlug: item.skill.slug,
        reason: "keyword_match",
        confidence: Math.min(0.85, 0.5 + item.score * 0.1)
      })),
      requiresClarification: false,
      clarificationQuestion: null,
      plannerStrategy: "rule_filter"
    };
  }

  // Tier 3: Too many candidates — call LLM planner
  const llmResult = await suggestCapabilities({
    ...input,
    db: input.db,
    tenantId: input.tenantId,
    providerName: input.providerName
  });
  return {
    ...llmResult,
    plannerStrategy: "llm_planner"
  };
}

/**
 * Compute keyword relevance score for a skill against customer text.
 * Uses skill name, description, slug, and triggerHints to match.
 */
function computeKeywordRelevance(skill: TenantSkillDefinition, customerText: string): number {
  if (!customerText) return 0;

  const text = customerText.toLowerCase();
  let score = 0;

  // Match against skill name (strongest signal)
  const nameWords = (skill.name ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  for (const word of nameWords) {
    if (text.includes(word)) score += 2;
  }

  // Match against skill description
  const descWords = (skill.description ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  for (const word of descWords) {
    if (text.includes(word)) score += 1;
  }

  // Match against skill slug (e.g., "order-lookup" → "order", "lookup")
  const slugParts = skill.slug.toLowerCase().split(/[-_]/).filter((w) => w.length >= 3);
  for (const part of slugParts) {
    if (text.includes(part)) score += 2;
  }

  // Match against triggerHints keywords (if configured by tenant)
  const hints = skill.triggerHints as Record<string, unknown> | null;
  if (hints) {
    const keywords = Array.isArray(hints.keywords)
      ? hints.keywords.filter((k): k is string => typeof k === "string")
      : [];
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score += 3;
    }
    // Also support patterns like { intents: ["order_query", "track_shipment"] }
    const intents = Array.isArray(hints.intents)
      ? hints.intents.filter((i): i is string => typeof i === "string")
      : [];
    for (const intent of intents) {
      const intentWords = intent.toLowerCase().split(/[-_]/).filter((w) => w.length >= 3);
      for (const word of intentWords) {
        if (text.includes(word)) score += 2;
      }
    }
  }

  return score;
}

/**
 * Extract the last 2 customer messages as a single text for keyword matching.
 */
function extractCustomerText(messages: AIMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join(" ");
}

// ─── LLM Planner (Tier 3 only) ─────────────────────────────────────────────

export async function suggestCapabilities(input: {
  provider: AIProvider;
  providerName?: ProviderName;
  model: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  skills: TenantSkillDefinition[];
  db?: Knex | Knex.Transaction;
  tenantId?: string;
}): Promise<CapabilitySuggestionResult> {
  if (input.skills.length === 0) {
    return {
      candidates: [],
      requiresClarification: false,
      clarificationQuestion: null
    };
  }

  const skillCatalog = buildSkillPlannerCatalog(input.skills);
  const plannerPrompt = [
    "You are a capability suggester. Suggest a small set of candidate tenant skills for this customer request.",
    "",
    "Skill catalog:",
    JSON.stringify(skillCatalog, null, 2),
    "",
    CAPABILITY_SUGGESTER_CONTRACT
  ].join("\n");

  const result = await callPlannerLLM(
    input.provider,
    input.model,
    [
      { role: "system", content: plannerPrompt },
      ...input.messages
    ],
    input.temperature,
    Math.min(input.maxTokens, 900)
  );

  // Record usage when db + tenantId are available (always from orchestrator path)
  if (input.db && input.tenantId && input.providerName) {
    await recordAIUsage(input.db, {
      tenantId: input.tenantId,
      provider: input.providerName,
      model: input.model,
      feature: "skill_planner",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { skillCount: input.skills.length }
    });
  }

  const parsed = safeParseJson(result.content);
  const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const seen = new Set<string>();
  const candidates = candidatesRaw.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const skillSlug = typeof record.skillSlug === "string" && record.skillSlug.trim()
      ? record.skillSlug.trim()
      : "";
    if (!skillSlug || seen.has(skillSlug)) return [];
    seen.add(skillSlug);
    return [{
      skillSlug,
      reason: typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim().slice(0, 240)
        : "planner_no_reason",
      confidence: clampConfidence(record.confidence)
    }];
  }).slice(0, 5);

  return {
    candidates,
    requiresClarification: Boolean(parsed.requiresClarification),
    clarificationQuestion: typeof parsed.clarificationQuestion === "string" && parsed.clarificationQuestion.trim()
      ? parsed.clarificationQuestion.trim().slice(0, 240)
      : null
  };
}

async function callPlannerLLM(
  provider: AIProvider,
  model: string,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number
): Promise<PlannerCallResult> {
  const result = await provider.complete({
    model,
    messages,
    tools: [],
    toolChoice: "none",
    responseFormat: "json_object",
    temperature,
    maxTokens
  });

  return {
    content: result.content,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  };
}
