import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("ai_traces");
  if (!exists) return;

  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS supervisor varchar(50) NOT NULL DEFAULT 'orchestrator'");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS skills_called jsonb NOT NULL DEFAULT '[]'::jsonb");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS token_usage jsonb NOT NULL DEFAULT '{\"prompt\":0,\"completion\":0,\"total\":0}'::jsonb");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS total_duration_ms integer NOT NULL DEFAULT 0");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS handoff_reason text");
  await knex.raw("ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS error text");

  await knex.raw(`
    DO $$ BEGIN
      CREATE INDEX ai_traces_conversation_idx ON ai_traces (tenant_id, conversation_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE INDEX ai_traces_tenant_created_idx ON ai_traces (tenant_id, created_at);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$
  `);
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("ai_traces");
  if (!exists) return;
  await knex.raw("ALTER TABLE ai_traces DROP COLUMN IF EXISTS error");
}
