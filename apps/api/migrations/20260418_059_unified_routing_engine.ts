import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasDispatchExecutions = await knex.schema.hasTable("dispatch_executions");
  if (!hasDispatchExecutions) {
    await knex.schema.createTable("dispatch_executions", (t) => {
      t.uuid("execution_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").nullable().references("customer_id").inTable("customers").onDelete("SET NULL");
      t.uuid("segment_id").nullable().references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.string("trigger_type", 64).notNullable();
      t.string("trigger_actor_type", 32).nullable();
      t.uuid("trigger_actor_id").nullable();
      t.string("decision_type", 64).notNullable();
      t.string("channel_type", 32).nullable();
      t.string("channel_id", 128).nullable();
      t.string("customer_tier", 32).nullable();
      t.string("customer_language", 16).nullable();
      t.uuid("routing_rule_id").nullable().references("rule_id").inTable("routing_rules").onDelete("SET NULL");
      t.string("routing_rule_name", 120).nullable();
      t.jsonb("matched_conditions").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.jsonb("input_snapshot").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.jsonb("decision_summary").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.string("decision_reason", 128).nullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("dispatch_executions", (t) => {
      t.index(["tenant_id", "created_at"], "dispatch_executions_tenant_created_idx");
      t.index(["conversation_id", "created_at"], "dispatch_executions_conversation_created_idx");
    });
  }

  const hasDispatchCandidates = await knex.schema.hasTable("dispatch_execution_candidates");
  if (!hasDispatchCandidates) {
    await knex.schema.createTable("dispatch_execution_candidates", (t) => {
      t.uuid("candidate_log_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("execution_id").notNullable().references("execution_id").inTable("dispatch_executions").onDelete("CASCADE");
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("candidate_type", 32).notNullable();
      t.uuid("candidate_id").nullable();
      t.string("candidate_label", 160).nullable();
      t.string("stage", 64).notNullable();
      t.boolean("accepted").notNullable().defaultTo(false);
      t.string("reject_reason", 128).nullable();
      t.jsonb("details").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("dispatch_execution_candidates", (t) => {
      t.index(["tenant_id", "candidate_type", "created_at"], "dispatch_execution_candidates_tenant_type_created_idx");
      t.index(["execution_id"], "dispatch_execution_candidates_execution_idx");
    });
  }

  const hasDispatchTransitions = await knex.schema.hasTable("dispatch_transitions");
  if (!hasDispatchTransitions) {
    await knex.schema.createTable("dispatch_transitions", (t) => {
      t.uuid("transition_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").nullable().references("customer_id").inTable("customers").onDelete("SET NULL");
      t.uuid("execution_id").nullable().references("execution_id").inTable("dispatch_executions").onDelete("SET NULL");
      t.string("transition_type", 64).notNullable();
      t.string("actor_type", 32).nullable();
      t.uuid("actor_id").nullable();
      t.string("from_owner_type", 32).nullable();
      t.uuid("from_owner_id").nullable();
      t.uuid("from_segment_id").nullable().references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.string("to_owner_type", 32).nullable();
      t.uuid("to_owner_id").nullable();
      t.uuid("to_segment_id").nullable().references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.string("reason", 128).nullable();
      t.jsonb("payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("dispatch_transitions", (t) => {
      t.index(["tenant_id", "created_at"], "dispatch_transitions_tenant_created_idx");
      t.index(["conversation_id", "created_at"], "dispatch_transitions_conversation_created_idx");
    });
  }

  const hasRoutingPlans = await knex.schema.hasTable("routing_plans");
  if (!hasRoutingPlans) {
    await knex.schema.createTable("routing_plans", (t) => {
      t.uuid("plan_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").nullable().references("customer_id").inTable("customers").onDelete("SET NULL");
      t.uuid("segment_id").nullable().references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.uuid("parent_plan_id").nullable().references("plan_id").inTable("routing_plans").onDelete("SET NULL");
      t.string("trigger_type", 64).notNullable();
      t.string("mode", 32).notNullable();
      t.jsonb("current_owner").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.jsonb("target_snapshot").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.jsonb("fallback_snapshot").notNullable().defaultTo(knex.raw("'null'::jsonb"));
      t.jsonb("status_plan").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.jsonb("decision_trace").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.string("decision_reason", 128).nullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("routing_plans", (t) => {
      t.index(["tenant_id", "conversation_id", "created_at"], "routing_plans_tenant_conversation_created_idx");
      t.index(["conversation_id", "created_at"], "routing_plans_conversation_created_idx");
    });
  }

  const hasRoutingPlanSteps = await knex.schema.hasTable("routing_plan_steps");
  if (!hasRoutingPlanSteps) {
    await knex.schema.createTable("routing_plan_steps", (t) => {
      t.uuid("step_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("plan_id").notNullable().references("plan_id").inTable("routing_plans").onDelete("CASCADE");
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("step_type", 64).notNullable();
      t.string("status", 32).notNullable();
      t.jsonb("payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("routing_plan_steps", (t) => {
      t.index(["plan_id", "created_at"], "routing_plan_steps_plan_created_idx");
      t.index(["tenant_id", "created_at"], "routing_plan_steps_tenant_created_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("routing_plan_steps");
  await knex.schema.dropTableIfExists("routing_plans");
}
