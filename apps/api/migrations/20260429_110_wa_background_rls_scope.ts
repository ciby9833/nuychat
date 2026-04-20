import type { Knex } from "knex";

const WA_BACKGROUND_TABLES = [
  "wa_accounts",
  "wa_account_sessions",
  "wa_baileys_auth_snapshots",
  "wa_outbound_jobs",
  "wa_conversations",
  "wa_message_gaps"
];

function policyName(tableName: string) {
  return `${tableName}_wa_background_scope`;
}

export async function up(knex: Knex): Promise<void> {
  for (const tableName of WA_BACKGROUND_TABLES) {
    await knex.raw(`
      DROP POLICY IF EXISTS ${policyName(tableName)} ON ${tableName};
      CREATE POLICY ${policyName(tableName)} ON ${tableName}
        USING (current_setting('app.wa_background_scope', true) = 'enabled')
        WITH CHECK (current_setting('app.wa_background_scope', true) = 'enabled');
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of WA_BACKGROUND_TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${policyName(tableName)} ON ${tableName}`);
  }
}
