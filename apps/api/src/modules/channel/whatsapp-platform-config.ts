type WhatsAppPlatformConfig = {
  appId: string | null;
  appSecret: string | null;
  systemUserAccessToken: string | null;
  webhookVerifyToken: string | null;
  embeddedSignupConfigId: string | null;
  graphApiVersion: string;
  apiBaseUrl: string;
};

export function getWhatsAppPlatformConfig(): WhatsAppPlatformConfig {
  return {
    appId: normalize(process.env.META_APP_ID),
    appSecret: normalize(process.env.META_APP_SECRET),
    systemUserAccessToken: normalize(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
    webhookVerifyToken: normalize(process.env.META_WEBHOOK_VERIFY_TOKEN),
    embeddedSignupConfigId: normalize(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID),
    graphApiVersion: normalize(process.env.META_GRAPH_API_VERSION) ?? "v21.0",
    apiBaseUrl: resolveApiBaseUrl()
  };
}

export function buildWhatsAppWebhookUrl(): string {
  return `${getWhatsAppPlatformConfig().apiBaseUrl}/webhook/whatsapp`;
}

export function isWhatsAppEmbeddedSignupEnabled(): boolean {
  const config = getWhatsAppPlatformConfig();
  return Boolean(config.appId && config.embeddedSignupConfigId);
}

export function assertWhatsAppWebhookConfigured() {
  const config = getWhatsAppPlatformConfig();
  if (!config.appSecret) {
    throw new Error("META_APP_SECRET is not configured");
  }
  if (!config.webhookVerifyToken) {
    throw new Error("META_WEBHOOK_VERIFY_TOKEN is not configured");
  }
  return config;
}

export function assertWhatsAppMessagingConfigured() {
  const config = getWhatsAppPlatformConfig();
  if (!config.systemUserAccessToken) {
    throw new Error("META_SYSTEM_USER_ACCESS_TOKEN is not configured");
  }
  return config;
}

function resolveApiBaseUrl(): string {
  const value = normalize(process.env.API_PUBLIC_BASE);
  return value ?? "http://localhost:3000";
}

function normalize(input: string | undefined | null): string | null {
  if (!input) return null;
  const value = input.trim();
  return value ? value : null;
}
