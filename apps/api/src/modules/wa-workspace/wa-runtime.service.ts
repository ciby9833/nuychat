/**
 * 作用:
 * - 统一判断内嵌 WA runtime 的可用性。
 *
 * 交互:
 * - 被管理端与工作台路由调用，决定是否展示或放行 WA 功能入口。
 * - 当前检查是否启用 Baileys 运行时以及 session 目录配置。
 */
import { getBaileysRuntimeConfig } from "./runtime/baileys-config.js";

export type WaRuntimeStatus = {
  providerKey: "baileys";
  available: boolean;
  providerConfigured: boolean;
  reason: "provider_disabled" | "missing_session_dir" | null;
};

export function getWaRuntimeStatus(): WaRuntimeStatus {
  const config = getBaileysRuntimeConfig();
  if (config.provider !== "baileys") {
    return {
      providerKey: "baileys",
      available: false,
      providerConfigured: false,
      reason: "provider_disabled"
    };
  }

  if (!config.sessionDir) {
    return {
      providerKey: "baileys",
      available: false,
      providerConfigured: true,
      reason: "missing_session_dir"
    };
  }

  return {
    providerKey: "baileys",
    available: true,
    providerConfigured: true,
    reason: null
  };
}
