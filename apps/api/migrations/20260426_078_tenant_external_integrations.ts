import type { Knex } from "knex";

type AIConfigRow = {
  config_id: string;
  tenant_id: string;
  quotas: unknown;
};

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...(parsed as Record<string, unknown>) };
    } catch {
      return {};
    }
  }
  return {};
}

function extractIntegrationConfig(
  quotas: Record<string, unknown>,
  key: "lookup_order" | "track_shipment"
): { endpoint?: string; apiKey?: string; timeout?: number } | null {
  const integrations = parseObject(quotas.integrations);
  const block = parseObject(integrations[key]);
  if (Object.keys(block).length === 0) return null;

  const endpoint = typeof block.endpoint === "string" && block.endpoint.trim() ? block.endpoint.trim() : undefined;
  const apiKey = typeof block.apiKey === "string" && block.apiKey.trim() ? block.apiKey.trim() : undefined;
  const timeout = typeof block.timeout === "number" && Number.isFinite(block.timeout) ? Math.max(500, Math.min(30000, Math.round(block.timeout))) : undefined;
  if (!endpoint && !apiKey && timeout === undefined) return null;
  return { endpoint, apiKey, timeout };
}

function scrubSkillIntegrations(quotas: Record<string, unknown>) {
  const integrations = parseObject(quotas.integrations);
  delete integrations.lookup_order;
  delete integrations.track_shipment;
  quotas.integrations = integrations;
  return quotas;
}

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_external_integrations");
  if (!exists) {
    await knex.schema.createTable("tenant_external_integrations", (t) => {
      t.uuid("integration_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("integration_key", 64).notNullable();
      t.text("endpoint");
      t.text("api_key");
      t.integer("timeout_ms").notNullable().defaultTo(5000);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.unique(["tenant_id", "integration_key"], "tenant_external_integrations_tenant_key_uniq");
      t.index(["tenant_id", "integration_key"], "tenant_external_integrations_tenant_key_idx");
      t.index(["tenant_id", "is_active"], "tenant_external_integrations_tenant_active_idx");
    });

    await knex.raw(`
      ALTER TABLE tenant_external_integrations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_external_integrations FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_external_integrations_tenant_isolation ON tenant_external_integrations
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    `);

    await knex.raw(`
      CREATE TRIGGER tenant_external_integrations_set_updated_at
      BEFORE UPDATE ON tenant_external_integrations
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  const rows = await knex<AIConfigRow>("ai_configs")
    .select("config_id", "tenant_id", "quotas")
    .orderBy([{ column: "tenant_id", order: "asc" }, { column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }]);

  const seenTenants = new Set<string>();
  for (const row of rows) {
    if (seenTenants.has(row.tenant_id)) continue;
    seenTenants.add(row.tenant_id);
    const quotas = parseObject(row.quotas);

    for (const key of ["lookup_order", "track_shipment"] as const) {
      const integration = extractIntegrationConfig(quotas, key);
      if (!integration) continue;
      await knex("tenant_external_integrations")
        .insert({
          tenant_id: row.tenant_id,
          integration_key: key,
          endpoint: integration.endpoint ?? null,
          api_key: integration.apiKey ?? null,
          timeout_ms: integration.timeout ?? 5000,
          is_active: true
        })
        .onConflict(["tenant_id", "integration_key"])
        .merge({
          endpoint: integration.endpoint ?? null,
          api_key: integration.apiKey ?? null,
          timeout_ms: integration.timeout ?? 5000,
          is_active: true,
          updated_at: knex.fn.now()
        });
    }
  }

  for (const row of rows) {
    const quotas = scrubSkillIntegrations(parseObject(row.quotas));
    await knex("ai_configs")
      .where({ config_id: row.config_id })
      .update({ quotas: JSON.stringify(quotas), updated_at: knex.fn.now() });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS tenant_external_integrations_set_updated_at ON tenant_external_integrations");
  await knex.raw("DROP POLICY IF EXISTS tenant_external_integrations_tenant_isolation ON tenant_external_integrations");
  await knex.schema.dropTableIfExists("tenant_external_integrations");
}
