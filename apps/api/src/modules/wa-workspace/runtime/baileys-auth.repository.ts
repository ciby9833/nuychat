/**
 * 作用:
 * - 为每个 WA 账号提供 Baileys auth state 存储目录与 DB 快照恢复。
 *
 * 交互:
 * - 被 runtime manager 调用，基于 `useMultiFileAuthState` 维护 session 文件。
 * - 当前运行时仍使用多文件目录，但会把最新 keys 快照同步到数据库，便于生产恢复。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { useMultiFileAuthState } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../../infra/db/client.js";
import { getBaileysRuntimeConfig } from "./baileys-config.js";

function getSessionPath(tenantId: string, waAccountId: string) {
  const config = getBaileysRuntimeConfig();
  return path.join(config.sessionDir, tenantId, waAccountId);
}

export async function createBaileysAuthState(tenantId: string, waAccountId: string) {
  const sessionPath = getSessionPath(tenantId, waAccountId);
  await restoreBaileysAuthSnapshot(tenantId, waAccountId, sessionPath);
  await fs.mkdir(sessionPath, { recursive: true });
  const state = await useMultiFileAuthState(sessionPath);
  return {
    sessionPath,
    state
  };
}

export async function persistBaileysAuthSnapshot(tenantId: string, waAccountId: string, sessionPath: string) {
  await fs.mkdir(sessionPath, { recursive: true });
  const fileNames = (await fs.readdir(sessionPath)).filter((name) => name.endsWith(".json")).sort();
  const snapshotPayload: Record<string, unknown> = {};

  for (const fileName of fileNames) {
    const content = await fs.readFile(path.join(sessionPath, fileName), "utf8");
    snapshotPayload[fileName] = JSON.parse(content);
  }

  await withTenantTransaction(tenantId, async (trx) => {
    const existing = await trx("wa_baileys_auth_snapshots")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .first<{ snapshot_version?: string | number } | undefined>();

    if (existing) {
      await trx("wa_baileys_auth_snapshots")
        .where({ tenant_id: tenantId, wa_account_id: waAccountId })
        .update({
          snapshot_version: Number(existing.snapshot_version ?? 0) + 1,
          snapshot_payload: JSON.stringify(snapshotPayload),
          persisted_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      return;
    }

    await trx("wa_baileys_auth_snapshots").insert({
      tenant_id: tenantId,
      wa_account_id: waAccountId,
      snapshot_version: 1,
      snapshot_payload: JSON.stringify(snapshotPayload),
      persisted_at: trx.fn.now()
    });
  });
}

async function restoreBaileysAuthSnapshot(tenantId: string, waAccountId: string, sessionPath: string) {
  await fs.mkdir(sessionPath, { recursive: true });
  const existingFiles = (await fs.readdir(sessionPath).catch(() => [])).filter((name) => name.endsWith(".json"));
  if (existingFiles.length > 0) return;

  const snapshotPayload = await withTenantTransaction(tenantId, async (trx) => {
    const row = await trx("wa_baileys_auth_snapshots")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .first<Record<string, unknown> | undefined>();
    if (!row) return null;
    return typeof row.snapshot_payload === "string"
      ? JSON.parse(String(row.snapshot_payload))
      : (row.snapshot_payload as Record<string, unknown> | null);
  });

  if (!snapshotPayload || typeof snapshotPayload !== "object") return;

  const entries = Object.entries(snapshotPayload).filter(([fileName, value]) => fileName.endsWith(".json") && value);
  await Promise.all(entries.map(([fileName, value]) =>
    fs.writeFile(path.join(sessionPath, fileName), JSON.stringify(value), "utf8")
  ));
}
