import type { Knex } from "knex";

const TENANT_TABLES = [
  "users",
  "customers",
  "business_units",
  "modules",
  "skill_groups",
  "agent_profiles",
  "agent_skills",
  "conversations",
  "messages"
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.schema.createTable("users", (t) => {
    t.uuid("user_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("email", 200).notNullable();
    t.text("password_hash").notNullable();
    t.string("role", 30).notNullable().defaultTo("agent");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "email"]);
  });

  await knex.schema.createTable("customers", (t) => {
    t.uuid("customer_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("primary_channel", 30).notNullable().defaultTo("whatsapp");
    t.string("external_ref", 200).notNullable();
    t.string("display_name", 200);
    t.string("language", 20).defaultTo("id");
    t.string("timezone", 50).defaultTo("Asia/Jakarta");
    t.string("tier", 30).defaultTo("standard");
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "primary_channel", "external_ref"]);
  });

  await knex.schema.createTable("business_units", (t) => {
    t.uuid("bu_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 50).notNullable();
    t.string("name", 100).notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
  });

  await knex.schema.createTable("modules", (t) => {
    t.uuid("module_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("business_unit_id").references("bu_id").inTable("business_units").onDelete("SET NULL");
    t.string("code", 50).notNullable();
    t.string("name", 100).notNullable();
    t.string("operating_mode", 30).notNullable().defaultTo("ai_first");
    t.text("description");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
  });

  await knex.schema.createTable("skill_groups", (t) => {
    t.uuid("skill_group_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("module_id").notNullable().references("module_id").inTable("modules").onDelete("CASCADE");
    t.string("code", 50).notNullable();
    t.string("name", 100).notNullable();
    t.integer("priority").notNullable().defaultTo(100);
    t.string("routing_strategy", 30).notNullable().defaultTo("least_busy");
    t.integer("max_queue_size").notNullable().defaultTo(1000);
    t.integer("sla_first_response_seconds").notNullable().defaultTo(300);
    t.integer("sla_resolution_seconds").notNullable().defaultTo(86400);
    t.jsonb("channel_filters").notNullable().defaultTo("[]");
    t.jsonb("language_filters").notNullable().defaultTo("[]");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"]);
  });

  await knex.schema.createTable("agent_profiles", (t) => {
    t.uuid("agent_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("user_id").notNullable().references("user_id").inTable("users").onDelete("CASCADE");
    t.string("display_name", 100).notNullable();
    t.string("status", 20).notNullable().defaultTo("offline");
    t.string("seniority_level", 20).notNullable().defaultTo("junior");
    t.jsonb("languages").notNullable().defaultTo("[]");
    t.jsonb("channel_caps").notNullable().defaultTo("[]");
    t.integer("max_concurrency").notNullable().defaultTo(6);
    t.boolean("allow_ai_assist").notNullable().defaultTo(true);
    t.boolean("allow_takeover").notNullable().defaultTo(true);
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "user_id"]);
  });

  await knex.schema.createTable("agent_skills", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("agent_id").notNullable().references("agent_id").inTable("agent_profiles").onDelete("CASCADE");
    t.uuid("skill_group_id").notNullable().references("skill_group_id").inTable("skill_groups").onDelete("CASCADE");
    t.integer("proficiency_level").notNullable().defaultTo(1);
    t.boolean("can_handle_vip").notNullable().defaultTo(false);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["agent_id", "skill_group_id"]);
  });

  await knex.schema.createTable("conversations", (t) => {
    t.uuid("conversation_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.string("channel_type", 30).notNullable();
    t.string("channel_id", 100).notNullable();
    t.string("status", 30).notNullable().defaultTo("open");
    t.string("operating_mode", 30).defaultTo("ai_first");
    t.uuid("assigned_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.timestamp("last_message_at", { useTz: true });
    t.text("last_message_preview");
    t.integer("unread_count").notNullable().defaultTo(0);
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.index(["tenant_id", "customer_id", "channel_id", "status"], "conversations_active_lookup_idx");
  });

  await knex.schema.createTable("messages", (t) => {
    t.uuid("message_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.string("external_id", 200);
    t.string("direction", 10).notNullable();
    t.string("sender_type", 20);
    t.uuid("sender_id");
    t.string("message_type", 30).notNullable();
    t.jsonb("content").notNullable();
    t.timestamp("delivered_at", { useTz: true });
    t.timestamp("read_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "external_id"]);
    t.index(["tenant_id", "conversation_id", "created_at"], "messages_conversation_created_idx");
  });

  for (const table of TENANT_TABLES) {
    await enableTenantRls(knex, table);
  }

  for (const table of ["users", "customers", "business_units", "modules", "skill_groups", "agent_profiles", "agent_skills", "conversations"]) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TENANT_TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
  }

  for (const table of ["users", "customers", "business_units", "modules", "skill_groups", "agent_profiles", "agent_skills", "conversations"]) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }

  await knex.schema.dropTableIfExists("messages");
  await knex.schema.dropTableIfExists("conversations");
  await knex.schema.dropTableIfExists("agent_skills");
  await knex.schema.dropTableIfExists("agent_profiles");
  await knex.schema.dropTableIfExists("skill_groups");
  await knex.schema.dropTableIfExists("modules");
  await knex.schema.dropTableIfExists("business_units");
  await knex.schema.dropTableIfExists("customers");
  await knex.schema.dropTableIfExists("users");
  await knex.raw("DROP FUNCTION IF EXISTS set_updated_at()");
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
