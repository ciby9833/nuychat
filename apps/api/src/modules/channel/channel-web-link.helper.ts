import { readRequiredBaseUrlEnv } from "../../infra/env.js";

export function buildWebChannelLinkInfo(input: {
  channelId: string;
  publicChannelKey: string | null;
  isActive: boolean;
}) {
  const apiBase = resolveWebchatApiBase();
  const appBase = resolveWebchatAppBase();

  return {
    channelId: input.channelId,
    publicChannelKey: input.publicChannelKey,
    isActive: input.isActive,
    customerChatUrl: input.publicChannelKey ? `${appBase}/?k=${encodeURIComponent(input.publicChannelKey)}` : null,
    widgetScriptUrl: `${apiBase}/webchat.js`,
    widgetEmbedSnippet: input.publicChannelKey
      ? `<script src="${apiBase}/webchat.js" data-key="${input.publicChannelKey}" data-api-base="${apiBase}" data-app-base="${appBase}"></script>`
      : null
  };
}

export function buildWebhookChannelLinkInfo(input: {
  channelId: string;
  isActive: boolean;
  outboundWebhookUrl: string | null;
}) {
  const apiBase = resolveWebchatApiBase();

  return {
    channelId: input.channelId,
    isActive: input.isActive,
    inboundWebhookUrl: `${apiBase}/webhook/${encodeURIComponent(input.channelId)}`,
    outboundWebhookUrl: input.outboundWebhookUrl
  };
}

function resolveWebchatApiBase(): string {
  return readRequiredBaseUrlEnv("API_PUBLIC_BASE");
}

function resolveWebchatAppBase(): string {
  return readRequiredBaseUrlEnv("WEBCHAT_APP_BASE");
}
