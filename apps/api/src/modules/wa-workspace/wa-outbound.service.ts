/**
 * 作用:
 * - 处理 WA 独立出站队列的业务逻辑。
 *
 * 交互:
 * - 被 wa-workbench.service 写入队列任务。
 * - 被 wa-outbound.worker 消费，调用 provider adapter 实际发送消息，并回写出站结果。
 */
import { withTenantTransaction } from "../../infra/db/client.js";
import { waWorkspaceOutboundQueue, type WaWorkspaceOutboundJobPayload } from "../../infra/queue/queues.js";
import { getWaProviderAdapter } from "./provider/provider-registry.js";
import { emitWaMessageUpdated } from "./wa-realtime.service.js";

export async function enqueueWaOutboundJob(payload: WaWorkspaceOutboundJobPayload) {
  await waWorkspaceOutboundQueue.add("wa.outbound.send_text", payload, {
    jobId: `wa:${payload.jobId}`,
    removeOnComplete: 50,
    removeOnFail: 50
  });
}

export async function processWaOutboundJob(payload: WaWorkspaceOutboundJobPayload) {
  return withTenantTransaction(payload.tenantId, async (trx) => {
    const jobRow = await trx("wa_outbound_jobs")
      .where({ tenant_id: payload.tenantId, job_id: payload.jobId })
      .first<Record<string, unknown> | undefined>();
    if (!jobRow) throw new Error("WA outbound job not found");
    if (String(jobRow.send_status) === "sent") return { skipped: true };

    await trx("wa_outbound_jobs")
      .where({ job_id: payload.jobId })
      .update({
        send_status: "sending",
        attempt_count: trx.raw("attempt_count + 1"),
        updated_at: trx.fn.now()
      });

    const account = await trx("wa_accounts")
      .where({ tenant_id: payload.tenantId, wa_account_id: payload.waAccountId })
      .first<Record<string, unknown> | undefined>();
    if (!account) throw new Error("WA account not found");

    const conversation = await trx("wa_conversations")
      .where({ tenant_id: payload.tenantId, wa_conversation_id: payload.waConversationId })
      .first<Record<string, unknown> | undefined>();
    if (!conversation) throw new Error("WA conversation not found");

    const provider = getWaProviderAdapter();
    const result =
      payload.jobType === "send_media"
        ? await provider.sendMedia({
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
            delayMs: payload.delayMs ?? 0
          })
        : payload.jobType === "send_reaction"
          ? await provider.sendReaction({
              tenantId: payload.tenantId,
              waAccountId: payload.waAccountId,
              instanceKey: String(account.instance_key),
              remoteJid: payload.remoteJid ?? String(conversation.chat_jid),
              targetMessageId: payload.reactionTargetId ?? "",
              emoji: payload.emoji ?? ""
            })
          : await provider.sendText({
              tenantId: payload.tenantId,
              waAccountId: payload.waAccountId,
              instanceKey: String(account.instance_key),
              to: String(conversation.chat_jid),
              text: payload.text ?? "",
              quotedMessageId: payload.quotedMessageId ?? null,
              delayMs: payload.delayMs ?? 0
            });

    await trx("wa_outbound_jobs")
      .where({ job_id: payload.jobId })
      .update({
        send_status: "sent",
        last_error: null,
        updated_at: trx.fn.now(),
        payload: JSON.stringify({
          ...(typeof jobRow.payload === "string" ? JSON.parse(jobRow.payload) : (jobRow.payload as Record<string, unknown> ?? {})),
          sendResult: result
        })
      });

    await trx("wa_messages")
      .where({ tenant_id: payload.tenantId, wa_message_id: payload.waMessageId })
      .update({
        provider_message_id: result.providerMessageId,
        delivery_status: result.deliveryStatus,
        provider_payload: JSON.stringify(result.providerPayload),
        updated_at: trx.fn.now()
      });

    emitWaMessageUpdated({
      tenantId: payload.tenantId,
      waConversationId: payload.waConversationId,
      waMessageId: payload.waMessageId,
      providerMessageId: result.providerMessageId,
      deliveryStatus: result.deliveryStatus
    });

    return { sent: true, providerMessageId: result.providerMessageId };
  });
}
