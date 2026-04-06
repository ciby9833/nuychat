/**
 * 作用:
 * - 服务启动时自动恢复 WA 运行时连接，并重新入队卡死的出站任务。
 *
 * 交互:
 * - 在 server.ts 启动完成后调用。
 * - 调用 ensureBaileysRuntime 恢复各账号的 WebSocket 连接。
 * - 把 DB 里 queued 但不在 Redis 队列的出站任务重新入队。
 */
import { db } from "../../infra/db/client.js";
import { ensureBaileysRuntime } from "./runtime/baileys-runtime.manager.js";
import { enqueueWaOutboundJob, type WaWorkspaceOutboundJobPayload } from "../../infra/queue/queues.js";

/**
 * 恢复所有拥有 auth 快照的 WA 账号的 Baileys 运行时连接。
 * 利用已存储的 session 凭据，无需重新扫码。
 */
async function restoreWaRuntimes() {
  // 查找所有有 auth 快照的账号（说明曾经成功登录过，凭据可用）
  const accounts = await db("wa_accounts as a")
    .join("wa_baileys_auth_snapshots as s", "s.wa_account_id", "a.wa_account_id")
    .select("a.tenant_id", "a.wa_account_id", "a.instance_key", "a.display_name")
    .groupBy("a.tenant_id", "a.wa_account_id", "a.instance_key", "a.display_name");

  if (accounts.length === 0) {
    console.info("[wa-startup] No WA accounts with auth snapshots found, skipping runtime restore");
    return;
  }

  console.info(`[wa-startup] Restoring ${accounts.length} WA runtime(s)...`);

  for (const account of accounts) {
    try {
      await ensureBaileysRuntime({
        tenantId: String(account.tenant_id),
        waAccountId: String(account.wa_account_id),
        instanceKey: String(account.instance_key),
        loginMode: "auto_restore",
        forceNew: false
      });
      console.info(`[wa-startup] Runtime restored: ${String(account.display_name)} (${String(account.instance_key)})`);
    } catch (error) {
      console.error(`[wa-startup] Failed to restore runtime for ${String(account.instance_key)}:`, error);
    }
  }
}

/**
 * 把 DB 里 send_status='queued' 但不在 BullMQ Redis 队列中的任务重新入队。
 * 这类任务出现原因：DB 事务提交成功但 enqueueWaOutboundJob 调用因进程崩溃而丢失。
 */
async function reEnqueueStuckOutboundJobs() {
  const stuckJobs = await db("wa_outbound_jobs as j")
    .join("wa_accounts as a", "a.wa_account_id", "j.wa_account_id")
    .join("wa_conversations as c", "c.wa_conversation_id", "j.wa_conversation_id")
    .where("j.send_status", "queued")
    .where("j.attempt_count", 0)
    // 只处理超过 30 秒还没被消费的任务（避免和刚入队的正常任务冲突）
    .where("j.created_at", "<", db.raw("NOW() - INTERVAL '30 seconds'"))
    .select(
      "j.job_id",
      "j.tenant_id",
      "j.wa_account_id",
      "j.wa_conversation_id",
      "j.job_type",
      "j.payload",
      "a.instance_key",
      "c.chat_jid"
    );

  if (stuckJobs.length === 0) {
    console.info("[wa-startup] No stuck outbound jobs found");
    return;
  }

  console.info(`[wa-startup] Re-enqueuing ${stuckJobs.length} stuck outbound job(s)...`);

  for (const job of stuckJobs) {
    try {
      const rawPayload = typeof job.payload === "string"
        ? JSON.parse(String(job.payload))
        : (job.payload as Record<string, unknown>);

      const queuePayload: WaWorkspaceOutboundJobPayload = {
        jobId: String(job.job_id),
        tenantId: String(job.tenant_id),
        waAccountId: String(job.wa_account_id),
        waConversationId: String(job.wa_conversation_id),
        waMessageId: String(rawPayload.waMessageId ?? ""),
        jobType: String(job.job_type) as WaWorkspaceOutboundJobPayload["jobType"],
        text: String(rawPayload.text ?? ""),
        quotedMessageId: rawPayload.quotedMessageId ? String(rawPayload.quotedMessageId) : null,
        mediaType: rawPayload.mediaType ? String(rawPayload.mediaType) as WaWorkspaceOutboundJobPayload["mediaType"] : undefined,
        mimeType: rawPayload.mimeType ? String(rawPayload.mimeType) : undefined,
        fileName: rawPayload.fileName ? String(rawPayload.fileName) : undefined,
        mediaUrl: rawPayload.mediaUrl ? String(rawPayload.mediaUrl) : undefined,
        emoji: rawPayload.emoji ? String(rawPayload.emoji) : undefined,
        reactionTargetId: rawPayload.reactionTargetId ? String(rawPayload.reactionTargetId) : undefined,
        remoteJid: rawPayload.remoteJid ? String(rawPayload.remoteJid) : undefined,
        delayMs: 0
      };

      await enqueueWaOutboundJob(queuePayload);
      console.info(`[wa-startup] Re-enqueued job ${String(job.job_id)} (${String(job.job_type)})`);
    } catch (error) {
      console.error(`[wa-startup] Failed to re-enqueue job ${String(job.job_id)}:`, error);
    }
  }
}

export async function runWaStartup() {
  console.info("[wa-startup] Running WA workspace startup tasks...");
  await Promise.allSettled([
    restoreWaRuntimes(),
    reEnqueueStuckOutboundJobs()
  ]);
  console.info("[wa-startup] WA workspace startup tasks complete");
}
