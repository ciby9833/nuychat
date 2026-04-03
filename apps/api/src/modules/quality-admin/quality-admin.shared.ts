import { withTenantTransaction } from "../../infra/db/client.js";
import { parseJsonObject, toIsoString } from "../tenant/tenant-admin.shared.js";

export type TriggerMetric = "first_response" | "assignment_accept" | "subsequent_response" | "follow_up" | "resolution";
export type TriggerActionType = "alert" | "escalate" | "reassign" | "close_case";
export type TriggerActionRecord = {
  type: TriggerActionType;
  mode?: "semantic" | "waiting_customer";
  condition?: "always" | "owner_unavailable";
};

export function serializeTriggerPolicyRow(row: Record<string, unknown>) {
  return {
    triggerPolicyId: row.trigger_policy_id,
    name: row.name,
    priority: row.priority,
    firstResponseActions: normalizeTriggerActionsBody(row.first_response_actions, "first_response"),
    assignmentAcceptActions: normalizeTriggerActionsBody(row.assignment_accept_actions, "assignment_accept"),
    subsequentResponseActions: normalizeTriggerActionsBody(row.subsequent_response_actions, "subsequent_response"),
    followUpActions: normalizeTriggerActionsBody(row.follow_up_actions, "follow_up"),
    resolutionActions: normalizeTriggerActionsBody(row.resolution_actions, "resolution"),
    conditions: parseJsonObject(row.conditions),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export function normalizeTriggerActionsBody(raw: unknown, metric: TriggerMetric) {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? safeParseArray(raw)
      : [];
  const allowed = allowedTriggerActions(metric);
  const actions: TriggerActionRecord[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const type = typeof (item as { type?: unknown }).type === "string"
      ? ((item as { type: string }).type as TriggerActionType)
      : null;
    if (!type || !allowed.has(type)) continue;
    const mode = typeof (item as { mode?: unknown }).mode === "string"
      ? ((item as { mode: "semantic" | "waiting_customer" }).mode)
      : undefined;
    const condition = typeof (item as { condition?: unknown }).condition === "string"
      ? ((item as { condition: "always" | "owner_unavailable" }).condition)
      : undefined;
    actions.push({
      type,
      ...(type === "close_case" && mode ? { mode } : {}),
      ...(type === "reassign" && condition ? { condition } : {})
    });
  }
  return actions;
}

export async function resolveLatestCaseId(
  trx: Parameters<typeof withTenantTransaction>[1] extends (trx: infer T) => unknown ? T : never,
  tenantId: string,
  conversationId: string
) {
  const row = await trx("conversation_cases")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .orderByRaw("CASE WHEN status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END")
    .orderBy("last_activity_at", "desc")
    .orderBy("opened_at", "desc")
    .select("case_id")
    .first<{ case_id: string } | undefined>();

  return row?.case_id ?? null;
}

function allowedTriggerActions(metric: TriggerMetric) {
  switch (metric) {
    case "first_response":
      return new Set<TriggerActionType>(["alert", "escalate"]);
    case "assignment_accept":
      return new Set<TriggerActionType>(["alert", "escalate", "reassign"]);
    case "follow_up":
      return new Set<TriggerActionType>(["alert", "escalate", "reassign", "close_case"]);
    case "subsequent_response":
      return new Set<TriggerActionType>(["alert", "escalate", "reassign"]);
    case "resolution":
      return new Set<TriggerActionType>(["alert", "escalate"]);
    default:
      return new Set<TriggerActionType>(["alert"]);
  }
}

function safeParseArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
