import type { Knex } from "knex";

/**
 * Migration 022 — ai_traces
 *
 * Stores one row per AI orchestrator turn.  Each row captures the full
 * "reasoning chain" for that turn: which model was used, what steps were
 * executed (intent, tool calls, final reply), which skills were invoked,
 * token consumption, wall-clock duration, and the handoff reason (if any).
 *
 * NOTE: routing.worker.ts already inserted into this table before this
 * migration was authored, so the table may already exist with a partial
 * schema.  This migration is therefore written to be fully idempotent:
 *   • Creates the table only if it does not yet exist.
 *   • Adds any columns that may be missing (e.g. `error`).
 *   • Enables RLS and creates the policy only if they don't exist yet.
 *
 * Consumed by:
 *   • routing.worker  — writes a trace row after every orchestrator run
 *   • GET /api/conversations/:id/ai-traces — agent workspace copilot panel
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("ai_traces");

  if (!exists) {
    // ── Fresh install: create the full table ──────────────────────────────────
    await knex.schema.createTable("ai_traces", (t) => {
      t.uuid("trace_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));

      t.uuid("tenant_id")
        .notNullable()
        .references("tenant_id")
        .inTable("tenants")
        .onDelete("CASCADE");

      // Nullable — trace survives conversation deletion
      t.uuid("conversation_id")
        .references("conversation_id")
        .inTable("conversations")
        .onDelete("SET NULL");

      t.string("supervisor", 50).notNullable().defaultTo("orchestrator");

      // Structured steps array
      t.jsonb("steps").notNullable().defaultTo("[]");

      // Flat list of skill names that were executed
      t.jsonb("skills_called").notNullable().defaultTo("[]");

      // Token breakdown: { prompt: N, completion: N, total: N }
      t.jsonb("token_usage").notNullable().defaultTo('{"prompt":0,"completion":0,"total":0}');

      // Wall-clock time for the full orchestrator run (ms)
      t.integer("total_duration_ms").notNullable().defaultTo(0);

      // Populated when the turn resulted in a handoff
      t.text("handoff_reason");

      // Non-null when the orchestrator threw an exception
      t.text("error");

      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.index(["tenant_id", "conversation_id"], "ai_traces_conversation_idx");
      t.index(["tenant_id", "created_at"], "ai_traces_tenant_created_idx");
    });
  } else {
    // ── Table already exists: add any missing columns ─────────────────────────
    await knex.schema.table("ai_traces", async (t) => {
      const checks = await Promise.all([
        knex.schema.hasColumn("ai_traces", "supervisor"),
        knex.schema.hasColumn("ai_traces", "steps"),
        knex.schema.hasColumn("ai_traces", "skills_called"),
        knex.schema.hasColumn("ai_traces", "token_usage"),
        knex.schema.hasColumn("ai_traces", "total_duration_ms"),
        knex.schema.hasColumn("ai_traces", "handoff_reason"),
        knex.schema.hasColumn("ai_traces", "error")
      ]);

      const [hasSupervisor, hasSteps, hasSkillsCalled, hasTokenUsage, hasDuration, hasHandoff, hasError] = checks;

      if (!hasSupervisor)   t.string("supervisor", 50).notNullable().defaultTo("orchestrator");
      if (!hasSteps)        t.jsonb("steps").notNullable().defaultTo("[]");
      if (!hasSkillsCalled) t.jsonb("skills_called").notNullable().defaultTo("[]");
      if (!hasTokenUsage)   t.jsonb("token_usage").notNullable().defaultTo('{"prompt":0,"completion":0,"total":0}');
      if (!hasDuration)     t.integer("total_duration_ms").notNullable().defaultTo(0);
      if (!hasHandoff)      t.text("handoff_reason");
      if (!hasError)        t.text("error");
    });

    // Add indexes if missing (wrapped in DO block to be idempotent)
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

  // ── Row-Level Security (idempotent) ────────────────────────────────────────
  await knex.raw("ALTER TABLE ai_traces ENABLE ROW LEVEL SECURITY");
  await knex.raw(`
    DO $$ BEGIN
      CREATE POLICY ai_traces_tenant_isolation ON ai_traces
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS ai_traces_tenant_isolation ON ai_traces");
  await knex.schema.dropTableIfExists("ai_traces");
}
