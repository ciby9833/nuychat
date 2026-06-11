/**
 * Migration 115 — Knowledge Base Quality Signals
 *
 * Adds feedback-tracking columns to knowledge_base_entries:
 *  - needs_review         : flagged for admin review (set automatically when negative_feedback_count >= 3)
 *  - negative_feedback_count : how many times a user indicated this entry was unhelpful
 *  - last_used_at         : timestamp of last time this entry was served to an LLM
 *  - last_flagged_at      : timestamp when needs_review was last set to true
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("knowledge_base_entries", (t) => {
    t.boolean("needs_review").notNullable().defaultTo(false);
    t.integer("negative_feedback_count").notNullable().defaultTo(0);
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.timestamp("last_flagged_at", { useTz: true }).nullable();
  });

  // Index for admin review queue
  await knex.raw(
    `CREATE INDEX kb_needs_review_idx ON knowledge_base_entries (tenant_id, needs_review) WHERE needs_review = true`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS kb_needs_review_idx");
  await knex.schema.alterTable("knowledge_base_entries", (t) => {
    t.dropColumn("needs_review");
    t.dropColumn("negative_feedback_count");
    t.dropColumn("last_used_at");
    t.dropColumn("last_flagged_at");
  });
}
