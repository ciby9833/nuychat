import type { Knex } from "knex";

import type { RoutingPlan } from "./types.js";

export class RoutingPlanRepository {
  async create(db: Knex | Knex.Transaction, plan: RoutingPlan): Promise<string> {
    const [row] = await db("routing_plans")
      .insert({
        tenant_id: plan.tenantId,
        conversation_id: plan.conversationId,
        customer_id: plan.customerId,
        case_id: plan.caseId,
        segment_id: plan.segmentId,
        parent_plan_id: plan.parentPlanId ?? null,
        trigger_type: plan.triggerType,
        mode: plan.mode,
        current_owner: JSON.stringify(plan.currentOwner),
        target_snapshot: JSON.stringify(plan.target),
        fallback_snapshot: JSON.stringify(plan.fallback),
        status_plan: JSON.stringify({
          ...plan.statusPlan,
          action: plan.action
        }),
        decision_trace: JSON.stringify(plan.trace),
        decision_reason: plan.trace.decision.reason
      })
      .returning(["plan_id"]);

    return row.plan_id as string;
  }

  async getById(
    db: Knex | Knex.Transaction,
    tenantId: string,
    planId: string
  ): Promise<RoutingPlan | null> {
    const row = await db("routing_plans")
      .where({ tenant_id: tenantId, plan_id: planId })
      .select(
        "plan_id",
        "tenant_id",
        "conversation_id",
        "customer_id",
        "case_id",
        "segment_id",
        "parent_plan_id",
        "trigger_type",
        "mode",
        "current_owner",
        "target_snapshot",
        "fallback_snapshot",
        "status_plan",
        "decision_trace"
      )
      .first<Record<string, unknown> | undefined>();

    if (!row) return null;

    return {
      planId: String(row.plan_id),
      tenantId: String(row.tenant_id),
      conversationId: String(row.conversation_id),
      customerId: typeof row.customer_id === "string" ? row.customer_id : null,
      caseId: typeof row.case_id === "string" ? row.case_id : null,
      segmentId: typeof row.segment_id === "string" ? row.segment_id : null,
      parentPlanId: typeof row.parent_plan_id === "string" ? row.parent_plan_id : null,
      triggerType: String(row.trigger_type) as RoutingPlan["triggerType"],
      mode: String(row.mode) as RoutingPlan["mode"],
      currentOwner: parseRecord(row.current_owner) as RoutingPlan["currentOwner"],
      target: parseRecord(row.target_snapshot) as RoutingPlan["target"],
      fallback: parseNullableRecord(row.fallback_snapshot) as RoutingPlan["fallback"],
      statusPlan: parseRecord(row.status_plan) as RoutingPlan["statusPlan"],
      trace: parseRecord(row.decision_trace) as RoutingPlan["trace"],
      action: (parseRecord(row.status_plan).action as RoutingPlan["action"] | undefined) ?? "assign_specific_owner"
    };
  }
}

function parseRecord(value: unknown): Record<string, unknown> {
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

function parseNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (value === "null") return null;
  const parsed = parseRecord(value);
  return Object.keys(parsed).length ? parsed : null;
}
