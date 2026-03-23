import { webAdapter } from "./adapters/web/web.adapter.js";
import { webhookAdapter } from "./adapters/webhook/webhook.adapter.js";
import { whatsappAdapter } from "./adapters/whatsapp/whatsapp.adapter.js";

export const channelAdapterRegistry = {
  web: webAdapter,
  webhook: webhookAdapter,
  whatsapp: whatsappAdapter
} as const;

export type SupportedChannelType = keyof typeof channelAdapterRegistry;

export function resolveChannelAdapter(channelType: string) {
  const adapter = channelAdapterRegistry[channelType as SupportedChannelType];
  if (!adapter) {
    throw new Error(`Unsupported channel adapter: ${channelType}`);
  }
  return adapter;
}
