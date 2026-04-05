/**
 * 作用:
 * - 读取 Evolution API 连接配置。
 *
 * 交互:
 * - 被 Evolution provider adapter 调用。
 * - 统一管理 baseUrl / apikey / webhookBase 等环境变量，避免散落在业务代码中。
 */
import { readOptionalBaseUrlEnv, readOptionalEnv } from "../../../../infra/env.js";

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  webhookBaseUrl?: string;
};

export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = readOptionalBaseUrlEnv("WA_EVOLUTION_BASE_URL");
  const apiKey = readOptionalEnv("WA_EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey) return null;

  return {
    baseUrl,
    apiKey,
    webhookBaseUrl: readOptionalBaseUrlEnv("WA_EVOLUTION_WEBHOOK_BASE_URL")
  };
}
