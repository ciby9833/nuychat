import type { Knex } from "knex";

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function buildMetadataYaml(input: { code: string; name: string; description?: string | null }) {
  return [
    `code: ${input.code}`,
    `name: ${input.name}`,
    `description: ${input.description ?? ""}`
  ].join("\n");
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("capabilities", (t) => {
    t.uuid("capability_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 120).notNullable();
    t.string("name", 160).notNullable();
    t.text("description");
    t.string("category", 80).notNullable().defaultTo("general");
    t.string("status", 32).notNullable().defaultTo("draft");
    t.timestamps(true, true);

    t.unique(["tenant_id", "code"], "capabilities_tenant_code_uniq");
    t.index(["tenant_id", "status"], "capabilities_tenant_status_idx");
  });

  await knex.schema.createTable("capability_versions", (t) => {
    t.uuid("version_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("capability_id").notNullable().references("capability_id").inTable("capabilities").onDelete("CASCADE");
    t.integer("version_no").notNullable().defaultTo(1);
    t.text("metadata_yaml").notNullable().defaultTo("");
    t.text("skill_md").notNullable().defaultTo("");
    t.jsonb("input_schema_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("output_schema_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.text("change_log");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["capability_id", "version_no"], "capability_versions_capability_version_uniq");
    t.index(["capability_id", "version_no"], "capability_versions_capability_version_idx");
  });

  await knex.schema.createTable("capability_resources", (t) => {
    t.uuid("resource_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("version_id").notNullable().references("version_id").inTable("capability_versions").onDelete("CASCADE");
    t.string("name", 240).notNullable();
    t.string("resource_type", 40).notNullable().defaultTo("text");
    t.text("content").notNullable().defaultTo("");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["version_id", "resource_type"], "capability_resources_version_type_idx");
  });

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

  await knex.schema.createTable("capability_execution_logs", (t) => {
    t.uuid("log_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("capability_id").references("capability_id").inTable("capabilities").onDelete("SET NULL");
    t.uuid("connector_id").references("connector_id").inTable("connectors").onDelete("SET NULL");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.jsonb("input_payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("output_payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.string("status", 32).notNullable().defaultTo("planned");
    t.text("error_message");
    t.integer("duration_ms");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "capability_id", "created_at"], "capability_execution_logs_tenant_capability_idx");
  });

  for (const table of [
    "capabilities",
    "capability_versions",
    "capability_resources",
    "connectors",
    "connector_versions",
    "capability_connector_bindings",
    "connector_secret_bindings",
    "capability_execution_logs"
  ]) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    `);
  }

  await knex.raw(`
    CREATE POLICY capabilities_tenant_isolation ON capabilities
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE POLICY capability_versions_tenant_isolation ON capability_versions
      USING (capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id()))
      WITH CHECK (capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY capability_resources_tenant_isolation ON capability_resources
      USING (version_id IN (
        SELECT version_id
        FROM capability_versions
        WHERE capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id())
      ))
      WITH CHECK (version_id IN (
        SELECT version_id
        FROM capability_versions
        WHERE capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id())
      ));
  `);
  await knex.raw(`
    CREATE POLICY connectors_tenant_isolation ON connectors
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE POLICY connector_versions_tenant_isolation ON connector_versions
      USING (connector_id IN (SELECT connector_id FROM connectors WHERE tenant_id = current_tenant_id()))
      WITH CHECK (connector_id IN (SELECT connector_id FROM connectors WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY capability_connector_bindings_tenant_isolation ON capability_connector_bindings
      USING (capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id()))
      WITH CHECK (capability_id IN (SELECT capability_id FROM capabilities WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY connector_secret_bindings_tenant_isolation ON connector_secret_bindings
      USING (connector_id IN (SELECT connector_id FROM connectors WHERE tenant_id = current_tenant_id()))
      WITH CHECK (connector_id IN (SELECT connector_id FROM connectors WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY capability_execution_logs_tenant_isolation ON capability_execution_logs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  for (const table of [
    "capabilities",
    "connectors",
    "capability_connector_bindings"
  ]) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  const tenantSkills = await knex("tenant_skills").select("*");
  const capabilityVersionMap = new Map<string, string>();

  for (const skill of tenantSkills) {
    await knex("capabilities").insert({
      capability_id: skill.tenant_skill_id,
      tenant_id: skill.tenant_id,
      code: skill.slug,
      name: skill.name,
      description: skill.description ?? null,
      category: String((skill.execution_strategy as Record<string, unknown> | null)?.category ?? "general"),
      status: skill.status,
      created_at: skill.created_at,
      updated_at: skill.updated_at
    });

    const skillMdAsset = await knex("tenant_skill_assets")
      .where({ tenant_skill_id: skill.tenant_skill_id, asset_type: "skill_md" })
      .first();

    const [versionRow] = await knex("capability_versions")
      .insert({
        capability_id: skill.tenant_skill_id,
        version_no: 1,
        metadata_yaml: buildMetadataYaml({
          code: skill.slug,
          name: skill.name,
          description: skill.description ?? null
        }),
        skill_md: typeof skillMdAsset?.content === "string" ? skillMdAsset.content : "",
        input_schema_json: skill.input_schema ?? {},
        output_schema_json: skill.output_schema ?? {},
        change_log: "Initial migration from tenant_skills"
      })
      .returning(["version_id"]);

    capabilityVersionMap.set(skill.tenant_skill_id, versionRow.version_id);

    const resources = await knex("tenant_skill_assets")
      .where({ tenant_skill_id: skill.tenant_skill_id, asset_type: "resource" })
      .select("*");

    for (const resource of resources) {
      await knex("capability_resources").insert({
        version_id: versionRow.version_id,
        name: resource.path ?? "resource.txt",
        resource_type: "text",
        content: typeof resource.content === "string" ? resource.content : "",
        created_at: resource.created_at
      });
    }
  }

  const bindings = await knex("tenant_skill_bindings as b")
    .join("tenant_skills as s", "s.tenant_skill_id", "b.tenant_skill_id")
    .select("b.*", "s.tenant_id", "s.slug");

  for (const binding of bindings) {
    const connectorId = binding.binding_id;
    const connectorCode = String(binding.binding_key || `${binding.slug}-${binding.binding_type}`);

    await knex("connectors").insert({
      connector_id: connectorId,
      tenant_id: binding.tenant_id,
      code: connectorCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
      name: binding.binding_key || binding.binding_type,
      type: binding.binding_type,
      status: binding.enabled ? "active" : "inactive",
      created_at: binding.created_at,
      updated_at: binding.updated_at
    });

    const [connectorVersion] = await knex("connector_versions")
      .insert({
        connector_id: connectorId,
        version_no: 1,
        method: null,
        base_url: null,
        path_template: null,
        content_type: null,
        request_mapping_json: binding.binding_config ?? {},
        response_mapping_json: {},
        signer_type: null,
        signer_config_json: {}
      })
      .returning(["version_id"]);

    await knex("capability_connector_bindings").insert({
      binding_id: connectorId,
      capability_id: binding.tenant_skill_id,
      connector_id: connectorId,
      connector_version_id: connectorVersion.version_id,
      is_default: true,
      enabled: binding.enabled,
      created_at: binding.created_at,
      updated_at: binding.updated_at
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("capability_execution_logs");
  await knex.schema.dropTableIfExists("connector_secret_bindings");
  await knex.schema.dropTableIfExists("capability_connector_bindings");
  await knex.schema.dropTableIfExists("connector_versions");
  await knex.schema.dropTableIfExists("connectors");
  await knex.schema.dropTableIfExists("capability_resources");
  await knex.schema.dropTableIfExists("capability_versions");
  await knex.schema.dropTableIfExists("capabilities");
}
