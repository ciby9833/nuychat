/**
 * 作用:
 * - 管理 WA provider adapter 的注册与获取。
 *
 * 交互:
 * - 被 admin/workbench/webhook 服务按 providerKey 获取具体实现。
 */
import { EvolutionProviderAdapter } from "./evolution/evolution-provider.adapter.js";
import type { WaProviderAdapter } from "./provider-contract.js";

const evolution = new EvolutionProviderAdapter();

export function getWaProviderAdapter(providerKey: string): WaProviderAdapter {
  if (providerKey === "evolution") return evolution;
  throw new Error(`Unsupported WA provider: ${providerKey}`);
}
