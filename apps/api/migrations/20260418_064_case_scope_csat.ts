import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("csat_surveys", (table) => {
    table.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("CASCADE");
  });

  await knex.schema.alterTable("csat_responses", (table) => {
    table.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("CASCADE");
  });

  await knex.raw(`
    UPDATE csat_surveys AS s
    SET case_id = COALESCE(
      c.current_case_id,
      (
        SELECT cc.case_id
        FROM conversation_cases AS cc
        WHERE cc.tenant_id = s.tenant_id
          AND cc.conversation_id = s.conversation_id
        ORDER BY
          CASE WHEN cc.status IN ('open', 'in_progress', 'waiting_customer', 'waiting_internal') THEN 0 ELSE 1 END,
          cc.last_activity_at DESC,
          cc.opened_at DESC
        LIMIT 1
      )
    )
    FROM conversations AS c
    WHERE c.conversation_id = s.conversation_id
      AND s.case_id IS NULL
  `);

  await knex.raw(`
    UPDATE csat_responses AS r
    SET case_id = COALESCE(
      (
        SELECT s.case_id
        FROM csat_surveys AS s
        WHERE s.survey_id = r.survey_id
      ),
      (
        SELECT c.current_case_id
        FROM conversations AS c
        WHERE c.conversation_id = r.conversation_id
      ),
      (
        SELECT cc.case_id
        FROM conversation_cases AS cc
        WHERE cc.tenant_id = r.tenant_id
          AND cc.conversation_id = r.conversation_id
        ORDER BY
          CASE WHEN cc.status IN ('open', 'in_progress', 'waiting_customer', 'waiting_internal') THEN 0 ELSE 1 END,
          cc.last_activity_at DESC,
          cc.opened_at DESC
        LIMIT 1
      )
    )
    WHERE r.case_id IS NULL
  `);

  await knex.raw(`
    DELETE FROM csat_surveys AS older
    USING csat_surveys AS newer
    WHERE older.tenant_id = newer.tenant_id
      AND older.case_id = newer.case_id
      AND older.survey_id <> newer.survey_id
      AND older.case_id IS NOT NULL
      AND older.created_at < newer.created_at
  `);

  await knex.schema.alterTable("csat_surveys", (table) => {
    table.uuid("case_id").notNullable().alter();
  });

  await knex.schema.alterTable("csat_responses", (table) => {
    table.uuid("case_id").notNullable().alter();
  });

  await knex.raw(`ALTER TABLE csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_tenant_conversation_uniq`);
  await knex.raw(`CREATE UNIQUE INDEX csat_surveys_tenant_case_uniq ON csat_surveys (tenant_id, case_id)`);
  await knex.raw(`CREATE INDEX csat_surveys_tenant_case_scheduled_idx ON csat_surveys (tenant_id, case_id, scheduled_at DESC)`);
  await knex.raw(`CREATE INDEX csat_responses_tenant_case_responded_idx ON csat_responses (tenant_id, case_id, responded_at DESC)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS csat_responses_tenant_case_responded_idx`);
  await knex.raw(`DROP INDEX IF EXISTS csat_surveys_tenant_case_scheduled_idx`);
  await knex.raw(`DROP INDEX IF EXISTS csat_surveys_tenant_case_uniq`);
  await knex.raw(`
    ALTER TABLE csat_surveys
    ADD CONSTRAINT csat_surveys_tenant_conversation_uniq UNIQUE (tenant_id, conversation_id)
  `);

  await knex.schema.alterTable("csat_responses", (table) => {
    table.dropColumn("case_id");
  });
  await knex.schema.alterTable("csat_surveys", (table) => {
    table.dropColumn("case_id");
  });
}
