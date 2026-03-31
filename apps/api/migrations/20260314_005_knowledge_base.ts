/**
 * Migration 005 — Knowledge Base
 *
 * Creates `knowledge_base_entries` with full-text search support.
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Table ────────────────────────────────────────────────────────────────────
  await knex.schema.createTable("knowledge_base_entries", (t) => {
    t.uuid("entry_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("category", 50).notNullable().defaultTo("general");
    t.string("title", 200).notNullable();
    t.text("content").notNullable();
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("hit_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(["tenant_id", "category", "is_active"], "kb_tenant_category_idx");
  });

  // RLS
  await knex.raw(`
    ALTER TABLE knowledge_base_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knowledge_base_entries FORCE ROW LEVEL SECURITY;
    CREATE POLICY knowledge_base_entries_tenant_isolation ON knowledge_base_entries
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // updated_at trigger
  await knex.raw(`
    CREATE TRIGGER knowledge_base_entries_set_updated_at
    BEFORE UPDATE ON knowledge_base_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── Full-text search index via tsvector ──────────────────────────────────────
  await knex.raw(`
    ALTER TABLE knowledge_base_entries
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
      ) STORED;

    CREATE INDEX knowledge_base_entries_fts_idx
      ON knowledge_base_entries
      USING GIN (search_vector);
  `);

}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS knowledge_base_entries_set_updated_at ON knowledge_base_entries");
  await knex.raw("DROP POLICY IF EXISTS knowledge_base_entries_tenant_isolation ON knowledge_base_entries");
  await knex.schema.dropTableIfExists("knowledge_base_entries");
}
