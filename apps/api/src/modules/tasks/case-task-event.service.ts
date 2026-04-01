/**
 * Case Task Event Service
 *
 * Append-only audit log for case_task state changes.
 * Replaces the old ticket_events functionality (dropped in migration 077).
 *
 * Events are written on: task creation, status change, priority change,
 * assignment, comment, and AI auto-completion.
 */

import type { Knex } from "knex";

export type CaseTaskEventType =
  | "created"
  | "status_changed"
  | "priority_changed"
  | "assigned"
  | "unassigned"
  | "comment_added"
  | "ai_completed";

export interface CaseTaskEventInput {
  tenantId: string;
  taskId: string;
  eventType: CaseTaskEventType;
  fromValue?: string | null;
  toValue?: string | null;
  actorType: "agent" | "admin" | "ai" | "system";
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a single case_task event.
 */
export async function recordCaseTaskEvent(
  trx: Knex | Knex.Transaction,
  input: CaseTaskEventInput
): Promise<void> {
  await trx("case_task_events").insert({
    tenant_id: input.tenantId,
    task_id: input.taskId,
    event_type: input.eventType,
    from_value: input.fromValue ?? null,
    to_value: input.toValue ?? null,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    metadata: JSON.stringify(input.metadata ?? {})
  });
}

/**
 * Record multiple events in a batch (e.g., when a patch changes status + priority).
 */
export async function recordCaseTaskEvents(
  trx: Knex | Knex.Transaction,
  inputs: CaseTaskEventInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  await trx("case_task_events").insert(
    inputs.map((input) => ({
      tenant_id: input.tenantId,
      task_id: input.taskId,
      event_type: input.eventType,
      from_value: input.fromValue ?? null,
      to_value: input.toValue ?? null,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      metadata: JSON.stringify(input.metadata ?? {})
    }))
  );
}

/**
 * Fetch recent events for a task (for Copilot / AI context).
 */
export async function fetchTaskEvents(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  taskId: string,
  limit = 20
): Promise<Array<{
  eventId: string;
  eventType: CaseTaskEventType;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}>> {
  const rows = await trx("case_task_events")
    .where({ tenant_id: tenantId, task_id: taskId })
    .orderBy("created_at", "desc")
    .limit(limit)
    .select("event_id", "event_type", "from_value", "to_value", "actor_type", "actor_id", "metadata", "created_at");

  return rows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type as CaseTaskEventType,
    fromValue: r.from_value,
    toValue: r.to_value,
    actorType: r.actor_type,
    actorId: r.actor_id,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata ?? {}),
    createdAt: new Date(r.created_at).toISOString()
  }));
}
