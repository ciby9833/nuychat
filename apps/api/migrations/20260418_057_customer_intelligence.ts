import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("conversation_intelligence", (t) => {
    t.uuid("intelligence_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.text("summary").notNullable().defaultTo("");
    t.string("last_intent", 80).notNullable().defaultTo("general_inquiry");
    t.string("last_sentiment", 20).notNullable().defaultTo("neutral");
    t.integer("message_count").notNullable().defaultTo(0);
    t.jsonb("key_entities").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "conversation_id"], { useConstraint: true });
    t.index(["tenant_id", "customer_id", "updated_at"], "conversation_intelligence_customer_idx");
  });

  await knex.raw(`
    ALTER TABLE conversation_intelligence ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_intelligence FORCE ROW LEVEL SECURITY;
    CREATE POLICY conversation_intelligence_tenant_isolation ON conversation_intelligence
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER conversation_intelligence_set_updated_at
    BEFORE UPDATE ON conversation_intelligence
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("customer_profiles", (t) => {
    t.uuid("profile_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.jsonb("soul_profile").notNullable().defaultTo("{}");
    t.jsonb("operating_notes").notNullable().defaultTo("{}");
    t.jsonb("state_snapshot").notNullable().defaultTo("{}");
    t.text("profile_summary").notNullable().defaultTo("");
    t.text("profile_keywords").notNullable().defaultTo("");
    t.string("last_intent", 80).notNullable().defaultTo("general_inquiry");
    t.string("last_sentiment", 20).notNullable().defaultTo("neutral");
    t.integer("memory_item_count").notNullable().defaultTo(0);
    t.integer("conversation_count").notNullable().defaultTo(0);
    t.integer("source_version").notNullable().defaultTo(1);
    t.integer("indexed_version").notNullable().defaultTo(0);
    t.boolean("dirty").notNullable().defaultTo(true);
    t.text("dirty_reason");
    t.timestamp("source_updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_indexed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("claimed_at", { useTz: true });
    t.string("claimed_by", 120);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "customer_id"], { useConstraint: true });
    t.index(["tenant_id", "last_indexed_at"], "customer_profiles_lookup_idx");
  });

  await knex.raw(`
    ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_profiles FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_profiles_tenant_isolation ON customer_profiles
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_profiles_set_updated_at
    BEFORE UPDATE ON customer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`ALTER TABLE customer_profiles ADD COLUMN search_vector tsvector`);
  await knex.raw(`
    UPDATE customer_profiles
    SET search_vector = to_tsvector('simple', coalesce(profile_summary, '') || ' ' || coalesce(profile_keywords, ''))
  `);
  await knex.raw(`
    CREATE FUNCTION refresh_customer_profiles_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        to_tsvector('simple', coalesce(NEW.profile_summary, '') || ' ' || coalesce(NEW.profile_keywords, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER customer_profiles_refresh_search_vector
    BEFORE INSERT OR UPDATE OF profile_summary, profile_keywords
    ON customer_profiles
    FOR EACH ROW EXECUTE FUNCTION refresh_customer_profiles_search_vector();
  `);
  await knex.raw(`
    CREATE INDEX customer_profiles_dirty_claim_idx
    ON customer_profiles (dirty, source_version, indexed_version, source_updated_at, claimed_at)
  `);
  await knex.raw(`
    CREATE INDEX customer_profiles_search_vector_idx
    ON customer_profiles USING GIN (search_vector)
  `);

  await knex.schema.createTable("customer_memory_items", (t) => {
    t.uuid("memory_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("task_id").references("task_id").inTable("async_tasks").onDelete("SET NULL");
    t.string("memory_type", 60).notNullable();
    t.string("source", 40).notNullable();
    t.string("title", 200);
    t.text("summary").notNullable().defaultTo("");
    t.jsonb("content").notNullable().defaultTo("{}");
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0.7);
    t.integer("salience").notNullable().defaultTo(50);
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("valid_from", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "customer_id", "status"], "customer_memory_items_customer_idx");
    t.index(["tenant_id", "conversation_id", "memory_type"], "customer_memory_items_conversation_idx");
  });

  await knex.raw(`
    ALTER TABLE customer_memory_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_memory_items FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_memory_items_tenant_isolation ON customer_memory_items
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_memory_items_set_updated_at
    BEFORE UPDATE ON customer_memory_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("customer_state_snapshots", (t) => {
    t.uuid("snapshot_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.string("state_type", 60).notNullable();
    t.jsonb("state_payload").notNullable().defaultTo("{}");
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("effective_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "customer_id", "state_type"], { useConstraint: true });
    t.index(["tenant_id", "customer_id", "state_type"], "customer_state_snapshots_lookup_idx");
  });

  await knex.raw(`
    ALTER TABLE customer_state_snapshots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_state_snapshots FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_state_snapshots_tenant_isolation ON customer_state_snapshots
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_state_snapshots_set_updated_at
    BEFORE UPDATE ON customer_state_snapshots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("decision_traces", (t) => {
    t.uuid("trace_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
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
    t.index(["tenant_id", "trace_kind", "created_at"], "decision_traces_kind_created_idx");
    t.index(["tenant_id", "conversation_id", "created_at"], "decision_traces_conversation_idx");
    t.index(["tenant_id", "execution_ref"], "decision_traces_execution_ref_idx");
  });

  await knex.raw(`
    ALTER TABLE decision_traces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE decision_traces FORCE ROW LEVEL SECURITY;
    CREATE POLICY decision_traces_tenant_isolation ON decision_traces
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS decision_traces_tenant_isolation ON decision_traces");
  await knex.schema.dropTableIfExists("decision_traces");

  await knex.raw("DROP TRIGGER IF EXISTS customer_state_snapshots_set_updated_at ON customer_state_snapshots");
  await knex.raw("DROP POLICY IF EXISTS customer_state_snapshots_tenant_isolation ON customer_state_snapshots");
  await knex.schema.dropTableIfExists("customer_state_snapshots");

  await knex.raw("DROP TRIGGER IF EXISTS customer_memory_items_set_updated_at ON customer_memory_items");
  await knex.raw("DROP POLICY IF EXISTS customer_memory_items_tenant_isolation ON customer_memory_items");
  await knex.schema.dropTableIfExists("customer_memory_items");

  await knex.raw("DROP INDEX IF EXISTS customer_profiles_search_vector_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_profiles_dirty_claim_idx");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profiles_refresh_search_vector ON customer_profiles");
  await knex.raw("DROP FUNCTION IF EXISTS refresh_customer_profiles_search_vector()");
  await knex.raw("ALTER TABLE customer_profiles DROP COLUMN IF EXISTS search_vector");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profiles_set_updated_at ON customer_profiles");
  await knex.raw("DROP POLICY IF EXISTS customer_profiles_tenant_isolation ON customer_profiles");
  await knex.schema.dropTableIfExists("customer_profiles");

  await knex.raw("DROP TRIGGER IF EXISTS conversation_intelligence_set_updated_at ON conversation_intelligence");
  await knex.raw("DROP POLICY IF EXISTS conversation_intelligence_tenant_isolation ON conversation_intelligence");
  await knex.schema.dropTableIfExists("conversation_intelligence");
}
