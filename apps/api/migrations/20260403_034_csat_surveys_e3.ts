import type { Knex } from "knex";

const TABLES = ["csat_surveys", "csat_responses"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("csat_surveys", (t) => {
    t.uuid("survey_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.string("channel_type", 30).notNullable();
    t.string("channel_id", 100).notNullable();
    t.string("status", 20).notNullable().defaultTo("scheduled"); // scheduled | sent | responded | expired | failed
    t.timestamp("scheduled_at", { useTz: true }).notNullable();
    t.timestamp("sent_at", { useTz: true });
    t.timestamp("expires_at", { useTz: true });
    t.string("survey_token", 120).notNullable();
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["tenant_id", "conversation_id"], "csat_surveys_tenant_conversation_uniq");
    t.unique(["survey_token"], "csat_surveys_token_uniq");
    t.index(["tenant_id", "status", "scheduled_at"], "csat_surveys_tenant_status_scheduled_idx");
  });

  await knex.schema.createTable("csat_responses", (t) => {
    t.uuid("response_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("survey_id").notNullable().references("survey_id").inTable("csat_surveys").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.integer("rating").notNullable();
    t.text("feedback");
    t.string("source", 20).notNullable().defaultTo("customer"); // customer | import
    t.timestamp("responded_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.unique(["survey_id"], "csat_responses_survey_uniq");
    t.index(["tenant_id", "rating", "responded_at"], "csat_responses_tenant_rating_responded_idx");
    t.index(["tenant_id", "agent_id", "responded_at"], "csat_responses_tenant_agent_responded_idx");
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
  await knex.schema.dropTableIfExists("csat_responses");
  await knex.schema.dropTableIfExists("csat_surveys");
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
