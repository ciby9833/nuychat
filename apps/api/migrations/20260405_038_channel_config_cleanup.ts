import type { Knex } from "knex";

type ChannelRow = {
  config_id: string;
  channel_type: string;
  encrypted_config: string;
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_verify_token");

  const rows = await knex("channel_configs")
    .select("config_id", "channel_type", "encrypted_config") as ChannelRow[];

  for (const row of rows) {
    const current = parseJsonObject(row.encrypted_config);

    if (row.channel_type === "whatsapp") {
      const nextConfig = buildWhatsAppConfig(current);
      const isActive = typeof nextConfig.phoneNumberId === "string" && nextConfig.phoneNumberId.length > 0;

      await knex("channel_configs")
        .where({ config_id: row.config_id })
        .update({
          encrypted_config: JSON.stringify(nextConfig),
          is_active: isActive,
          updated_at: knex.fn.now()
        });
      continue;
    }

    if (row.channel_type === "webhook") {
      const nextConfig = buildWebhookConfig(current);
      await knex("channel_configs")
        .where({ config_id: row.config_id })
        .update({
          encrypted_config: JSON.stringify(nextConfig),
          updated_at: knex.fn.now()
        });
    }
  }

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_whatsapp_phone
    ON channel_configs ((encrypted_config::jsonb ->> 'phoneNumberId'))
    WHERE channel_type = 'whatsapp' AND (encrypted_config::jsonb ->> 'phoneNumberId') IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_whatsapp_verify_token
    ON channel_configs ((encrypted_config::jsonb ->> 'verifyToken'))
    WHERE channel_type = 'whatsapp' AND (encrypted_config::jsonb ->> 'verifyToken') IS NOT NULL;
  `);
}

function buildWhatsAppConfig(source: Record<string, unknown>) {
  const phoneNumberId = readString(source, "phoneNumberId");
  const next: Record<string, unknown> = {
    onboardingStatus: phoneNumberId ? "bound" : "unbound"
  };

  if (phoneNumberId) next.phoneNumberId = phoneNumberId;

  const wabaId = readString(source, "wabaId");
  if (wabaId) next.wabaId = wabaId;

  const businessAccountName = readString(source, "businessAccountName");
  if (businessAccountName) next.businessAccountName = businessAccountName;

  const displayPhoneNumber = readString(source, "displayPhoneNumber");
  if (displayPhoneNumber) next.displayPhoneNumber = displayPhoneNumber;

  const connectedAt = readString(source, "connectedAt");
  if (connectedAt) next.connectedAt = connectedAt;

  return next;
}

function buildWebhookConfig(source: Record<string, unknown>) {
  const next: Record<string, unknown> = {};

  const verifyToken = readString(source, "verifyToken");
  if (verifyToken) next.verifyToken = verifyToken;

  const outboundWebhookUrl = readString(source, "outboundWebhookUrl") ?? readString(source, "webhookUrl");
  if (outboundWebhookUrl) next.outboundWebhookUrl = outboundWebhookUrl;

  const webhookSecret = readString(source, "webhookSecret");
  if (webhookSecret) next.webhookSecret = webhookSecret;

  return next;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}
