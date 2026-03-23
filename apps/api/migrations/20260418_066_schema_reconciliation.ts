import type { Knex } from "knex";

const ACTIVE_CASE_STATUSES = ["open", "in_progress", "waiting_customer", "waiting_internal"] as const;

export async function up(knex: Knex): Promise<void> {
  await ensureAiTraces(knex);
  await ensureQueueAssignments(knex);
  await ensureConversationSegments(knex);
  await ensureConversationCases(knex);
  await ensureDecisionTraces(knex);
  await ensureRoutingPlans(knex);
  await ensureSlaPolicies(knex);
}

export async function down(): Promise<void> {
  // Intentionally no-op. This migration reconciles drifted production schemas
  // to the current canonical structure and should not try to remove objects.
}

async function ensureAiTraces(knex: Knex) {
  const exists = await knex.schema.hasTable("ai_traces");
  if (!exists) {
    await knex.schema.createTable("ai_traces", (t) => {
      t.uuid("trace_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("message_id");
      t.string("supervisor", 50).notNullable().defaultTo("orchestrator");
      t.jsonb("steps").notNullable().defaultTo("[]");
      t.jsonb("skills_called").notNullable().defaultTo("[]");
      t.string("handoff_reason", 100);
      t.jsonb("token_usage").notNullable().defaultTo("{\"prompt\":0,\"completion\":0,\"total\":0}");
      t.integer("total_duration_ms").notNullable().defaultTo(0);
      t.text("error");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await ensureColumn(knex, "ai_traces", "supervisor", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS supervisor varchar(50) NOT NULL DEFAULT 'orchestrator'"));
  await ensureColumn(knex, "ai_traces", "steps", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb"));
  await ensureColumn(knex, "ai_traces", "skills_called", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS skills_called jsonb NOT NULL DEFAULT '[]'::jsonb"));
  await ensureColumn(knex, "ai_traces", "token_usage", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS token_usage jsonb NOT NULL DEFAULT '{\"prompt\":0,\"completion\":0,\"total\":0}'::jsonb"));
  await ensureColumn(knex, "ai_traces", "total_duration_ms", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS total_duration_ms integer NOT NULL DEFAULT 0"));
  await ensureColumn(knex, "ai_traces", "handoff_reason", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS handoff_reason text"));
  await ensureColumn(knex, "ai_traces", "error", () =>
    knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS error text"));

  await knex.raw("CREATE INDEX IF NOT EXISTS ai_traces_conversation_idx ON ai_traces (tenant_id, conversation_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS ai_traces_tenant_created_idx ON ai_traces (tenant_id, created_at)");
  await ensureTenantIsolationPolicy(knex, "ai_traces", "ai_traces_tenant_isolation");
}

async function ensureQueueAssignments(knex: Knex) {
  const exists = await knex.schema.hasTable("queue_assignments");
  if (!exists) {
    await knex.schema.createTable("queue_assignments", (t) => {
      t.uuid("assignment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("module_id").references("module_id").inTable("modules").onDelete("SET NULL");
      t.uuid("skill_group_id").references("skill_group_id").inTable("skill_groups").onDelete("SET NULL");
      t.uuid("department_id").references("department_id").inTable("departments").onDelete("SET NULL");
      t.uuid("team_id").references("team_id").inTable("teams").onDelete("SET NULL");
      t.uuid("assigned_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
      t.uuid("assigned_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
      t.boolean("handoff_required").notNullable().defaultTo(false);
      t.text("handoff_reason");
      t.timestamp("last_ai_response_at", { useTz: true });
      t.string("status", 30).notNullable().defaultTo("pending");
      t.string("assignment_strategy", 30).notNullable().defaultTo("round_robin");
      t.integer("priority").notNullable().defaultTo(100);
      t.string("assignment_reason", 128);
      t.timestamps(true, true);
      t.unique(["conversation_id"]);
    });
  }

  await ensureColumn(knex, "queue_assignments", "department_id", () =>
    knex.schema.alterTable("queue_assignments", (t) => {
      t.uuid("department_id").references("department_id").inTable("departments").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "queue_assignments", "team_id", () =>
    knex.schema.alterTable("queue_assignments", (t) => {
      t.uuid("team_id").references("team_id").inTable("teams").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "queue_assignments", "assignment_reason", () =>
    knex.schema.alterTable("queue_assignments", (t) => {
      t.string("assignment_reason", 128);
    }));
  await ensureColumn(knex, "queue_assignments", "assigned_ai_agent_id", () =>
    knex.schema.alterTable("queue_assignments", (t) => {
      t.uuid("assigned_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "queue_assignments", "handoff_required", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN IF NOT EXISTS handoff_required boolean NOT NULL DEFAULT false"));
  await ensureColumn(knex, "queue_assignments", "handoff_reason", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN IF NOT EXISTS handoff_reason text"));
  await ensureColumn(knex, "queue_assignments", "last_ai_response_at", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN IF NOT EXISTS last_ai_response_at timestamptz"));

  await knex.raw("CREATE INDEX IF NOT EXISTS queue_assignments_tenant_department_status_idx ON queue_assignments (tenant_id, department_id, status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS queue_assignments_tenant_team_status_idx ON queue_assignments (tenant_id, team_id, status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS queue_assignments_tenant_ai_status_idx ON queue_assignments (tenant_id, assigned_ai_agent_id, status)");
  await ensureTenantIsolationPolicy(knex, "queue_assignments", "queue_assignments_tenant_isolation");
  await ensureUpdatedAtTrigger(knex, "queue_assignments", "queue_assignments_set_updated_at");
}

async function ensureConversationSegments(knex: Knex) {
  const exists = await knex.schema.hasTable("conversation_segments");
  if (!exists) {
    await knex.schema.createTable("conversation_segments", (t) => {
      t.uuid("segment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
      t.string("owner_type", 20).notNullable();
      t.uuid("owner_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
      t.uuid("owner_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
      t.string("status", 20).notNullable().defaultTo("active");
      t.uuid("transferred_from_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.text("reason");
      t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("ended_at", { useTz: true });
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await ensureColumn(knex, "conversations", "current_segment_id", () =>
    knex.schema.alterTable("conversations", (t) => {
      t.uuid("current_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "messages", "segment_id", () =>
    knex.schema.alterTable("messages", (t) => {
      t.uuid("segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    }));

  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_segments_tenant_conversation_status_idx ON conversation_segments (tenant_id, conversation_id, status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_segments_tenant_owner_type_status_idx ON conversation_segments (tenant_id, owner_type, status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_segments_tenant_agent_started_idx ON conversation_segments (tenant_id, owner_agent_id, started_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_segments_tenant_ai_started_idx ON conversation_segments (tenant_id, owner_ai_agent_id, started_at)");
  await ensureTenantIsolationPolicy(knex, "conversation_segments", "conversation_segments_tenant_isolation");
  await ensureUpdatedAtTrigger(knex, "conversation_segments", "conversation_segments_set_updated_at");
}

async function ensureConversationCases(knex: Knex) {
  const exists = await knex.schema.hasTable("conversation_cases");
  if (!exists) {
    await knex.schema.createTable("conversation_cases", (t) => {
      t.uuid("case_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
      t.uuid("current_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.uuid("parent_case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
      t.string("case_type", 80).notNullable().defaultTo("general_inquiry");
      t.string("case_source", 40).notNullable().defaultTo("system");
      t.string("title", 255).notNullable();
      t.text("summary");
      t.string("status", 40).notNullable().defaultTo("open");
      t.string("priority", 20).notNullable().defaultTo("normal");
      t.string("current_owner_type", 20).notNullable().defaultTo("system");
      t.uuid("current_owner_id");
      t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("resolved_at", { useTz: true });
      t.timestamp("closed_at", { useTz: true });
      t.timestamp("last_customer_message_at", { useTz: true });
      t.timestamp("last_agent_message_at", { useTz: true });
      t.timestamp("last_ai_message_at", { useTz: true });
      t.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.jsonb("metadata").notNullable().defaultTo("{}");
      t.timestamps(true, true);
    });
  }

  await ensureColumn(knex, "conversations", "current_case_id", () =>
    knex.schema.alterTable("conversations", (t) => {
      t.uuid("current_case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "conversation_segments", "case_id", () =>
    knex.schema.alterTable("conversation_segments", (t) => {
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));
  await ensureColumn(knex, "messages", "case_id", () =>
    knex.schema.alterTable("messages", (t) => {
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));
  await ensureOptionalCaseColumn(knex, "async_tasks");
  await ensureOptionalCaseColumn(knex, "conversation_intelligence");
  await ensureOptionalCaseColumn(knex, "customer_memory_items");

  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_cases_conversation_status_idx ON conversation_cases (tenant_id, conversation_id, status, last_activity_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_cases_customer_status_idx ON conversation_cases (tenant_id, customer_id, status, last_activity_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_cases_owner_status_idx ON conversation_cases (tenant_id, current_owner_type, current_owner_id, status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_cases_type_status_idx ON conversation_cases (tenant_id, case_type, status, last_activity_at)");
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS conversation_cases_single_active_idx
    ON conversation_cases (tenant_id, conversation_id)
    WHERE status IN (${ACTIVE_CASE_STATUSES.map((status) => `'${status}'`).join(", ")})
  `);
  await knex.raw("CREATE INDEX IF NOT EXISTS conversations_tenant_current_case_idx ON conversations (tenant_id, current_case_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS conversation_segments_case_started_idx ON conversation_segments (tenant_id, case_id, started_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS messages_tenant_case_created_idx ON messages (tenant_id, case_id, created_at)");

  if (await knex.schema.hasTable("async_tasks")) {
    await knex.raw("CREATE INDEX IF NOT EXISTS async_tasks_case_idx ON async_tasks (tenant_id, case_id, created_at)");
  }
  if (await knex.schema.hasTable("conversation_intelligence")) {
    await knex.raw("CREATE INDEX IF NOT EXISTS conversation_intelligence_case_idx ON conversation_intelligence (tenant_id, case_id, updated_at)");
  }
  if (await knex.schema.hasTable("customer_memory_items")) {
    await knex.raw("CREATE INDEX IF NOT EXISTS customer_memory_items_case_idx ON customer_memory_items (tenant_id, case_id, memory_type)");
  }

  await ensureTenantIsolationPolicy(knex, "conversation_cases", "conversation_cases_tenant_isolation");
  await ensureUpdatedAtTrigger(knex, "conversation_cases", "conversation_cases_set_updated_at");
}

async function ensureDecisionTraces(knex: Knex) {
  const exists = await knex.schema.hasTable("decision_traces");
  if (!exists) {
    await knex.schema.createTable("decision_traces", (t) => {
      t.uuid("trace_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
      t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
      t.uuid("segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.string("trace_kind", 40).notNullable();
      t.string("execution_ref", 120);
      t.string("trigger_type", 40);
      t.string("trigger_actor_type", 20);
      t.uuid("trigger_actor_id");
      t.string("decision_type", 40);
      t.string("stage", 40);
      t.string("channel_type", 30);
      t.string("channel_id", 120);
      t.string("customer_tier", 30);
      t.string("customer_language", 30);
      t.uuid("routing_rule_id").references("rule_id").inTable("routing_rules").onDelete("SET NULL");
      t.string("routing_rule_name", 160);
      t.string("from_owner_type", 20);
      t.string("from_owner_id", 120);
      t.uuid("from_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.string("to_owner_type", 20);
      t.string("to_owner_id", 120);
      t.uuid("to_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.text("reason");
      t.jsonb("matched_conditions").notNullable().defaultTo("{}");
      t.jsonb("input_snapshot").notNullable().defaultTo("{}");
      t.jsonb("decision_summary").notNullable().defaultTo("{}");
      t.jsonb("payload").notNullable().defaultTo("{}");
      t.jsonb("candidates").notNullable().defaultTo("[]");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await ensureColumn(knex, "decision_traces", "case_id", () =>
    knex.schema.alterTable("decision_traces", (t) => {
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));

  await knex.raw("CREATE INDEX IF NOT EXISTS decision_traces_kind_created_idx ON decision_traces (tenant_id, trace_kind, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS decision_traces_conversation_idx ON decision_traces (tenant_id, conversation_id, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS decision_traces_execution_ref_idx ON decision_traces (tenant_id, execution_ref)");
  await knex.raw("CREATE INDEX IF NOT EXISTS decision_traces_case_created_idx ON decision_traces (tenant_id, case_id, created_at)");

  await knex.raw(`
    UPDATE decision_traces AS dt
    SET case_id = source.case_id
    FROM (
      SELECT DISTINCT ON (cc.conversation_id) cc.conversation_id, cc.case_id
      FROM conversation_cases AS cc
      WHERE cc.status IN (${ACTIVE_CASE_STATUSES.map((status) => `'${status}'`).join(", ")})
      ORDER BY cc.conversation_id, cc.last_activity_at DESC, cc.opened_at DESC
    ) AS source
    WHERE dt.case_id IS NULL
      AND dt.conversation_id = source.conversation_id
  `);

  await ensureTenantIsolationPolicy(knex, "decision_traces", "decision_traces_tenant_isolation");
}

async function ensureRoutingPlans(knex: Knex) {
  const plansExist = await knex.schema.hasTable("routing_plans");
  if (!plansExist) {
    await knex.schema.createTable("routing_plans", (t) => {
      t.uuid("plan_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("customer_id").nullable().references("customer_id").inTable("customers").onDelete("SET NULL");
      t.uuid("case_id").nullable().references("case_id").inTable("conversation_cases").onDelete("SET NULL");
      t.uuid("segment_id").nullable().references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
      t.uuid("parent_plan_id").nullable().references("plan_id").inTable("routing_plans").onDelete("SET NULL");
      t.string("trigger_type", 64).notNullable();
      t.string("mode", 32).notNullable();
      t.jsonb("current_owner").notNullable().defaultTo("{}");
      t.jsonb("target_snapshot").notNullable().defaultTo("{}");
      t.jsonb("fallback_snapshot").notNullable().defaultTo("null");
      t.jsonb("status_plan").notNullable().defaultTo("{}");
      t.jsonb("decision_trace").notNullable().defaultTo("{}");
      t.string("decision_reason", 128).nullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await ensureColumn(knex, "routing_plans", "case_id", () =>
    knex.schema.alterTable("routing_plans", (t) => {
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));

  await knex.raw("CREATE INDEX IF NOT EXISTS routing_plans_tenant_conversation_created_idx ON routing_plans (tenant_id, conversation_id, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS routing_plans_conversation_created_idx ON routing_plans (conversation_id, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS routing_plans_tenant_case_created_idx ON routing_plans (tenant_id, case_id, created_at)");

  const stepsExist = await knex.schema.hasTable("routing_plan_steps");
  if (!stepsExist) {
    await knex.schema.createTable("routing_plan_steps", (t) => {
      t.uuid("step_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("plan_id").notNullable().references("plan_id").inTable("routing_plans").onDelete("CASCADE");
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("step_type", 64).notNullable();
      t.string("status", 32).notNullable();
      t.jsonb("payload").notNullable().defaultTo("{}");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw("CREATE INDEX IF NOT EXISTS routing_plan_steps_plan_created_idx ON routing_plan_steps (plan_id, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS routing_plan_steps_tenant_created_idx ON routing_plan_steps (tenant_id, created_at)");
}

async function ensureSlaPolicies(knex: Knex) {
  if (!(await knex.schema.hasTable("sla_policies"))) return;

  await ensureColumn(knex, "sla_policies", "idle_close_after_sec", () =>
    knex.raw("ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS idle_close_after_sec integer"));
  await ensureColumn(knex, "sla_policies", "assignment_reassign_after_sec", () =>
    knex.raw("ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS assignment_reassign_after_sec integer"));

  await knex.raw(`
    UPDATE sla_policies
    SET assignment_reassign_after_sec = first_response_target_sec
    WHERE assignment_reassign_after_sec IS NULL
      AND first_response_target_sec IS NOT NULL
  `);
}

async function ensureOptionalCaseColumn(knex: Knex, tableName: string) {
  if (!(await knex.schema.hasTable(tableName))) return;
  await ensureColumn(knex, tableName, "case_id", () =>
    knex.schema.alterTable(tableName, (t) => {
      t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    }));
}

async function ensureColumn(
  knex: Knex,
  tableName: string,
  columnName: string,
  addColumn: () => Promise<unknown>
) {
  const hasTable = await knex.schema.hasTable(tableName);
  if (!hasTable) return;
  const hasColumn = await knex.schema.hasColumn(tableName, columnName);
  if (!hasColumn) {
    await addColumn();
  }
}

async function ensureTenantIsolationPolicy(knex: Knex, tableName: string, policyName: string) {
  if (!(await knex.schema.hasTable(tableName))) return;
  await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
  await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
  await knex.raw(`
    CREATE POLICY ${policyName} ON ${tableName}
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id())
  `);
}

async function ensureUpdatedAtTrigger(knex: Knex, tableName: string, triggerName: string) {
  if (!(await knex.schema.hasTable(tableName))) return;
  await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);
  await knex.raw(`
    CREATE TRIGGER ${triggerName}
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);
}
