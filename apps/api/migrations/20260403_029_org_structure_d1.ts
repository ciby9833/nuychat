import type { Knex } from "knex";

const TABLES = ["departments", "teams", "agent_team_map"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("departments", (t) => {
    t.uuid("department_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 60).notNullable();
    t.string("name", 120).notNullable();
    t.uuid("parent_department_id").references("department_id").inTable("departments").onDelete("SET NULL");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
    t.index(["tenant_id", "is_active"], "departments_tenant_active_idx");
  });

  await knex.schema.createTable("teams", (t) => {
    t.uuid("team_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("department_id").notNullable().references("department_id").inTable("departments").onDelete("CASCADE");
    t.string("code", 60).notNullable();
    t.string("name", 120).notNullable();
    t.uuid("supervisor_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
    t.index(["tenant_id", "department_id", "is_active"], "teams_tenant_dept_active_idx");
  });

  await knex.schema.createTable("agent_team_map", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("team_id").notNullable().references("team_id").inTable("teams").onDelete("CASCADE");
    t.uuid("agent_id").notNullable().references("agent_id").inTable("agent_profiles").onDelete("CASCADE");
    t.boolean("is_primary").notNullable().defaultTo(true);
    t.timestamp("joined_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.unique(["team_id", "agent_id"]);
    t.index(["tenant_id", "team_id"], "agent_team_map_tenant_team_idx");
    t.index(["tenant_id", "agent_id"], "agent_team_map_tenant_agent_idx");
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

  await knex.schema.dropTableIfExists("agent_team_map");
  await knex.schema.dropTableIfExists("teams");
  await knex.schema.dropTableIfExists("departments");
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
