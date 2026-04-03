import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasDefinitions = await knex.schema.hasTable("sla_definitions");
  if (hasDefinitions) {
    const hasTarget = await knex.schema.hasColumn("sla_definitions", "subsequent_response_target_sec");
    if (!hasTarget) {
      await knex.schema.alterTable("sla_definitions", (table) => {
        table.integer("subsequent_response_target_sec").nullable();
      });
    }
  }

  const hasPolicies = await knex.schema.hasTable("sla_trigger_policies");
  if (hasPolicies) {
    const hasActions = await knex.schema.hasColumn("sla_trigger_policies", "subsequent_response_actions");
    if (!hasActions) {
      await knex.schema.alterTable("sla_trigger_policies", (table) => {
        table.jsonb("subsequent_response_actions").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPolicies = await knex.schema.hasTable("sla_trigger_policies");
  if (hasPolicies) {
    const hasActions = await knex.schema.hasColumn("sla_trigger_policies", "subsequent_response_actions");
    if (hasActions) {
      await knex.schema.alterTable("sla_trigger_policies", (table) => {
        table.dropColumn("subsequent_response_actions");
      });
    }
  }

  const hasDefinitions = await knex.schema.hasTable("sla_definitions");
  if (hasDefinitions) {
    const hasTarget = await knex.schema.hasColumn("sla_definitions", "subsequent_response_target_sec");
    if (hasTarget) {
      await knex.schema.alterTable("sla_definitions", (table) => {
        table.dropColumn("subsequent_response_target_sec");
      });
    }
  }
}
