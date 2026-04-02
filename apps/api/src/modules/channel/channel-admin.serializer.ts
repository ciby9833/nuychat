export type ChannelConfigMutationBody = {
  channelId?: string;
  isActive?: boolean;
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
  label?: string;
  usageScene?: string;
  isPrimary?: boolean;
};

export function parseStoredChannelConfig(value: unknown): Record<string, unknown> {
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

export function normalizeChannelAdminString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}
