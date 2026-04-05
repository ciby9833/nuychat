/**
 * 作用:
 * - 读取 Baileys 运行时配置。
 *
 * 交互:
 * - 被 Baileys runtime manager 与 auth repository 调用。
 * - 统一管理 session 目录、媒体目录与自动重连开关。
 */
import path from "node:path";

import { readOptionalEnv } from "../../../infra/env.js";

export type BaileysRuntimeConfig = {
  provider: "baileys";
  sessionDir: string;
  mediaDir: string;
  autoReconnect: boolean;
};

export function getBaileysRuntimeConfig(): BaileysRuntimeConfig {
  const provider = (readOptionalEnv("WA_PROVIDER") ?? "baileys").toLowerCase();
  return {
    provider: "baileys",
    sessionDir: path.resolve(readOptionalEnv("WA_BAILEYS_SESSION_DIR") ?? ".wa-sessions"),
    mediaDir: path.resolve(readOptionalEnv("WA_BAILEYS_MEDIA_DIR") ?? "uploads/wa"),
    autoReconnect: provider === "baileys" && (readOptionalEnv("WA_BAILEYS_AUTO_RECONNECT") ?? "true") !== "false"
  };
}
