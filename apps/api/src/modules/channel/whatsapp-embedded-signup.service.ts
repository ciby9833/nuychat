import { assertWhatsAppMessagingConfigured, buildWhatsAppWebhookUrl, getWhatsAppPlatformConfig, isWhatsAppEmbeddedSignupEnabled } from "./whatsapp-platform-config.js";

type WhatsAppPhoneNumberRecord = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

type WhatsAppBusinessRecord = {
  id?: string;
  name?: string;
};

export type EmbeddedSignupSetupView = {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  webhookUrl: string;
  graphApiVersion: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  businessAccountName: string | null;
};

export function buildEmbeddedSignupSetupView(currentConfig: Record<string, unknown>): EmbeddedSignupSetupView {
  const platform = getWhatsAppPlatformConfig();
  return {
    enabled: isWhatsAppEmbeddedSignupEnabled(),
    appId: platform.appId,
    configId: platform.embeddedSignupConfigId,
    webhookUrl: buildWhatsAppWebhookUrl(),
    graphApiVersion: platform.graphApiVersion,
    phoneNumberId: readString(currentConfig, ["phoneNumberId"]),
    wabaId: readString(currentConfig, ["wabaId"]),
    displayPhoneNumber: readString(currentConfig, ["displayPhoneNumber"]),
    businessAccountName: readString(currentConfig, ["businessAccountName"])
  };
}

export async function hydrateEmbeddedSignupBinding(input: {
  phoneNumberId: string;
  wabaId?: string | null;
  displayPhoneNumber?: string | null;
  businessAccountName?: string | null;
}) {
  const platform = assertWhatsAppMessagingConfigured();
  const headers = {
    Authorization: `Bearer ${platform.systemUserAccessToken}`,
    "Content-Type": "application/json"
  };

  let phoneRecord: WhatsAppPhoneNumberRecord | null = null;
  let businessRecord: WhatsAppBusinessRecord | null = null;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${platform.graphApiVersion}/${encodeURIComponent(input.phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      { headers }
    );
    if (response.ok) {
      phoneRecord = (await response.json()) as WhatsAppPhoneNumberRecord;
    }
  } catch {
    phoneRecord = null;
  }

  const resolvedWabaId = input.wabaId ?? null;
  if (resolvedWabaId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${platform.graphApiVersion}/${encodeURIComponent(resolvedWabaId)}?fields=id,name`,
        { headers }
      );
      if (response.ok) {
        businessRecord = (await response.json()) as WhatsAppBusinessRecord;
      }
    } catch {
      businessRecord = null;
    }
  }

  return {
    phoneNumberId: input.phoneNumberId,
    wabaId: resolvedWabaId,
    displayPhoneNumber: input.displayPhoneNumber ?? phoneRecord?.display_phone_number ?? null,
    businessAccountName: input.businessAccountName ?? businessRecord?.name ?? phoneRecord?.verified_name ?? null
  };
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}
