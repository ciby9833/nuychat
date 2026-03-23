import type { Knex } from "knex";

export class RoutingPlanStepService {
  async record(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      planId: string;
      stepType: string;
      status: "started" | "completed" | "failed" | "skipped";
      payload?: Record<string, unknown>;
    }
  ) {
    await db("routing_plan_steps").insert({
      tenant_id: input.tenantId,
      plan_id: input.planId,
      step_type: input.stepType,
      status: input.status,
      payload: JSON.stringify(input.payload ?? {})
    });
  }
}
