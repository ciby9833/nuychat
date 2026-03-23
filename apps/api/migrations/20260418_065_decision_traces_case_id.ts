import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("decision_traces", (table) => {
    table.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    table.index(["tenant_id", "case_id", "created_at"], "decision_traces_case_created_idx");
  });

  await knex.raw(`
    UPDATE decision_traces AS dt
    SET case_id = COALESCE(
      NULLIF(dt.input_snapshot ->> 'caseId', ''),
      NULLIF(dt.decision_summary ->> 'caseId', ''),
      c.current_case_id::text,
      (
        SELECT cc.case_id::text
        FROM conversation_cases AS cc
        WHERE cc.tenant_id = dt.tenant_id
          AND cc.conversation_id = dt.conversation_id
        ORDER BY
          CASE WHEN cc.status IN ('open', 'in_progress', 'waiting_customer', 'waiting_internal') THEN 0 ELSE 1 END,
          cc.last_activity_at DESC,
          cc.opened_at DESC
        LIMIT 1
      )
    )::uuid
    FROM conversations AS c
    WHERE c.conversation_id = dt.conversation_id
      AND dt.case_id IS NULL
      AND dt.conversation_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("decision_traces", (table) => {
    table.dropIndex(["tenant_id", "case_id", "created_at"], "decision_traces_case_created_idx");
    table.dropColumn("case_id");
  });
}
