/**
 * 作用:
 * - 暴露 WA 模块当前唯一的 Baileys adapter 实例。
 *
 * 交互:
 * - 被 admin/workbench/outbound/reconcile 服务直接引用。
 */
import { BaileysProviderAdapter } from "./baileys/baileys-provider.adapter.js";
import type { WaProviderAdapter } from "./provider-contract.js";

export const waProviderAdapter: WaProviderAdapter = new BaileysProviderAdapter();
