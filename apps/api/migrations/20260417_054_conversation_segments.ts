import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("conversation_segments", (t) => {
    t.uuid("segment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.string("owner_type", 20).notNullable();
    t.uuid("owner_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.uuid("owner_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
    t.string("status", 20).notNullable().defaultTo("active");
    t.string("opened_reason", 80);
    t.string("closed_reason", 80);
    t.uuid("transferred_from_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("ended_at", { useTz: true });
    t.timestamps(true, true);
    t.index(["tenant_id", "conversation_id", "status"], "conversation_segments_tenant_conversation_status_idx");
    t.index(["tenant_id", "owner_type", "status"], "conversation_segments_tenant_owner_type_status_idx");
    t.index(["tenant_id", "owner_agent_id", "started_at"], "conversation_segments_tenant_agent_started_idx");
    t.index(["tenant_id", "owner_ai_agent_id", "started_at"], "conversation_segments_tenant_ai_started_idx");
  });

  await knex.raw(`
    ALTER TABLE conversation_segments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_segments FORCE ROW LEVEL SECURITY;
    CREATE POLICY conversation_segments_tenant_isolation ON conversation_segments
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER conversation_segments_set_updated_at
    BEFORE UPDATE ON conversation_segments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.alterTable("conversations", (t) => {
    t.uuid("current_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    t.index(["tenant_id", "current_segment_id"], "conversations_tenant_current_segment_idx");
  });

  await knex.schema.alterTable("messages", (t) => {
    t.uuid("segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    t.index(["tenant_id", "segment_id", "created_at"], "messages_tenant_segment_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (t) => {
    t.dropIndex(["tenant_id", "segment_id", "created_at"], "messages_tenant_segment_created_idx");
    t.dropColumn("segment_id");
  });

  await knex.schema.alterTable("conversations", (t) => {
    t.dropIndex(["tenant_id", "current_segment_id"], "conversations_tenant_current_segment_idx");
    t.dropColumn("current_segment_id");
  });

  await knex.raw("DROP TRIGGER IF EXISTS conversation_segments_set_updated_at ON conversation_segments");
  await knex.raw("DROP POLICY IF EXISTS conversation_segments_tenant_isolation ON conversation_segments");
  await knex.schema.dropTableIfExists("conversation_segments");
}
