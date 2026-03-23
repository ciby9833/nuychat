import type { Knex } from "knex";

const TABLES = ["shift_schedules", "agent_shifts", "agent_breaks"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("shift_schedules", (t) => {
    t.uuid("shift_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 60).notNullable();
    t.string("name", 120).notNullable();
    t.string("start_time", 5).notNullable(); // HH:mm
    t.string("end_time", 5).notNullable(); // HH:mm
    t.string("timezone", 60).notNullable().defaultTo("Asia/Jakarta");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
    t.index(["tenant_id", "is_active"], "shift_schedules_tenant_active_idx");
  });

  await knex.schema.createTable("agent_shifts", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("agent_id").notNullable().references("agent_id").inTable("agent_profiles").onDelete("CASCADE");
    t.uuid("shift_id").references("shift_id").inTable("shift_schedules").onDelete("SET NULL");
    t.date("shift_date").notNullable();
    t.string("status", 20).notNullable().defaultTo("scheduled"); // scheduled | off | leave
    t.string("note", 300);
    t.timestamps(true, true);
    t.unique(["agent_id", "shift_date"], "agent_shifts_agent_date_uniq");
    t.index(["tenant_id", "shift_date"], "agent_shifts_tenant_date_idx");
  });

  await knex.schema.createTable("agent_breaks", (t) => {
    t.uuid("break_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("agent_id").notNullable().references("agent_id").inTable("agent_profiles").onDelete("CASCADE");
    t.string("break_type", 30).notNullable().defaultTo("break"); // break | lunch | training
    t.string("status", 20).notNullable().defaultTo("active"); // active | ended
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("ended_at", { useTz: true });
    t.string("note", 300);
    t.timestamps(true, true);
    t.index(["tenant_id", "agent_id", "status"], "agent_breaks_tenant_agent_status_idx");
  });

  for (const table of TABLES) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
    await enableTenantRls(knex, table);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }
  await knex.schema.dropTableIfExists("agent_breaks");
  await knex.schema.dropTableIfExists("agent_shifts");
  await knex.schema.dropTableIfExists("shift_schedules");
}

async function enableTenantRls(knex: Knex, table: string) {
  await knex.raw(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY ${table}_tenant_isolation ON ${table}
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}
