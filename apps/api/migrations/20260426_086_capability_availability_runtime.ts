import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("capability_availability", (t) => {
    t.uuid("availability_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("capability_id").notNullable().references("capability_id").inTable("capabilities").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("channel", 60);
    t.string("role", 60);
    t.uuid("module_id");
    t.string("owner_mode", 40);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(["capability_id", "channel", "role", "module_id", "owner_mode"], "capability_availability_scope_uniq");
    t.index(["tenant_id", "enabled"], "capability_availability_tenant_enabled_idx");
    t.index(["capability_id", "enabled"], "capability_availability_capability_enabled_idx");
  });

  await knex.raw(`
    ALTER TABLE capability_availability ENABLE ROW LEVEL SECURITY;
    ALTER TABLE capability_availability FORCE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    CREATE POLICY capability_availability_tenant_isolation ON capability_availability
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER capability_availability_set_updated_at
    BEFORE UPDATE ON capability_availability
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  const legacyRows = await knex("tenant_skill_availability").select("*");
  if (legacyRows.length > 0) {
    await knex("capability_availability").insert(
      legacyRows.map((row) => ({
        availability_id: row.availability_id,
        capability_id: row.tenant_skill_id,
        tenant_id: row.tenant_id,
        channel: row.channel ?? null,
        role: row.role ?? null,
        module_id: row.module_id ?? null,
        owner_mode: row.owner_mode ?? null,
        enabled: row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    );
  }

  await knex.raw("DROP POLICY IF EXISTS tenant_skill_availability_tenant_isolation ON tenant_skill_availability");
  await knex.raw("DROP TRIGGER IF EXISTS tenant_skill_availability_set_updated_at ON tenant_skill_availability");
  await knex.schema.dropTableIfExists("tenant_skill_availability");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("tenant_skill_availability", (t) => {
    t.uuid("availability_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_skill_id").notNullable().references("tenant_skill_id").inTable("tenant_skills").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("channel", 60);
    t.string("role", 60);
    t.uuid("module_id");
    t.string("owner_mode", 40);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(["tenant_skill_id", "channel", "role", "module_id", "owner_mode"], "tenant_skill_availability_scope_uniq");
    t.index(["tenant_id", "enabled"], "tenant_skill_availability_tenant_enabled_idx");
    t.index(["tenant_skill_id", "enabled"], "tenant_skill_availability_skill_enabled_idx");
  });

  await knex.raw(`
    ALTER TABLE tenant_skill_availability ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_skill_availability FORCE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    CREATE POLICY tenant_skill_availability_tenant_isolation ON tenant_skill_availability
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER tenant_skill_availability_set_updated_at
    BEFORE UPDATE ON tenant_skill_availability
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  const rows = await knex("capability_availability").select("*");
  if (rows.length > 0) {
    await knex("tenant_skill_availability").insert(
      rows.map((row) => ({
        availability_id: row.availability_id,
        tenant_skill_id: row.capability_id,
        tenant_id: row.tenant_id,
        channel: row.channel ?? null,
        role: row.role ?? null,
        module_id: row.module_id ?? null,
        owner_mode: row.owner_mode ?? null,
        enabled: row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    );
  }

  await knex.raw("DROP POLICY IF EXISTS capability_availability_tenant_isolation ON capability_availability");
  await knex.raw("DROP TRIGGER IF EXISTS capability_availability_set_updated_at ON capability_availability");
  await knex.schema.dropTableIfExists("capability_availability");
}
