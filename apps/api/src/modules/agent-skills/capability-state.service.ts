import type { Knex } from "knex";

type CapabilityStateRow = {
  state_id: string;
  capability_id: string;
  status: string;
  clarification_question: string | null;
  missing_inputs: unknown;
  resolved_inputs: unknown;
  last_user_message: string | null;
};

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export type ConversationCapabilityState = {
  stateId: string;
  capabilityId: string;
  status: string;
  clarificationQuestion: string | null;
  missingInputs: string[];
  resolvedInputs: Record<string, unknown>;
  lastUserMessage: string | null;
};

function normalizeJsonObject(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch {
      return JSON.stringify({});
    }
  }
  return JSON.stringify({});
}

function normalizeJsonStringArray(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => String(item)).filter(Boolean));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.map((item) => String(item)).filter(Boolean));
      }
    } catch {
      return JSON.stringify([]);
    }
  }
  return JSON.stringify([]);
}

export async function getConversationCapabilityState(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
  }
): Promise<ConversationCapabilityState | null> {
  const row = await db<CapabilityStateRow>("conversation_capability_states")
    .where({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId
    } as any)
    .first();

  if (!row) return null;
  return {
    stateId: row.state_id,
    capabilityId: row.capability_id,
    status: row.status,
    clarificationQuestion: row.clarification_question,
    missingInputs: parseStringArray(row.missing_inputs),
    resolvedInputs: parseObject(row.resolved_inputs),
    lastUserMessage: row.last_user_message
  };
}

export async function upsertConversationCapabilityState(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    customerId?: string | null;
    capabilityId: string;
    status: "clarifying" | "selected" | "running";
    clarificationQuestion?: string | null;
    missingInputs?: string[];
    resolvedInputs?: Record<string, unknown>;
    lastUserMessage?: string | null;
  }
) {
  const missingInputsJson = normalizeJsonStringArray(input.missingInputs ?? []);
  const resolvedInputsJson = normalizeJsonObject(input.resolvedInputs ?? {});

  await db("conversation_capability_states")
    .insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      customer_id: input.customerId ?? null,
      capability_id: input.capabilityId,
      status: input.status,
      clarification_question: input.clarificationQuestion ?? null,
      missing_inputs: missingInputsJson,
      resolved_inputs: resolvedInputsJson,
      last_user_message: input.lastUserMessage ?? null
    })
    .onConflict(["conversation_id"])
    .merge({
      customer_id: input.customerId ?? null,
      capability_id: input.capabilityId,
      status: input.status,
      clarification_question: input.clarificationQuestion ?? null,
      missing_inputs: missingInputsJson,
      resolved_inputs: resolvedInputsJson,
      last_user_message: input.lastUserMessage ?? null,
      updated_at: db.fn.now()
    });
}

export async function clearConversationCapabilityState(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
  }
) {
  await db("conversation_capability_states")
    .where({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId
    })
    .del();
}
