import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tickets", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
  });

  await knex.schema.alterTable("sla_breaches", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
  });

  await knex.schema.alterTable("qa_reviews", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
  });

  await knex.raw(`
    WITH ranked_cases AS (
      SELECT
        cc.tenant_id,
        cc.conversation_id,
        cc.case_id,
        ROW_NUMBER() OVER (
          PARTITION BY cc.tenant_id, cc.conversation_id
          ORDER BY
            CASE WHEN cc.status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END,
            COALESCE(cc.last_activity_at, cc.opened_at, cc.created_at) DESC,
            cc.created_at DESC
        ) AS rn
      FROM conversation_cases cc
    )
    UPDATE tickets t
    SET case_id = rc.case_id
    FROM ranked_cases rc
    WHERE rc.rn = 1
      AND t.tenant_id = rc.tenant_id
      AND t.conversation_id = rc.conversation_id
      AND t.case_id IS NULL
  `);

  await knex.raw(`
    WITH ranked_cases AS (
      SELECT
        cc.tenant_id,
        cc.conversation_id,
        cc.case_id,
        ROW_NUMBER() OVER (
          PARTITION BY cc.tenant_id, cc.conversation_id
          ORDER BY
            CASE WHEN cc.status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END,
            COALESCE(cc.last_activity_at, cc.opened_at, cc.created_at) DESC,
            cc.created_at DESC
        ) AS rn
      FROM conversation_cases cc
    )
    UPDATE sla_breaches b
    SET case_id = rc.case_id
    FROM ranked_cases rc
    WHERE rc.rn = 1
      AND b.tenant_id = rc.tenant_id
      AND b.conversation_id = rc.conversation_id
      AND b.case_id IS NULL
  `);

  await knex.raw(`
    WITH ranked_cases AS (
      SELECT
        cc.tenant_id,
        cc.conversation_id,
        cc.case_id,
        ROW_NUMBER() OVER (
          PARTITION BY cc.tenant_id, cc.conversation_id
          ORDER BY
            CASE WHEN cc.status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END,
            COALESCE(cc.last_activity_at, cc.opened_at, cc.created_at) DESC,
            cc.created_at DESC
        ) AS rn
      FROM conversation_cases cc
    )
    UPDATE qa_reviews qr
    SET case_id = rc.case_id
    FROM ranked_cases rc
    WHERE rc.rn = 1
      AND qr.tenant_id = rc.tenant_id
      AND qr.conversation_id = rc.conversation_id
      AND qr.case_id IS NULL
  `);

  await knex.schema.alterTable("tickets", (t) => {
    t.index(["tenant_id", "case_id"], "tickets_case_idx");
  });

  await knex.schema.alterTable("sla_breaches", (t) => {
    t.index(["tenant_id", "case_id", "created_at"], "sla_breaches_tenant_case_created_idx");
  });

  await knex.raw(`ALTER TABLE qa_reviews DROP CONSTRAINT IF EXISTS qa_reviews_tenant_conversation_uniq`);
  await knex.raw(`
    CREATE UNIQUE INDEX qa_reviews_tenant_case_uniq
    ON qa_reviews (tenant_id, case_id)
    WHERE case_id IS NOT NULL
  `);
  await knex.schema.alterTable("qa_reviews", (t) => {
    t.index(["tenant_id", "case_id", "created_at"], "qa_reviews_tenant_case_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("qa_reviews", (t) => {
    t.dropIndex(["tenant_id", "case_id", "created_at"], "qa_reviews_tenant_case_created_idx");
  });
  await knex.raw(`DROP INDEX IF EXISTS qa_reviews_tenant_case_uniq`);
  await knex.raw(`
    ALTER TABLE qa_reviews
    ADD CONSTRAINT qa_reviews_tenant_conversation_uniq UNIQUE (tenant_id, conversation_id)
  `);

  await knex.schema.alterTable("sla_breaches", (t) => {
    t.dropIndex(["tenant_id", "case_id", "created_at"], "sla_breaches_tenant_case_created_idx");
  });

  await knex.schema.alterTable("tickets", (t) => {
    t.dropIndex(["tenant_id", "case_id"], "tickets_case_idx");
  });

  await knex.schema.alterTable("qa_reviews", (t) => {
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("sla_breaches", (t) => {
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("tickets", (t) => {
    t.dropColumn("case_id");
  });
}
