import type { Knex } from "knex";

type TenantRow = {
  tenant_id: string;
  slug: string;
};

export async function up(knex: Knex): Promise<void> {
  const tenants = await knex("tenants").select("tenant_id", "slug") as TenantRow[];

  for (const tenant of tenants) {
    const channelId = tenant.slug === "demo-tenant" ? "demo-web-channel" : `web-${tenant.slug}`;
    const publicChannelKey = tenant.slug === "demo-tenant" ? "demo-web-public" : `wc-${tenant.slug}`;
    const existing = await knex("channel_configs")
      .where({ tenant_id: tenant.tenant_id, channel_type: "web" })
      .first("config_id");

    if (existing) {
      continue;
    }

    await knex("channel_configs")
      .insert({
        tenant_id: tenant.tenant_id,
        channel_type: "web",
        channel_id: channelId,
        encrypted_config: JSON.stringify({
          widgetName: "NuyChat Web",
          publicChannelKey,
          systemProvisioned: true
        }),
        is_active: true
      })
      .onConflict("channel_id")
      .ignore();
  }

  const webChannels = await knex("channel_configs")
    .where({ channel_type: "web" })
    .select("config_id", "tenant_id", "encrypted_config") as Array<{
    config_id: string;
    tenant_id: string;
    encrypted_config: string;
  }>;

  for (const row of webChannels) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(row.encrypted_config);
    } catch {
      config = {};
    }

    if (typeof config.publicChannelKey === "string" && config.publicChannelKey.length > 0) {
      continue;
    }

    const tenant = tenants.find((item) => item.tenant_id === row.tenant_id);
    const fallback = tenant?.slug === "demo-tenant" ? "demo-web-public" : `wc-${tenant?.slug ?? row.config_id.slice(0, 8)}`;
    config.publicChannelKey = fallback;

    await knex("channel_configs")
      .where({ config_id: row.config_id })
      .update({
        encrypted_config: JSON.stringify(config),
        updated_at: knex.fn.now()
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("channel_configs")
    .where({ channel_type: "web" })
    .andWhereRaw("encrypted_config::jsonb ->> 'systemProvisioned' = 'true'")
    .delete();
}
