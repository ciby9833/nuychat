/**
 * 作用:
 * - 暴露 WA 模块当前唯一的 Baileys adapter。
 *
 * 交互:
 * - 被 admin/workbench/outbound/reconcile 服务直接调用。
 *
 * 说明:
 * - WA 运行时已明确固定为内嵌 Baileys，不再保留多 provider 分发层。
 */
import { BaileysProviderAdapter } from "./baileys/baileys-provider.adapter.js";
import type { WaProviderAdapter } from "./provider-contract.js";

export const waProviderAdapter: WaProviderAdapter = new BaileysProviderAdapter();

export function getWaProviderAdapter(): WaProviderAdapter {
  return waProviderAdapter;
}
