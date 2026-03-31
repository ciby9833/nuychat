import type { AIMessage, AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";

import type { CapabilitySuggestionResult, TenantSkillDefinition } from "./contracts.js";
import { buildSkillPlannerCatalog } from "./skill-definition.service.js";

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

export async function suggestCapabilities(input: {
  provider: AIProvider;
  model: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  skills: TenantSkillDefinition[];
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
    content: result.content
  };
}
