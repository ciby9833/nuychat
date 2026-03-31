import type { Knex } from "knex";

type IntegrationRow = {
  tenant_id: string;
  integration_key: string;
  endpoint: string | null;
  api_key: string | null;
  timeout_ms: number | null;
};

function mergeConfig(current: unknown, next: Record<string, unknown>) {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : typeof current === "string" && current.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(current) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? parsed as Record<string, unknown>
              : {};
          } catch {
            return {};
          }
        })()
      : {};
  return {
    ...base,
    ...next
  };
}

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_external_integrations");
  if (!exists) return;

  const rows = await knex<IntegrationRow>("tenant_external_integrations")
    .select("tenant_id", "integration_key", "endpoint", "api_key", "timeout_ms");

  for (const row of rows) {
    const binding = await knex("tenant_skill_bindings as b")
      .join("tenant_skills as s", "s.tenant_skill_id", "b.tenant_skill_id")
      .where({
        "s.tenant_id": row.tenant_id,
        "b.binding_key": row.integration_key
      })
      .select("b.binding_id", "b.binding_config")
      .orderBy("b.created_at", "asc")
      .first<{ binding_id: string; binding_config: unknown }>();

    if (!binding) continue;

    const patch = {
      endpoint: row.endpoint ?? undefined,
      apiKey: row.api_key ?? undefined,
      timeout: row.timeout_ms ?? undefined
    };

    await knex("tenant_skill_bindings")
      .where({ binding_id: binding.binding_id })
      .update({
        binding_config: mergeConfig(binding.binding_config, patch),
        updated_at: knex.fn.now()
      });
  }

  await knex.raw("DROP TRIGGER IF EXISTS tenant_external_integrations_set_updated_at ON tenant_external_integrations");
  await knex.raw("DROP POLICY IF EXISTS tenant_external_integrations_tenant_isolation ON tenant_external_integrations");
  await knex.schema.dropTableIfExists("tenant_external_integrations");
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_external_integrations");
  if (exists) return;

  await knex.schema.createTable("tenant_external_integrations", (t) => {
    t.uuid("integration_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("integration_key", 120).notNullable();
    t.string("endpoint", 2000);
    t.text("api_key");
    t.integer("timeout_ms").notNullable().defaultTo(5000);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "integration_key"], "tenant_external_integrations_tenant_key_uniq");
  });
}
