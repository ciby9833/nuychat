/**
 * 作用:
 * - 处理 WA 独立出站队列的业务逻辑。
 *
 * 交互:
 * - 被 wa-workbench.service 写入队列任务。
 * - 被 wa-outbound.worker 消费，调用当前唯一的 Baileys adapter 实际发送消息，并回写出站结果。
 */
import { withTenantTransaction } from "../../infra/db/client.js";
import { waWorkspaceOutboundQueue, type WaWorkspaceOutboundJobPayload } from "../../infra/queue/queues.js";
import { waProviderAdapter } from "./provider/provider-registry.js";
import { emitWaMessageUpdated } from "./wa-realtime.service.js";

export async function enqueueWaOutboundJob(payload: WaWorkspaceOutboundJobPayload) {
  const queueJobId = `wa-${payload.jobId}`;
  const existingJob = await waWorkspaceOutboundQueue.getJob(queueJobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "failed" || state === "completed") {
      await existingJob.remove();
    }
  }

  await waWorkspaceOutboundQueue.add("wa.outbound.send_text", payload, {
    jobId: queueJobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 50,
    removeOnFail: 50
  });
}

export async function processWaOutboundJob(payload: WaWorkspaceOutboundJobPayload) {
  const existingJob = await withTenantTransaction(payload.tenantId, async (trx) => {
    const row = await trx("wa_outbound_jobs")
      .where({ tenant_id: payload.tenantId, job_id: payload.jobId })
      .select("job_id", "payload", "send_status", "created_by_membership_id")
      .first<Record<string, unknown> | undefined>();
    if (!row) throw new Error("WA outbound job not found");
    if (["accepted", "sent"].includes(String(row.send_status))) return null;

    await trx("wa_outbound_jobs")
      .where({ job_id: payload.jobId })
      .update({
        send_status: "sending",
        attempt_count: trx.raw("attempt_count + 1"),
        updated_at: trx.fn.now()
      });

    return row;
  });
  if (!existingJob) return { skipped: true };

  try {
    const { account, conversation } = await withTenantTransaction(payload.tenantId, async (trx) => {
      const accountRow = await trx("wa_accounts")
        .where({ tenant_id: payload.tenantId, wa_account_id: payload.waAccountId })
        .first<Record<string, unknown> | undefined>();
      if (!accountRow) throw new Error("WA account not found");

      const conversationRow = await trx("wa_conversations")
        .where({ tenant_id: payload.tenantId, wa_conversation_id: payload.waConversationId })
        .first<Record<string, unknown> | undefined>();
      if (!conversationRow) throw new Error("WA conversation not found");

      return { account: accountRow, conversation: conversationRow };
    });

    const result =
      payload.jobType === "send_media"
        ? await waProviderAdapter.sendMedia({
            tenantId: payload.tenantId,
            waAccountId: payload.waAccountId,
            instanceKey: String(account.instance_key),
            to: String(conversation.chat_jid),
            mediaType: payload.mediaType ?? "document",
            mimeType: payload.mimeType ?? "application/octet-stream",
            fileName: payload.fileName ?? "attachment",
            mediaUrl: payload.mediaUrl ?? "",
            caption: payload.text ?? null,
            quotedMessageId: payload.quotedMessageId ?? null,
            mentionJids: payload.mentionJids ?? null,
            delayMs: payload.delayMs ?? 0
          })
        : payload.jobType === "send_reaction"
          ? await waProviderAdapter.sendReaction({
              tenantId: payload.tenantId,
              waAccountId: payload.waAccountId,
              instanceKey: String(account.instance_key),
              remoteJid: payload.remoteJid ?? String(conversation.chat_jid),
              targetMessageId: payload.reactionTargetId ?? "",
              emoji: payload.emoji ?? ""
            })
          : await waProviderAdapter.sendText({
              tenantId: payload.tenantId,
              waAccountId: payload.waAccountId,
              instanceKey: String(account.instance_key),
              to: String(conversation.chat_jid),
              text: payload.text ?? "",
              quotedMessageId: payload.quotedMessageId ?? null,
              mentionJids: payload.mentionJids ?? null,
              delayMs: payload.delayMs ?? 0
            });

    await withTenantTransaction(payload.tenantId, async (trx) => {
      await trx("wa_outbound_jobs")
        .where({ job_id: payload.jobId })
        .update({
          send_status: result.deliveryStatus === "pending" ? "accepted" : "sent",
          last_error: null,
          updated_at: trx.fn.now(),
          payload: JSON.stringify({
            ...(typeof existingJob.payload === "string" ? JSON.parse(existingJob.payload) : (existingJob.payload as Record<string, unknown> ?? {})),
            sendResult: result
          })
        });

      await trx("wa_messages")
        .where({ tenant_id: payload.tenantId, wa_message_id: payload.waMessageId })
        .update({
          provider_message_id: result.providerMessageId,
          delivery_status: result.deliveryStatus,
          provider_payload: JSON.stringify({
            ...result.providerPayload,
            mentionJids: payload.mentionJids ?? null
          }),
          sender_member_id: payload.createdByMembershipId ?? existingJob.created_by_membership_id ?? null,
          updated_at: trx.fn.now()
        });
    });

    emitWaMessageUpdated({
      tenantId: payload.tenantId,
      waConversationId: payload.waConversationId,
      waMessageId: payload.waMessageId,
      providerMessageId: result.providerMessageId,
      deliveryStatus: result.deliveryStatus
    });

    return { sent: true, providerMessageId: result.providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withTenantTransaction(payload.tenantId, async (trx) => {
      await trx("wa_outbound_jobs")
        .where({ job_id: payload.jobId })
        .update({
          send_status: "failed",
          last_error: message,
          updated_at: trx.fn.now()
        });
      await trx("wa_messages")
        .where({ tenant_id: payload.tenantId, wa_message_id: payload.waMessageId })
        .update({
          delivery_status: "failed",
          updated_at: trx.fn.now()
        });
    });
    emitWaMessageUpdated({
      tenantId: payload.tenantId,
      waConversationId: payload.waConversationId,
      waMessageId: payload.waMessageId,
      providerMessageId: null,
      deliveryStatus: "failed"
    });
    throw error;
  }
}
