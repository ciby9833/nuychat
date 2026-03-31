import type { Knex } from "knex";

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function mergeActionConfig(input: {
  connectorCode: string;
  connectorType: string;
  connectorVersion: {
    method: string | null;
    base_url: string | null;
    path_template: string | null;
    content_type: string | null;
    request_mapping_json: unknown;
    response_mapping_json: unknown;
    signer_type: string | null;
    signer_config_json: unknown;
  } | null;
  secretRows: Array<{ secret_key: string; secret_ref: string }>;
}) {
  const requestMapping = parseObject(input.connectorVersion?.request_mapping_json);
  const responseMapping = parseObject(input.connectorVersion?.response_mapping_json);
  const signerConfig = parseObject(input.connectorVersion?.signer_config_json);
  const secretValues = Object.fromEntries(input.secretRows.map((row) => [row.secret_key, row.secret_ref]));
  const endpoint =
    (typeof requestMapping.endpoint === "string" && requestMapping.endpoint.trim() ? requestMapping.endpoint.trim() : "")
    || (typeof requestMapping.url === "string" && requestMapping.url.trim() ? requestMapping.url.trim() : "")
    || (typeof input.connectorVersion?.base_url === "string" && input.connectorVersion.base_url.trim() ? input.connectorVersion.base_url.trim() : "");
  const requestMethod =
    (typeof requestMapping.requestMethod === "string" && requestMapping.requestMethod.trim() ? requestMapping.requestMethod.trim().toUpperCase() : "")
    || (typeof requestMapping.method === "string" && requestMapping.method.trim() ? requestMapping.method.trim().toUpperCase() : "")
    || (typeof input.connectorVersion?.method === "string" && input.connectorVersion.method.trim() ? input.connectorVersion.method.trim().toUpperCase() : "");
  const requestPathTemplate =
    (typeof requestMapping.requestPathTemplate === "string" && requestMapping.requestPathTemplate.trim() ? requestMapping.requestPathTemplate.trim() : "")
    || (typeof requestMapping.path === "string" && requestMapping.path.trim() ? requestMapping.path.trim() : "")
    || (typeof input.connectorVersion?.path_template === "string" && input.connectorVersion.path_template.trim() ? input.connectorVersion.path_template.trim() : "");
  const contentType =
    (typeof requestMapping.contentType === "string" && requestMapping.contentType.trim() ? requestMapping.contentType.trim() : "")
    || (typeof input.connectorVersion?.content_type === "string" && input.connectorVersion.content_type.trim() ? input.connectorVersion.content_type.trim() : "");

  if (input.connectorType === "model_runtime") {
    return {
      actionType: "model_runtime",
      model: parseObject(requestMapping.model),
      promptTemplate: typeof requestMapping.promptTemplate === "string" ? requestMapping.promptTemplate : "",
      responseMapping
    };
  }

  return {
    actionType: "http_api",
    endpoint,
    requestMethod: requestMethod || "POST",
    requestPathTemplate,
    contentType: contentType || "application/json",
    staticHeaders: parseObject(requestMapping.staticHeaders).constructor === Object
      ? (Object.keys(parseObject(requestMapping.staticHeaders)).length > 0 ? parseObject(requestMapping.staticHeaders) : parseObject(requestMapping.headers))
      : parseObject(requestMapping.headers),
    queryFields: parseObject(requestMapping.queryFields).constructor === Object
      ? (Object.keys(parseObject(requestMapping.queryFields)).length > 0 ? parseObject(requestMapping.queryFields) : parseObject(requestMapping.query))
      : parseObject(requestMapping.query),
    bodyFields: parseObject(requestMapping.bodyFields).constructor === Object
      ? (Object.keys(parseObject(requestMapping.bodyFields)).length > 0 ? parseObject(requestMapping.bodyFields) : parseObject(requestMapping.body))
      : parseObject(requestMapping.body),
    signerType: input.connectorVersion?.signer_type ?? null,
    signerConfig,
    secretValues,
    responseMapping
  };
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("capability_actions", (t) => {
    t.uuid("action_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("version_id").notNullable().references("version_id").inTable("capability_versions").onDelete("CASCADE");
    t.string("action_key", 160).notNullable();
    t.string("name", 160).notNullable();
    t.string("action_type", 80).notNullable();
    t.boolean("enabled").notNullable().defaultTo(true);
    t.jsonb("config_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["version_id", "action_key"], "capability_actions_version_action_key_uniq");
    t.index(["version_id", "enabled"], "capability_actions_version_enabled_idx");
  });

  await knex.raw(`
    ALTER TABLE capability_actions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE capability_actions FORCE ROW LEVEL SECURITY;
  `);

  await knex.raw(`
    CREATE POLICY capability_actions_tenant_isolation ON capability_actions
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

  const bindings = await knex("capability_connector_bindings as b")
    .join("connectors as c", "c.connector_id", "b.connector_id")
    .join("capabilities as cap", "cap.capability_id", "b.capability_id")
    .select(
      "b.binding_id",
      "b.capability_id",
      "b.connector_version_id",
      "b.enabled",
      "c.connector_id",
      "c.code as connector_code",
      "c.name as connector_name",
      "c.type as connector_type"
    );

  for (const row of bindings) {
    const version = await knex("capability_versions")
      .where({ capability_id: row.capability_id })
      .orderBy([{ column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
      .first();
    if (!version) continue;

    const connectorVersion = row.connector_version_id
      ? await knex("connector_versions").where({ version_id: row.connector_version_id }).first()
      : await knex("connector_versions")
          .where({ connector_id: row.connector_id })
          .orderBy([{ column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
          .first();
    const secretRows = await knex("connector_secret_bindings")
      .where({ connector_id: row.connector_id })
      .select("secret_key", "secret_ref");

    const config = mergeActionConfig({
      connectorCode: row.connector_code,
      connectorType: row.connector_type,
      connectorVersion: connectorVersion ?? null,
      secretRows
    });

    await knex("capability_actions").insert({
      version_id: version.version_id,
      action_key: row.connector_code,
      name: row.connector_name,
      action_type: config.actionType,
      enabled: row.enabled,
      config_json: config
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("capability_actions");
}
