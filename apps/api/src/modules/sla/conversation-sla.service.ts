import { db } from "../../infra/db/client.js";
import { conversationTimeoutQueue } from "../../infra/queue/queues.js";

export type FollowUpMonitorMode = "semantic" | "waiting_customer";
export type SlaBreachMetric = "first_response" | "assignment_accept" | "follow_up" | "resolution";
export type SlaTriggerActionType = "alert" | "escalate" | "reassign" | "close_case";

export type SlaTriggerAction = {
  type: SlaTriggerActionType;
  mode?: FollowUpMonitorMode;
};

export type ResolvedSlaDefinition = {
  definitionId: string | null;
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec: number | null;
  followUpTargetSec: number | null;
  resolutionTargetSec: number;
} | null;

export type ResolvedSlaTriggerPolicy = {
  triggerPolicyId: string | null;
  firstResponseActions: SlaTriggerAction[];
  assignmentAcceptActions: SlaTriggerAction[];
  followUpActions: SlaTriggerAction[];
  resolutionActions: SlaTriggerAction[];
} | null;

export function deriveInboundTimeoutPlan(input: {
  definition: ResolvedSlaDefinition;
  queueStatus: string;
  preserveHumanOwner: boolean;
}): {
  scheduleFirstResponse: boolean;
  scheduleAssignmentAccept: boolean;
} {
  const needsHumanResponse = input.preserveHumanOwner || ["assigned", "pending"].includes(input.queueStatus);
  return {
    scheduleFirstResponse: Boolean(input.definition?.firstResponseTargetSec && needsHumanResponse),
    scheduleAssignmentAccept: Boolean(
      input.definition?.assignmentAcceptTargetSec &&
      !input.preserveHumanOwner &&
      ["assigned", "pending"].includes(input.queueStatus)
    )
  };
}

export async function resolveConversationSlaDefinition(
  tenantId: string,
  customerId: string
): Promise<ResolvedSlaDefinition> {
  const customer = await resolveCustomerContext(tenantId, customerId);
  const definitions = await db("sla_definitions")
    .where({ tenant_id: tenantId, is_active: true })
    .select(
      "definition_id",
      "first_response_target_sec",
      "assignment_accept_target_sec",
      "follow_up_target_sec",
      "resolution_target_sec",
      "conditions",
      "priority"
    )
    .orderBy("priority", "asc")
    .orderBy("created_at", "asc");

  for (const definition of definitions as Array<Record<string, unknown>>) {
    if (!matchesConditions(definition.conditions, customer)) continue;
    return {
      definitionId: readNullableString(definition.definition_id),
      firstResponseTargetSec: Number(definition.first_response_target_sec ?? 0),
      assignmentAcceptTargetSec:
        definition.assignment_accept_target_sec === null || definition.assignment_accept_target_sec === undefined
          ? null
          : Number(definition.assignment_accept_target_sec),
      followUpTargetSec:
        definition.follow_up_target_sec === null || definition.follow_up_target_sec === undefined
          ? null
          : Number(definition.follow_up_target_sec),
      resolutionTargetSec: Number(definition.resolution_target_sec ?? 0)
    };
  }
  return null;
}

export async function resolveConversationTriggerPolicy(
  tenantId: string,
  customerId: string
): Promise<ResolvedSlaTriggerPolicy> {
  const customer = await resolveCustomerContext(tenantId, customerId);
  const rows = await db("sla_trigger_policies")
    .where({ tenant_id: tenantId, is_active: true })
    .select(
      "trigger_policy_id",
      "first_response_actions",
      "assignment_accept_actions",
      "follow_up_actions",
      "resolution_actions",
      "conditions",
      "priority"
    )
    .orderBy("priority", "asc")
    .orderBy("created_at", "asc");

  for (const row of rows as Array<Record<string, unknown>>) {
    if (!matchesConditions(row.conditions, customer)) continue;
    return {
      triggerPolicyId: readNullableString(row.trigger_policy_id),
      firstResponseActions: normalizeTriggerActions(row.first_response_actions, "first_response"),
      assignmentAcceptActions: normalizeTriggerActions(row.assignment_accept_actions, "assignment_accept"),
      followUpActions: normalizeTriggerActions(row.follow_up_actions, "follow_up"),
      resolutionActions: normalizeTriggerActions(row.resolution_actions, "resolution")
    };
  }
  return null;
}

async function resolveCustomerContext(tenantId: string, customerId: string) {
  const customer = await db("customers")
    .where({ tenant_id: tenantId, customer_id: customerId })
    .select("tier", "tags")
    .first<{ tier: string | null; tags: unknown } | undefined>();
  const tags = Array.isArray(customer?.tags) ? customer.tags.map((item) => String(item)).filter(Boolean) : [];
  return { tier: customer?.tier ?? null, tags };
}

function matchesConditions(raw: unknown, customer: { tier: string | null; tags: string[] }) {
  const conditions = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tagsAny = Array.isArray(conditions.tagsAny) ? conditions.tagsAny.map((item) => String(item)) : [];
  const tier = typeof conditions.customerTier === "string" ? conditions.customerTier : null;
  if (tagsAny.length > 0 && !tagsAny.some((tag) => customer.tags.includes(tag))) return false;
  if (tier && tier !== customer.tier) return false;
  return true;
}

function normalizeTriggerActions(raw: unknown, metric: SlaBreachMetric): SlaTriggerAction[] {
  if (!Array.isArray(raw)) return [];
  const allowed = allowedActionsForMetric(metric);
  const actions: SlaTriggerAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = typeof (item as { type?: unknown }).type === "string"
      ? ((item as { type: string }).type as SlaTriggerActionType)
      : null;
    if (!type || !allowed.has(type)) continue;
    const mode = typeof (item as { mode?: unknown }).mode === "string"
      ? ((item as { mode: string }).mode as FollowUpMonitorMode)
      : undefined;
    actions.push({
      type,
      ...(type === "close_case" && mode ? { mode } : {})
    });
  }
  return actions;
}

function allowedActionsForMetric(metric: SlaBreachMetric) {
  switch (metric) {
    case "first_response":
      return new Set<SlaTriggerActionType>(["alert", "escalate"]);
    case "assignment_accept":
      return new Set<SlaTriggerActionType>(["alert", "escalate", "reassign"]);
    case "follow_up":
      return new Set<SlaTriggerActionType>(["alert", "escalate", "reassign", "close_case"]);
    case "resolution":
      return new Set<SlaTriggerActionType>(["alert", "escalate"]);
    default:
      return new Set<SlaTriggerActionType>(["alert"]);
  }
}

async function removeTimeoutJobs(jobIds: string[]): Promise<void> {
  for (const jobId of jobIds) {
    await conversationTimeoutQueue.remove(jobId).catch(() => null);
  }
}

function assignmentAcceptJobIds(conversationId: string) {
  return {
    legacy: [
      `conv-assignment-accept-${conversationId}`,
      `conv-assignment-reassign-${conversationId}`,
      `conv-reassign-${conversationId}`
    ],
    slots: [
      `conv-assignment-accept-a-${conversationId}`,
      `conv-assignment-accept-b-${conversationId}`
    ]
  };
}

export async function scheduleFollowUpTimeout(
  tenantId: string,
  conversationId: string,
  customerId: string,
  input: { mode: FollowUpMonitorMode }
): Promise<void> {
  const definition = await resolveConversationSlaDefinition(tenantId, customerId);
  if (!definition?.followUpTargetSec || definition.followUpTargetSec <= 0) return;

  const scheduledAt = Date.now();
  const jobId = `conv-followup-${conversationId}`;
  await removeTimeoutJobs([jobId, `conv-close-${conversationId}`, `conv-unanswered-close-${conversationId}`]);
  await conversationTimeoutQueue.add(
    "conversation.follow_up_check",
    { tenantId, conversationId, alertType: "follow_up", followUpMode: input.mode, scheduledAt },
    {
      jobId,
      delay: definition.followUpTargetSec * 1000,
      removeOnComplete: 50,
      removeOnFail: 20
    }
  );
}

export async function cancelFollowUpTimeout(conversationId: string): Promise<void> {
  await removeTimeoutJobs([`conv-followup-${conversationId}`, `conv-close-${conversationId}`, `conv-unanswered-close-${conversationId}`]);
}

export async function scheduleAssignmentAcceptTimeout(
  tenantId: string,
  conversationId: string,
  customerId: string,
  input?: {
    currentJobId?: string | null;
  }
): Promise<void> {
  const definition = await resolveConversationSlaDefinition(tenantId, customerId);
  if (!definition?.assignmentAcceptTargetSec || definition.assignmentAcceptTargetSec <= 0) return;

  const scheduledAt = Date.now();
  const ids = assignmentAcceptJobIds(conversationId);
  const currentJobId = input?.currentJobId ?? null;
  const nextJobId = currentJobId === ids.slots[0] ? ids.slots[1] : ids.slots[0];
  const removableIds = [...ids.legacy, ...ids.slots].filter((jobId) => jobId !== currentJobId && jobId !== nextJobId);
  await removeTimeoutJobs(removableIds);
  await conversationTimeoutQueue.add(
    "conversation.assignment_accept_check",
    { tenantId, conversationId, alertType: "assignment_accept", scheduledAt },
    {
      jobId: nextJobId,
      delay: definition.assignmentAcceptTargetSec * 1000,
      removeOnComplete: 50,
      removeOnFail: 20
    }
  );
}

export async function cancelAssignmentAcceptTimeout(conversationId: string): Promise<void> {
  const ids = assignmentAcceptJobIds(conversationId);
  await removeTimeoutJobs([...ids.legacy, ...ids.slots]);
}

export async function scheduleFirstResponseTimeout(
  tenantId: string,
  conversationId: string,
  customerId: string
): Promise<void> {
  const definition = await resolveConversationSlaDefinition(tenantId, customerId);
  if (!definition?.firstResponseTargetSec || definition.firstResponseTargetSec <= 0) return;
  const scheduledAt = Date.now();
  const jobId = `conv-first-response-${conversationId}`;
  await removeTimeoutJobs([jobId, `conv-frt-${conversationId}`]);
  await conversationTimeoutQueue.add(
    "conversation.first_response_check",
    { tenantId, conversationId, alertType: "first_response", scheduledAt },
    {
      jobId,
      delay: definition.firstResponseTargetSec * 1000,
      removeOnComplete: 50,
      removeOnFail: 20
    }
  );
}

export async function cancelFirstResponseTimeout(conversationId: string): Promise<void> {
  await removeTimeoutJobs([`conv-first-response-${conversationId}`, `conv-frt-${conversationId}`]);
}

export async function recoverOverdueAssignmentAcceptTimeouts(limit = 500): Promise<number> {
  const rows = await db("queue_assignments as qa")
    .join("conversations as c", function joinConversation() {
      this.on("c.conversation_id", "=", "qa.conversation_id").andOn("c.tenant_id", "=", "qa.tenant_id");
    })
    .select("qa.tenant_id", "qa.conversation_id", "qa.updated_at", "c.customer_id")
    .whereIn("qa.status", ["assigned", "pending"])
    .whereIn("c.status", ["open", "queued"])
    .where((builder) => {
      builder.whereNull("c.current_handler_type").orWhereNot("c.current_handler_type", "human");
    })
    .orderBy("qa.updated_at", "asc")
    .limit(limit) as Array<{
      tenant_id: string;
      conversation_id: string;
      updated_at: string | Date | null;
      customer_id: string | null;
    }>;

  let recovered = 0;
  const now = Date.now();
  for (const row of rows) {
    if (!row.customer_id || !row.updated_at) continue;
    const definition = await resolveConversationSlaDefinition(row.tenant_id, row.customer_id);
    if (!definition?.assignmentAcceptTargetSec || definition.assignmentAcceptTargetSec <= 0) continue;
    const updatedAtMs = new Date(row.updated_at).getTime();
    if (!Number.isFinite(updatedAtMs)) continue;
    if (updatedAtMs + definition.assignmentAcceptTargetSec * 1000 > now) continue;
    const ids = assignmentAcceptJobIds(row.conversation_id);
    await removeTimeoutJobs([...ids.legacy, ...ids.slots]);
    await conversationTimeoutQueue.add(
      "conversation.assignment_accept_check",
      {
        tenantId: row.tenant_id,
        conversationId: row.conversation_id,
        alertType: "assignment_accept",
        scheduledAt: now
      },
      {
        jobId: ids.slots[0],
        delay: 0,
        removeOnComplete: 50,
        removeOnFail: 20
      }
    );
    recovered += 1;
  }
  return recovered;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
