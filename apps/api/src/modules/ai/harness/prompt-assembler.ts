/**
 * 作用：按轨道与上下文分层组装主模型 system prompt。
 * 上游：orchestrator.service.ts
 * 下游：主模型调用、后续 answer-composer.service.ts
 * 协作对象：context-pipeline.ts、semantic-router.service.ts、agent-skills/contracts.ts
 * 不负责：不做知识检索，不做工具执行，不做输出解析。
 * 变更注意：知识轨道默认不注入 skill docs，避免继续把工具世界污染到 FAQ 场景。
 */

import type { HarnessPromptLayer } from "./types.js";
import type { TenantSkillDefinition } from "../../agent-skills/contracts.js";

// ─── Base prompt: always present ────────────────────────────────────────────

const BASE_BEHAVIORAL_RULES = `You are a professional AI assistant for customer service.

## Core rules
- Always reply in the same language the customer uses.
- Be concise, helpful, and empathetic.

## Knowledge and tools
- A BUSINESS KNOWLEDGE section may appear in this prompt — treat it as your primary reference.
  Always read it before answering questions about services, policies, pricing, or procedures.
- You may also call searchKnowledge to look up additional information not yet in context.
- For operational actions (order lookups, ticket creation, etc.) call the appropriate skill tool.
- Never fabricate facts. If you are uncertain, say so.

## Greeting and opener messages
- If the customer's message is a greeting or an opener without a specific question
  ("你好", "hello", "我想请问", "I have a question", "hi", etc.), respond warmly and
  ask them to share their question. Do NOT call requestHumanHandoff for an opener —
  the customer has not asked anything yet.
- Only attempt to answer or escalate AFTER the customer has stated a concrete question.

## What to do when you cannot answer
- If the customer has stated a concrete question AND the BUSINESS KNOWLEDGE section does
  not cover it AND searchKnowledge returns no relevant results, do NOT silently give up.
- Reply honestly that you do not have that specific information, then call
  requestHumanHandoff so a human agent can assist.
  Example: "I'm sorry, I don't have the details for that. Let me connect you with our team."
- NEVER return an empty response or action="defer" for an unanswered concrete question.
  The customer must always receive either an answer, a clarifying question, or a handoff notice.

## Self-correction when the customer says the answer was wrong
- If a [CORRECTION SIGNAL] section appears in this prompt, the customer indicated that your
  PREVIOUS answer was incorrect or unhelpful.
- Do NOT repeat the same answer. Do NOT cite the same knowledge entries from working memory.
- Instead: call searchKnowledge with DIFFERENT, more specific search terms to find new content.
- If new content still does not help, honestly admit you cannot resolve this and call
  requestHumanHandoff immediately — the customer should not be stuck in an answer loop.

## Handoff rules
- When the customer explicitly requests a human agent, immediately call requestHumanHandoff.
- Never explain agent availability, queue position, or wait times — you have no access to
  that real-time information.
- After calling requestHumanHandoff do not add further reply text; the system sends the notice.

## Loop discipline
- At each step: either call a tool OR send a reply to the customer. Never do both in one turn.
- Avoid repeating the same tool call with identical arguments unless new information appears.
- Never ask the customer for information not required by a tool's contract.`;

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PromptAssemblerInput {
  layers: HarnessPromptLayer;
  routeContext: string | null;
  customerIntelligence: string | null;
  /**
   * Injected when the user's current message signals dissatisfaction with the previous answer.
   * Instructs the LLM to try different sources and not repeat the same content.
   */
  correctionContext: string | null;
  knowledgeContext: string | null;
  factContext: string | null;
  candidateSkills: TenantSkillDefinition[];
  responseContract: string;
}

/**
 * Assemble the full system prompt from all harness layers.
 *
 * Returns a single string optimized for the LLM's context window:
 * - Structured with clear section headers
 * - Customer context placed before facts (identity → history → data → task)
 * - Skill documentation only for selected candidates
 * - Response contract last (closest to generation point)
 */
export function assembleSystemPrompt(input: PromptAssemblerInput): string {
  const sections: string[] = [];

  // Layer 1: Base rules
  sections.push(input.layers.base || BASE_BEHAVIORAL_RULES);

  // Layer 2: Seat persona + instructions
  if (input.layers.seatPersona || input.layers.seatInstructions) {
    const personaSection: string[] = [];
    if (input.layers.seatPersona) {
      personaSection.push(`Seat persona:\n${input.layers.seatPersona}`);
    }
    if (input.layers.seatInstructions) {
      personaSection.push(`Seat-specific instructions:\n${input.layers.seatInstructions}`);
    }
    sections.push(personaSection.join("\n\n"));
  }

  // Layer 2b: Scene constraints (if different from seat)
  if (input.layers.sceneConstraints) {
    sections.push(`Service scope:\n${input.layers.sceneConstraints}`);
  }

  // Layer 2c: Tenant custom instructions
  if (input.layers.tenantOverrides) {
    sections.push(`Tenant instructions:\n${input.layers.tenantOverrides}`);
  }

  if (input.routeContext) {
    sections.push(`Routing decision:\n${input.routeContext}`);
  }

  // Layer 3: Customer intelligence (who this customer is)
  if (input.customerIntelligence) {
    sections.push(input.customerIntelligence);
  }

  // Layer 3b: Correction signal — must appear BEFORE knowledge so LLM sees it first
  if (input.correctionContext) {
    sections.push(input.correctionContext);
  }

  if (input.knowledgeContext) {
    sections.push(input.knowledgeContext);
  }

  // Layer 4: Fact context (what we know right now)
  if (input.factContext) {
    sections.push(input.factContext);
  }

  // Layer 5: Candidate skill documentation
  if (input.candidateSkills.length > 0) {
    const skillDocs = input.candidateSkills.map((skill, index) => {
      const parts = [
        `${index + 1}. ${skill.name}`,
        skill.description ? `Summary: ${skill.description}` : null,
        skill.skillMarkdown ? `Skill package:\n${skill.skillMarkdown}` : null
      ].filter(Boolean);
      return parts.join("\n");
    });
    sections.push(`Candidate capabilities:\n${skillDocs.join("\n\n")}`);
  } else {
    sections.push(
      "No capability is currently suggested. Do not invent unavailable verification procedures or fake lookup requirements."
    );
  }

  // Layer 6: Response contract (JSON format)
  sections.push(input.responseContract);

  return sections.join("\n\n");
}

/**
 * Build the prompt layers from the AI agent configuration.
 * This extracts structured data from the DB row into the harness format.
 */
export function buildPromptLayers(input: {
  aiAgent: {
    name: string;
    role_label: string | null;
    personality: string | null;
    scene_prompt: string | null;
    system_prompt: string | null;
  } | null;
  tenantInstructions?: string | null;
}): HarnessPromptLayer {
  const agent = input.aiAgent;

  let seatPersona: string | null = null;
  if (agent) {
    const personaLines = [
      agent.name ? `AI seat: ${agent.name}` : null,
      agent.role_label ? `Role: ${agent.role_label}` : null,
      agent.personality ? `Personality: ${agent.personality}` : null
    ].filter(Boolean);
    seatPersona = personaLines.length > 0 ? personaLines.join("\n") : null;
  }

  return {
    base: BASE_BEHAVIORAL_RULES,
    seatPersona,
    seatInstructions: agent?.system_prompt ?? null,
    sceneConstraints: agent?.scene_prompt ?? null,
    tenantOverrides: input.tenantInstructions ?? null
  };
}
