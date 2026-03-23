import type { Knex } from "knex";

const TABLES = ["member_team_presets", "member_supervisor_team_presets"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("member_team_presets", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("membership_id").notNullable().references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
    t.uuid("team_id").notNullable().references("team_id").inTable("teams").onDelete("CASCADE");
    t.boolean("is_primary").notNullable().defaultTo(true);
    t.timestamp("joined_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.unique(["membership_id", "team_id"]);
    t.index(["tenant_id", "membership_id"], "member_team_presets_tenant_membership_idx");
  });

  await knex.schema.createTable("member_supervisor_team_presets", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("membership_id").notNullable().references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
    t.uuid("team_id").notNullable().references("team_id").inTable("teams").onDelete("CASCADE");
    t.timestamps(true, true);
    t.unique(["membership_id", "team_id"]);
    t.index(["tenant_id", "membership_id"], "member_supervisor_team_presets_tenant_membership_idx");
  });

  for (const table of TABLES) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }

  await knex.schema.dropTableIfExists("member_supervisor_team_presets");
  await knex.schema.dropTableIfExists("member_team_presets");
}
