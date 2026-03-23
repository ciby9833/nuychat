import type { Knex } from "knex";

const TENANT_TABLES = ["routing_rules", "queue_assignments", "conversation_events", "ai_traces"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("routing_rules", (t) => {
    t.uuid("rule_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.integer("priority").notNullable().defaultTo(100);
    t.string("name", 120).notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.jsonb("conditions").notNullable().defaultTo("{}");
    t.jsonb("actions").notNullable().defaultTo("{}");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("queue_assignments", (t) => {
    t.uuid("assignment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("module_id").references("module_id").inTable("modules").onDelete("SET NULL");
    t.uuid("skill_group_id").references("skill_group_id").inTable("skill_groups").onDelete("SET NULL");
    t.uuid("assigned_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.string("status", 30).notNullable().defaultTo("pending");
    t.string("assignment_strategy", 30).notNullable().defaultTo("round_robin");
    t.integer("priority").notNullable().defaultTo(100);
    t.timestamps(true, true);
    t.unique(["conversation_id"]);
  });

  await knex.schema.createTable("conversation_events", (t) => {
    t.uuid("event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.string("event_type", 50).notNullable();
    t.string("actor_type", 20);
    t.uuid("actor_id");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "conversation_id", "created_at"], "conversation_events_lookup_idx");
  });

  await knex.schema.createTable("ai_traces", (t) => {
    t.uuid("trace_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("message_id");
    t.string("supervisor", 50).notNullable().defaultTo("copilot");
    t.jsonb("steps").notNullable().defaultTo("[]");
    t.jsonb("skills_called").notNullable().defaultTo("[]");
    t.string("handoff_reason", 100);
    t.jsonb("token_usage").defaultTo("{}");
    t.integer("total_duration_ms").defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  for (const table of TENANT_TABLES) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    `);
  }

  for (const table of ["routing_rules", "queue_assignments"]) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ["routing_rules", "queue_assignments"]) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }

  for (const table of TENANT_TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
  }

  await knex.schema.dropTableIfExists("ai_traces");
  await knex.schema.dropTableIfExists("conversation_events");
  await knex.schema.dropTableIfExists("queue_assignments");
  await knex.schema.dropTableIfExists("routing_rules");
}
