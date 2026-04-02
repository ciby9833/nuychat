/**
 * Harness Engineering — Prompt Assembler
 *
 * Assembles the system prompt from layered sources following the
 * progressive disclosure pattern:
 *
 *   Layer 1: Base behavioral rules (always present, ~200 tokens)
 *   Layer 2: Seat persona + instructions (if AI agent configured)
 *   Layer 3: Customer intelligence (long-term memory + profile)
 *   Layer 4: Fact context (verified facts, task states)
 *   Layer 5: Skill documentation (only for candidate skills)
 *   Layer 6: Response contract (JSON format instructions)
 *
 * Design principle: each layer adds context only when relevant,
 * minimizing prompt size while maximizing information density.
 *
 * Reference: Claude's system prompt best practices — "be specific,
 * give examples, use XML tags for structure".
 */

import type { HarnessPromptLayer } from "./types.js";
import type { TenantSkillDefinition } from "../../agent-skills/contracts.js";

// ─── Base prompt: always present ────────────────────────────────────────────

const BASE_BEHAVIORAL_RULES = `You are a professional AI assistant for customer service.

Rules:
- Always reply in the same language the customer uses.
- Be concise, helpful, and empathetic.
- When you need specific information to answer the customer, use the tools provided — do not guess or fabricate data.
- Never ask for personal details or extra requirements unless they are explicitly required by the selected skill contract or returned by a tool result/error.
- At each step, either call tools or answer the user.
- If you need more information, call tools.
- If you already have enough information, answer directly.
- Avoid repeating the same tool call with the same arguments unless new information appears.`;

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PromptAssemblerInput {
  layers: HarnessPromptLayer;
  customerIntelligence: string | null;
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

  // Layer 3: Customer intelligence (who this customer is)
  if (input.customerIntelligence) {
    sections.push(input.customerIntelligence);
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
