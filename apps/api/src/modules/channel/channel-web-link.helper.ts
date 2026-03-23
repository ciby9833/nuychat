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
  const value = process.env.API_PUBLIC_BASE?.trim();
  return value || "http://localhost:3000";
}

function resolveWebchatAppBase(): string {
  const value = process.env.WEBCHAT_APP_BASE?.trim() || process.env.CUSTOMER_WEB_BASE?.trim();
  return value || "http://localhost:5176";
}
