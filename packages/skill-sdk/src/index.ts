// ─── Skill context ────────────────────────────────────────────────────────────

export interface SkillMessage {
  role: "customer" | "agent" | "system" | "ai";
  content: string;
  timestamp: string;
  messageType?: string;
}

export interface SkillContext {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  /** Recent conversation messages (newest last) */
  messages: SkillMessage[];
  /** Parsed input parameters for this skill invocation */
  input: Record<string, unknown>;
  /** Tenant-specific skill configuration (API keys, endpoints, etc.) */
  config: Record<string, unknown>;
}

// ─── Skill result ─────────────────────────────────────────────────────────────

export interface SkillResult {
  success: boolean;
  /** Structured output data (order details, tracking info, etc.) */
  output: Record<string, unknown>;
  /** Human-readable result message to include in the AI response */
  message?: string;
  error?: string;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
}

// ─── Skill interface ──────────────────────────────────────────────────────────

export interface AISkill {
  /** Unique skill identifier, e.g. "order_query" */
  readonly name: string;
  /** One-line description shown in the skill marketplace */
  readonly description: string;
  readonly version: string;
  /** JSON Schema describing the expected `input` shape (optional but recommended) */
  inputSchema?: Record<string, unknown>;
  execute(context: SkillContext): Promise<SkillResult>;
}

// ─── Base skill ───────────────────────────────────────────────────────────────

export abstract class BaseSkill implements AISkill {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly version = "1.0.0";

  abstract execute(context: SkillContext): Promise<SkillResult>;

  protected success(output: Record<string, unknown>, message?: string): SkillResult {
    return { success: true, output, message };
  }

  protected failure(error: string, output: Record<string, unknown> = {}): SkillResult {
    return { success: false, output, error };
  }
}

// ─── Skill registry ───────────────────────────────────────────────────────────

export class SkillRegistry {
  private readonly skills = new Map<string, AISkill>();

  register(skill: AISkill): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): AISkill | undefined {
    return this.skills.get(name);
  }

  list(): AISkill[] {
    return [...this.skills.values()];
  }
}
