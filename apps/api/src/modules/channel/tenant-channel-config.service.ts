import type { Knex } from "knex";

import { buildWhatsAppWebhookUrl, isWhatsAppEmbeddedSignupEnabled } from "./whatsapp-platform-config.js";

type ChannelConfigRow = {
  config_id: string;
  tenant_id: string;
  channel_type: string;
  channel_id: string;
  encrypted_config: unknown;
  is_active: boolean;
};

export type TenantChannelType = "web" | "whatsapp" | "webhook";

export type TenantChannelConfigView = {
  config_id: string;
  channel_type: TenantChannelType;
  channel_id: string;
  widget_name: string | null;
  public_channel_key: string | null;
  allowed_origins: string[];
  verify_token: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  business_account_name: string | null;
  display_phone_number: string | null;
  whatsapp_webhook_url: string | null;
  whatsapp_embedded_signup_enabled: boolean;
  inbound_webhook_url: string | null;
  outbound_webhook_url: string | null;
  webhook_secret: string | null;
  is_active: boolean;
};

export const SUPPORTED_TENANT_CHANNEL_TYPES: readonly TenantChannelType[] = ["web", "whatsapp", "webhook"] as const;

export async function ensureTenantChannelConfigs(trx: Knex | Knex.Transaction, tenantId: string) {
  const rows = await trx("channel_configs")
    .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
    .where({ tenant_id: tenantId })
    .whereIn("channel_type", [...SUPPORTED_TENANT_CHANNEL_TYPES])
    .orderBy("created_at", "asc") as ChannelConfigRow[];

  const byType = new Map<TenantChannelType, ChannelConfigRow>();
  for (const row of rows) {
    const channelType = normalizeTenantChannelType(row.channel_type);
    if (!channelType || byType.has(channelType)) continue;
    byType.set(channelType, row);
  }

  for (const channelType of SUPPORTED_TENANT_CHANNEL_TYPES) {
    if (byType.has(channelType)) continue;

    const [created] = await trx("channel_configs")
      .insert({
        tenant_id: tenantId,
        channel_type: channelType,
        channel_id: buildDefaultChannelId(tenantId, channelType),
        encrypted_config: JSON.stringify(buildDefaultChannelConfig(tenantId, channelType)),
        is_active: channelType === "web"
      })
      .returning(["config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active"]);

    byType.set(channelType, created as ChannelConfigRow);
  }

  return SUPPORTED_TENANT_CHANNEL_TYPES
    .map((channelType) => byType.get(channelType))
    .filter((row): row is ChannelConfigRow => Boolean(row));
}

export function serializeTenantChannelConfig(row: ChannelConfigRow): TenantChannelConfigView {
  const config = parseJsonObject(row.encrypted_config);
  const channelType = normalizeTenantChannelType(row.channel_type);
  if (!channelType) {
    throw new Error(`Unsupported tenant channel type: ${row.channel_type}`);
  }

  return {
    config_id: row.config_id,
    channel_type: channelType,
    channel_id: row.channel_id,
    widget_name: typeof config.widgetName === "string" ? config.widgetName : null,
    public_channel_key: typeof config.publicChannelKey === "string" ? config.publicChannelKey : null,
    allowed_origins: Array.isArray(config.allowedOrigins)
      ? config.allowedOrigins.map((item) => String(item)).filter(Boolean)
      : [],
    verify_token: typeof config.verifyToken === "string" ? config.verifyToken : null,
    phone_number_id: typeof config.phoneNumberId === "string" ? config.phoneNumberId : null,
    waba_id: typeof config.wabaId === "string" ? config.wabaId : null,
    business_account_name: typeof config.businessAccountName === "string" ? config.businessAccountName : null,
    display_phone_number: typeof config.displayPhoneNumber === "string" ? config.displayPhoneNumber : null,
    whatsapp_webhook_url: channelType === "whatsapp" ? buildWhatsAppWebhookUrl() : null,
    whatsapp_embedded_signup_enabled: channelType === "whatsapp" ? isWhatsAppEmbeddedSignupEnabled() : false,
    inbound_webhook_url: channelType === "webhook" ? `${resolveApiBase()}/webhook/${encodeURIComponent(row.channel_id)}` : null,
    outbound_webhook_url: typeof config.outboundWebhookUrl === "string" ? config.outboundWebhookUrl : null,
    webhook_secret: typeof config.webhookSecret === "string" ? config.webhookSecret : null,
    is_active: row.is_active
  };
}

export function normalizeTenantChannelType(value: unknown): TenantChannelType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "web" || normalized === "whatsapp" || normalized === "webhook") {
    return normalized;
  }
  return null;
}

export function buildChannelConfigPayload(
  channelType: TenantChannelType,
  currentConfig: Record<string, unknown>,
  body: {
    widgetName?: string;
    publicChannelKey?: string;
    allowedOrigins?: string[];
    verifyToken?: string;
    phoneNumberId?: string;
    wabaId?: string;
    businessAccountName?: string;
    displayPhoneNumber?: string;
    outboundWebhookUrl?: string;
    webhookSecret?: string;
  }
) {
  const next = { ...currentConfig };

  if (channelType === "web") {
    if (body.widgetName !== undefined) next.widgetName = normalizeNonEmptyString(body.widgetName);
    if (body.publicChannelKey !== undefined) next.publicChannelKey = normalizeNonEmptyString(body.publicChannelKey);
    if (body.allowedOrigins !== undefined) {
      next.allowedOrigins = body.allowedOrigins.map((item) => String(item).trim()).filter(Boolean);
    }
  }

  if (channelType === "whatsapp") {
    if (body.phoneNumberId !== undefined) next.phoneNumberId = normalizeNonEmptyString(body.phoneNumberId);
    if (body.wabaId !== undefined) next.wabaId = normalizeNonEmptyString(body.wabaId);
    if (body.businessAccountName !== undefined) next.businessAccountName = normalizeNonEmptyString(body.businessAccountName);
    if (body.displayPhoneNumber !== undefined) next.displayPhoneNumber = normalizeNonEmptyString(body.displayPhoneNumber);
  }

  if (channelType === "webhook") {
    if (body.verifyToken !== undefined) next.verifyToken = normalizeNonEmptyString(body.verifyToken);
    if (body.outboundWebhookUrl !== undefined) next.outboundWebhookUrl = normalizeNonEmptyString(body.outboundWebhookUrl);
    if (body.webhookSecret !== undefined) next.webhookSecret = normalizeNonEmptyString(body.webhookSecret);
  }

  return next;
}

export function buildDefaultChannelId(tenantId: string, channelType: TenantChannelType) {
  return `${channelType}-${tenantId}`;
}

function buildDefaultChannelConfig(tenantId: string, channelType: TenantChannelType) {
  if (channelType === "web") {
    return {
      widgetName: "Web Chat",
      publicChannelKey: `wc-${tenantId}`
    };
  }

  if (channelType === "whatsapp") {
    return {
      onboardingStatus: "unbound"
    };
  }

  return {
    verifyToken: `wh-verify-${tenantId}`
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}

function resolveApiBase() {
  return process.env.API_PUBLIC_BASE?.trim() || "http://localhost:3000";
}
