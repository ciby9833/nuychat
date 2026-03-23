import { db } from "../../infra/db/client.js";

type ChannelConfigRow = {
  config_id: string;
  tenant_id: string;
  channel_type: string;
  channel_id: string;
  encrypted_config: string;
  is_active: boolean;
};

export type ResolvedChannelConfig = {
  configId: string;
  tenantId: string;
  channelId: string;
  channelType: string;
  verifyToken?: string;
  rawConfig: Record<string, unknown>;
};

export async function findActiveChannelConfig(channelId: string) {
  const row = await db("channel_configs")
    .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
    .where({ channel_id: channelId, is_active: true })
    .first<ChannelConfigRow>();

  if (!row) {
    return null;
  }

  return mapResolvedChannel(row);
}

export async function findActiveWebChannelByPublicKey(publicChannelKey: string) {
  const row = await db("channel_configs")
    .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
    .where({ channel_type: "web", is_active: true })
    .whereRaw("(encrypted_config::jsonb ->> 'publicChannelKey') = ?", [publicChannelKey])
    .first<ChannelConfigRow>();

  return row ? mapResolvedChannel(row) : null;
}

export async function findActiveWhatsAppChannelByPhoneNumberId(phoneNumberId: string) {
  const row = await db("channel_configs")
    .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
    .where({ channel_type: "whatsapp", is_active: true })
    .whereRaw("regexp_replace(coalesce(encrypted_config::jsonb ->> 'phoneNumberId', ''), '[^0-9]', '', 'g') = ?", [
      normalizePhoneNumberId(phoneNumberId)
    ])
    .first<ChannelConfigRow>();

  return row ? mapResolvedChannel(row) : null;
}

function parseStoredConfig(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function mapResolvedChannel(row: ChannelConfigRow): ResolvedChannelConfig {
  const rawConfig = parseStoredConfig(row.encrypted_config);

  return {
    configId: row.config_id,
    tenantId: row.tenant_id,
    channelId: row.channel_id,
    channelType: row.channel_type,
    verifyToken: readString(rawConfig, ["verifyToken"]),
    rawConfig
  } satisfies ResolvedChannelConfig;
}

function normalizePhoneNumberId(value: string): string {
  return value.replace(/[^\d]/g, "");
}
