import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasExecutionLogs = await knex.schema.hasTable("capability_execution_logs");
  if (hasExecutionLogs) {
    const hasConnectorId = await knex.schema.hasColumn("capability_execution_logs", "connector_id");
    if (hasConnectorId) {
      await knex.schema.alterTable("capability_execution_logs", (t) => {
        t.dropForeign(["connector_id"]);
        t.dropColumn("connector_id");
      });
    }
  }

  for (const table of [
    "connector_secret_bindings",
    "capability_connector_bindings",
    "connector_versions",
    "connectors"
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("connectors", (t) => {
    t.uuid("connector_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 160).notNullable();
    t.string("name", 160).notNullable();
    t.string("type", 80).notNullable();
    t.string("status", 32).notNullable().defaultTo("active");
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"], "connectors_tenant_code_uniq");
    t.index(["tenant_id", "status"], "connectors_tenant_status_idx");
  });

  await knex.schema.createTable("connector_versions", (t) => {
    t.uuid("version_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("connector_id").notNullable().references("connector_id").inTable("connectors").onDelete("CASCADE");
    t.integer("version_no").notNullable().defaultTo(1);
    t.string("method", 16);
    t.string("base_url", 500);
    t.string("path_template", 500);
    t.string("content_type", 120);
    t.jsonb("request_mapping_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("response_mapping_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.string("signer_type", 80);
    t.jsonb("signer_config_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["connector_id", "version_no"], "connector_versions_connector_version_uniq");
    t.index(["connector_id", "version_no"], "connector_versions_connector_version_idx");
  });

  await knex.schema.createTable("capability_connector_bindings", (t) => {
    t.uuid("binding_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("capability_id").notNullable().references("capability_id").inTable("capabilities").onDelete("CASCADE");
    t.uuid("connector_id").notNullable().references("connector_id").inTable("connectors").onDelete("CASCADE");
    t.uuid("connector_version_id").references("version_id").inTable("connector_versions").onDelete("SET NULL");
    t.boolean("is_default").notNullable().defaultTo(false);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["capability_id", "connector_id"], "capability_connector_bindings_capability_connector_uniq");
    t.index(["capability_id", "enabled"], "capability_connector_bindings_capability_enabled_idx");
    t.index(["connector_id", "enabled"], "capability_connector_bindings_connector_enabled_idx");
  });

  await knex.schema.createTable("connector_secret_bindings", (t) => {
    t.uuid("binding_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("connector_id").notNullable().references("connector_id").inTable("connectors").onDelete("CASCADE");
    t.string("secret_key", 120).notNullable();
    t.string("secret_ref", 240).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["connector_id", "secret_key"], "connector_secret_bindings_connector_key_uniq");
  });

  const hasExecutionLogs = await knex.schema.hasTable("capability_execution_logs");
  if (hasExecutionLogs) {
    const hasConnectorId = await knex.schema.hasColumn("capability_execution_logs", "connector_id");
    if (!hasConnectorId) {
      await knex.schema.alterTable("capability_execution_logs", (t) => {
        t.uuid("connector_id").references("connector_id").inTable("connectors").onDelete("SET NULL");
      });
    }
  }
}
