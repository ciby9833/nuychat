import type { Knex } from "knex";

async function dropLegacyTables(knex: Knex) {
  await knex.raw("DROP POLICY IF EXISTS customer_state_snapshots_tenant_isolation ON customer_state_snapshots");
  await knex.raw("DROP POLICY IF EXISTS customer_memory_items_tenant_isolation ON customer_memory_items");
  await knex.raw("DROP POLICY IF EXISTS customer_profiles_tenant_isolation ON customer_profiles");
  await knex.raw("DROP POLICY IF EXISTS conversation_intelligence_tenant_isolation ON conversation_intelligence");

  await knex.raw("DROP TRIGGER IF EXISTS customer_state_snapshots_set_updated_at ON customer_state_snapshots");
  await knex.raw("DROP TRIGGER IF EXISTS customer_memory_items_set_updated_at ON customer_memory_items");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profiles_refresh_search_vector ON customer_profiles");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profiles_set_updated_at ON customer_profiles");
  await knex.raw("DROP TRIGGER IF EXISTS conversation_intelligence_set_updated_at ON conversation_intelligence");

  await knex.raw("DROP FUNCTION IF EXISTS refresh_customer_profiles_search_vector()");
  await knex.raw("DROP INDEX IF EXISTS customer_profiles_search_vector_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_profiles_dirty_claim_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_profiles_lookup_idx");
  await knex.raw("DROP INDEX IF EXISTS conversation_intelligence_customer_idx");
  await knex.raw("DROP INDEX IF EXISTS conversation_intelligence_case_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_memory_items_customer_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_memory_items_conversation_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_memory_items_case_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_state_snapshots_lookup_idx");

  await knex.schema.dropTableIfExists("customer_state_snapshots");
  await knex.schema.dropTableIfExists("customer_memory_items");
  await knex.schema.dropTableIfExists("customer_profiles");
  await knex.schema.dropTableIfExists("conversation_intelligence");
}

export async function up(knex: Knex): Promise<void> {
  await dropLegacyTables(knex);

  await knex.schema.createTable("conversation_memory_snapshots", (t) => {
    t.uuid("snapshot_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.text("summary").notNullable().defaultTo("");
    t.string("intent", 80).notNullable().defaultTo("general_inquiry");
    t.string("sentiment", 20).notNullable().defaultTo("neutral");
    t.integer("message_count").notNullable().defaultTo(0);
    t.text("last_customer_goal");
    t.text("last_resolution");
    t.jsonb("open_questions").notNullable().defaultTo("[]");
    t.jsonb("key_entities").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "conversation_id"], { useConstraint: true });
    t.index(["tenant_id", "customer_id", "updated_at"], "conversation_memory_snapshots_customer_idx");
    t.index(["tenant_id", "case_id", "updated_at"], "conversation_memory_snapshots_case_idx");
  });

  await knex.raw(`
    ALTER TABLE conversation_memory_snapshots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_memory_snapshots FORCE ROW LEVEL SECURITY;
    CREATE POLICY conversation_memory_snapshots_tenant_isolation ON conversation_memory_snapshots
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER conversation_memory_snapshots_set_updated_at
    BEFORE UPDATE ON conversation_memory_snapshots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("customer_memory_profiles", (t) => {
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
  });

  await knex.raw(`
    ALTER TABLE customer_memory_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_memory_profiles FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_memory_profiles_tenant_isolation ON customer_memory_profiles
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_memory_profiles_set_updated_at
    BEFORE UPDATE ON customer_memory_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`ALTER TABLE customer_memory_profiles ADD COLUMN search_vector tsvector`);
  await knex.raw(`
    CREATE FUNCTION refresh_customer_memory_profiles_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        to_tsvector('simple', coalesce(NEW.profile_summary, '') || ' ' || coalesce(NEW.profile_keywords, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER customer_memory_profiles_refresh_search_vector
    BEFORE INSERT OR UPDATE OF profile_summary, profile_keywords
    ON customer_memory_profiles
    FOR EACH ROW EXECUTE FUNCTION refresh_customer_memory_profiles_search_vector();
  `);
  await knex.raw(`
    CREATE INDEX customer_memory_profiles_search_vector_idx
    ON customer_memory_profiles USING GIN (search_vector)
  `);
  await knex.raw(`
    CREATE INDEX customer_memory_profiles_dirty_claim_idx
    ON customer_memory_profiles (dirty, source_version, indexed_version, source_updated_at, claimed_at)
  `);

  await knex.schema.createTable("customer_memory_units", (t) => {
    t.uuid("memory_unit_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.uuid("task_id").references("task_id").inTable("async_tasks").onDelete("SET NULL");
    t.string("scope_type", 20).notNullable().defaultTo("customer");
    t.string("memory_type", 80).notNullable();
    t.string("abstraction", 30).notNullable().defaultTo("semantic");
    t.string("title", 200);
    t.text("summary").notNullable().defaultTo("");
    t.text("detail");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.string("source", 40).notNullable();
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0.7);
    t.integer("salience").notNullable().defaultTo(50);
    t.string("status", 20).notNullable().defaultTo("active");
    t.string("fingerprint", 64).notNullable();
    t.text("embedding_input").notNullable().defaultTo("");
    t.string("index_status", 20).notNullable().defaultTo("pending");
    t.timestamp("indexed_at", { useTz: true });
    t.timestamp("valid_from", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "fingerprint"], { useConstraint: true });
  });

  await knex.raw(`
    ALTER TABLE customer_memory_units ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_memory_units FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_memory_units_tenant_isolation ON customer_memory_units
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_memory_units_set_updated_at
    BEFORE UPDATE ON customer_memory_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`ALTER TABLE customer_memory_units ADD COLUMN search_vector tsvector`);
  await knex.raw(`
    CREATE FUNCTION refresh_customer_memory_units_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        to_tsvector(
          'simple',
          coalesce(NEW.title, '') || ' ' || coalesce(NEW.summary, '') || ' ' || coalesce(NEW.detail, '') || ' ' || coalesce(NEW.embedding_input, '')
        );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER customer_memory_units_refresh_search_vector
    BEFORE INSERT OR UPDATE OF title, summary, detail, embedding_input
    ON customer_memory_units
    FOR EACH ROW EXECUTE FUNCTION refresh_customer_memory_units_search_vector();
  `);
  await knex.raw(`
    CREATE INDEX customer_memory_units_search_vector_idx
    ON customer_memory_units USING GIN (search_vector)
  `);
  await knex.raw(`
    CREATE INDEX customer_memory_units_lookup_idx
    ON customer_memory_units (tenant_id, customer_id, status, salience, updated_at)
  `);
  await knex.raw(`
    CREATE INDEX customer_memory_units_scope_idx
    ON customer_memory_units (tenant_id, conversation_id, case_id, task_id)
  `);

  await knex.schema.createTable("customer_memory_states", (t) => {
    t.uuid("state_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.string("state_type", 60).notNullable();
    t.text("summary").notNullable().defaultTo("");
    t.jsonb("state_payload").notNullable().defaultTo("{}");
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0.8);
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("freshness_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "customer_id", "state_type"], { useConstraint: true });
  });

  await knex.raw(`
    ALTER TABLE customer_memory_states ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customer_memory_states FORCE ROW LEVEL SECURITY;
    CREATE POLICY customer_memory_states_tenant_isolation ON customer_memory_states
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER customer_memory_states_set_updated_at
    BEFORE UPDATE ON customer_memory_states
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE INDEX customer_memory_states_lookup_idx
    ON customer_memory_states (tenant_id, customer_id, state_type, updated_at)
  `);
}

export async function down(): Promise<void> {
  throw new Error("Customer memory v2 is destructive and rollback is intentionally unsupported.");
}
