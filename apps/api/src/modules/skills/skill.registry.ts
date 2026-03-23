import type { Knex } from "knex";

// ─── Skill definition (internal API) ─────────────────────────────────────────

export interface SkillParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
}

/** Context passed to every skill at execution time */
export interface SkillContext {
  tenantId: string;
  db: Knex | Knex.Transaction;
}

export interface SkillDef {
  name: string;
  description: string;
  executionMode?: "sync" | "async";
  parameters: {
    type: "object";
    properties: Record<string, SkillParameter>;
    required?: string[];
  };
  execute(input: Record<string, unknown>, ctx: SkillContext): Promise<Record<string, unknown>>;
}

// ─── OpenAI tool shape ────────────────────────────────────────────────────────

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: SkillDef["parameters"];
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDef>();

  register(skill: SkillDef): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillDef | undefined {
    return this.skills.get(name);
  }

  list(): SkillDef[] {
    return [...this.skills.values()];
  }

  /** Convert all registered skills to the OpenAI tools array format */
  toOpenAITools(): OpenAITool[] {
    return this.list().map((skill) => ({
      type: "function" as const,
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters
      }
    }));
  }
}

export const skillRegistry = new SkillRegistry();
