import type { Knex } from "knex";

const CHANNEL_TYPES = ["web", "whatsapp", "webhook"] as const;

type TenantRow = {
  tenant_id: string;
};

type ChannelRow = {
  config_id: string;
  tenant_id: string;
  channel_type: string;
  channel_id: string;
  encrypted_config: string;
  is_active: boolean;
};

export async function up(knex: Knex): Promise<void> {
  const tenants = await knex("tenants").select("tenant_id") as TenantRow[];

  for (const tenant of tenants) {
    const rows = await knex("channel_configs")
      .where({ tenant_id: tenant.tenant_id })
      .whereIn("channel_type", [...CHANNEL_TYPES])
      .orderBy("created_at", "asc") as ChannelRow[];

    const firstByType = new Map<string, ChannelRow>();
    for (const row of rows) {
      if (!firstByType.has(row.channel_type)) {
        firstByType.set(row.channel_type, row);
        continue;
      }

      await knex("channel_configs").where({ config_id: row.config_id }).delete();
    }

    for (const channelType of CHANNEL_TYPES) {
      if (firstByType.has(channelType)) continue;

      await knex("channel_configs").insert({
        tenant_id: tenant.tenant_id,
        channel_type: channelType,
        channel_id: `${channelType}-${tenant.tenant_id}`,
        encrypted_config: JSON.stringify(buildDefaultChannelConfig(tenant.tenant_id, channelType)),
        is_active: channelType === "web"
      });
    }
  }

  const whatsappRows = await knex("channel_configs")
    .select("config_id", "tenant_id", "encrypted_config")
    .where({ channel_type: "whatsapp" }) as Array<{ config_id: string; tenant_id: string; encrypted_config: string }>;

  const usedVerifyTokens = new Set<string>();
  for (const row of whatsappRows) {
    const config = parseJsonObject(row.encrypted_config);
    const existing = typeof config.verifyToken === "string" ? config.verifyToken.trim() : "";
    const nextVerifyToken = existing && !usedVerifyTokens.has(existing) ? existing : `wa-verify-${row.tenant_id}`;
    usedVerifyTokens.add(nextVerifyToken);

    if (existing === nextVerifyToken) continue;

    config.verifyToken = nextVerifyToken;
    await knex("channel_configs")
      .where({ config_id: row.config_id })
      .update({ encrypted_config: JSON.stringify(config), updated_at: knex.fn.now() });
  }

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_tenant_type
    ON channel_configs (tenant_id, channel_type);
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_whatsapp_verify_token
    ON channel_configs ((encrypted_config::jsonb ->> 'verifyToken'))
    WHERE channel_type = 'whatsapp' AND (encrypted_config::jsonb ->> 'verifyToken') IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_verify_token");
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_tenant_type");
}

function buildDefaultChannelConfig(tenantId: string, channelType: (typeof CHANNEL_TYPES)[number]) {
  if (channelType === "web") {
    return {
      widgetName: "Web Chat",
      publicChannelKey: `wc-${tenantId}`
    };
  }

  if (channelType === "whatsapp") {
    return {
      verifyToken: `wa-verify-${tenantId}`
    };
  }

  return {
    verifyToken: `wh-verify-${tenantId}`
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
