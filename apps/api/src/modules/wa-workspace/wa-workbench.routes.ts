/**
 * 作用:
 * - 提供 WA 员工工作台接口。
 *
 * 交互:
 * - 使用 wa-auth 强校验租户登录态与 WA 座席资格。
 * - 调用 wa-workbench.service 处理会话列表、接管、发送消息等业务。
 * - 调用 wa-runtime.service 暴露 WA provider 可用性，避免未部署时进入 WA 工作台。
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { requireWaSeatAccess } from "./wa-auth.js";
import { enqueueWaOutboundJob } from "./wa-outbound.service.js";
import {
  enqueueWorkbenchMediaMessage,
  enqueueWorkbenchReaction,
  createWorkbenchLoginTask,
  enqueueWorkbenchTextMessage,
  forceAssignWorkbenchConversation,
  getWorkbenchConversationDetail,
  listWorkbenchAccounts,
  listWorkbenchConversations,
  loadMoreWorkbenchMessages,
  releaseWorkbenchConversation,
  takeOverWorkbenchConversation,
  listWorkbenchContacts,
  openWorkbenchContactConversation
} from "./wa-workbench.service.js";
import { getWaRuntimeStatus } from "./wa-runtime.service.js";

export async function waWorkbenchRoutes(app: FastifyInstance) {
  app.get("/api/wa/workbench/runtime", async (req) => {
    void requireWaSeatAccess(app, req);
    return getWaRuntimeStatus();
  });

  app.get("/api/wa/workbench/accounts", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    return withTenantTransaction(auth.tenantId, async (trx) => listWorkbenchAccounts(trx, auth));
  });

  app.post("/api/wa/workbench/accounts/:waAccountId/login-task", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const runtime = getWaRuntimeStatus();
    if (!runtime.available) {
      throw app.httpErrors.serviceUnavailable("WhatsApp provider is not available");
    }
    const { waAccountId } = req.params as { waAccountId: string };
    return withTenantTransaction(auth.tenantId, async (trx) =>
      createWorkbenchLoginTask(trx, { ...auth, waAccountId })
    );
  });

  app.get("/api/wa/workbench/conversations", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const query = req.query as { accountId?: string; assignedToMe?: string; type?: string };
    return withTenantTransaction(auth.tenantId, async (trx) =>
      listWorkbenchConversations(trx, {
        ...auth,
        accountId: query.accountId ?? null,
        assignedToMe: query.assignedToMe === "true",
        type: query.type ?? null
      })
    );
  });

  app.get("/api/wa/workbench/conversations/:waConversationId", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    return withTenantTransaction(auth.tenantId, async (trx) =>
      getWorkbenchConversationDetail(trx, { ...auth, waConversationId })
    );
  });

  // Load earlier messages (pagination) — returns messages older than beforeSeq
  app.get("/api/wa/workbench/conversations/:waConversationId/messages", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    const query = req.query as { beforeSeq?: string; limit?: string };
    const beforeSeq = query.beforeSeq ? Number(query.beforeSeq) : null;
    if (beforeSeq === null || !Number.isFinite(beforeSeq)) {
      throw app.httpErrors.badRequest("beforeSeq (number) is required");
    }
    const limit = query.limit ? Math.min(Number(query.limit) || 50, 100) : 50;
    return withTenantTransaction(auth.tenantId, async (trx) =>
      loadMoreWorkbenchMessages(trx, {
        ...auth,
        waConversationId,
        beforeLogicalSeq: beforeSeq,
        limit
      })
    );
  });

  app.post("/api/wa/workbench/conversations/:waConversationId/takeover", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    const body = req.body as { reason?: string };
    return withTenantTransaction(auth.tenantId, async (trx) =>
      takeOverWorkbenchConversation(trx, {
        tenantId: auth.tenantId,
        membershipId: auth.membershipId,
        role: auth.role,
        waConversationId,
        reason: body.reason ?? null
      })
    );
  });

  app.post("/api/wa/workbench/conversations/:waConversationId/release", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    const body = req.body as { reason?: string };
    return withTenantTransaction(auth.tenantId, async (trx) =>
      releaseWorkbenchConversation(trx, {
        tenantId: auth.tenantId,
        membershipId: auth.membershipId,
        role: auth.role,
        waConversationId,
        reason: body.reason ?? null
      })
    );
  });

  app.post("/api/wa/workbench/conversations/:waConversationId/force-assign", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    const body = req.body as { memberId?: string; reason?: string };
    if (typeof body.memberId !== "string" || !body.memberId.trim()) {
      throw app.httpErrors.badRequest("memberId is required");
    }
    return withTenantTransaction(auth.tenantId, async (trx) =>
      forceAssignWorkbenchConversation(trx, {
        tenantId: auth.tenantId,
        membershipId: auth.membershipId,
        role: auth.role,
        waConversationId,
        targetMembershipId: body.memberId.trim(),
        reason: body.reason ?? null
      })
    );
  });

  app.post("/api/wa/workbench/conversations/:waConversationId/messages", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waConversationId } = req.params as { waConversationId: string };
    const body = req.body as {
      clientMessageId?: string;
      text?: string;
      type?: string;
      quotedMessageId?: string;
      attachment?: { url?: string; mimeType?: string; fileName?: string };
    };
    if (typeof body.clientMessageId !== "string" || !body.clientMessageId.trim()) {
      throw app.httpErrors.badRequest("clientMessageId is required");
    }
    const messageType = typeof body.type === "string" ? body.type : "text";
    const result = await withTenantTransaction(auth.tenantId, async (trx) => {
      if (messageType === "text") {
        if (typeof body.text !== "string" || !body.text.trim()) {
          throw app.httpErrors.badRequest("text is required");
        }
        return enqueueWorkbenchTextMessage(trx, {
          tenantId: auth.tenantId,
          membershipId: auth.membershipId,
          role: auth.role,
          waConversationId,
          clientMessageId: body.clientMessageId.trim(),
          text: body.text.trim(),
          quotedMessageId: typeof body.quotedMessageId === "string" ? body.quotedMessageId.trim() || null : null
        });
      }

      if (!["image", "video", "audio", "document"].includes(messageType)) {
        throw app.httpErrors.badRequest("unsupported message type");
      }
      if (!body.attachment?.url || !body.attachment?.mimeType || !body.attachment?.fileName) {
        throw app.httpErrors.badRequest("attachment url, mimeType and fileName are required");
      }
      return enqueueWorkbenchMediaMessage(trx, {
        tenantId: auth.tenantId,
        membershipId: auth.membershipId,
        role: auth.role,
        waConversationId,
        clientMessageId: body.clientMessageId.trim(),
        mediaType: messageType as "image" | "video" | "audio" | "document",
        mimeType: body.attachment.mimeType,
        fileName: body.attachment.fileName,
        mediaUrl: body.attachment.url,
        caption: typeof body.text === "string" ? body.text.trim() : null,
        quotedMessageId: typeof body.quotedMessageId === "string" ? body.quotedMessageId.trim() || null : null
      });
    });
    await enqueueWaOutboundJob(result.queuePayload);
    return {
      jobId: result.jobId,
      waMessageId: result.waMessageId
    };
  });

  app.post("/api/wa/workbench/messages/:waMessageId/reaction", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { waMessageId } = req.params as { waMessageId: string };
    const body = req.body as { conversationId?: string; emoji?: string };
    if (typeof body.conversationId !== "string" || !body.conversationId.trim()) {
      throw app.httpErrors.badRequest("conversationId is required");
    }
    if (typeof body.emoji !== "string" || !body.emoji.trim()) {
      throw app.httpErrors.badRequest("emoji is required");
    }
    const result = await withTenantTransaction(auth.tenantId, async (trx) =>
      enqueueWorkbenchReaction(trx, {
        tenantId: auth.tenantId,
        membershipId: auth.membershipId,
        role: auth.role,
        waConversationId: body.conversationId.trim(),
        targetWaMessageId: waMessageId,
        emoji: body.emoji.trim()
      })
    );
    await enqueueWaOutboundJob(result.queuePayload);
    return { jobId: result.jobId };
  });

  app.post("/api/wa/workbench/uploads", async (req, reply) => {
    const auth = requireWaSeatAccess(app, req);
    void auth;
    const file = await req.file();
    if (!file) {
      throw app.httpErrors.badRequest("No file uploaded");
    }

    const mimeType = file.mimetype ?? "application/octet-stream";
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (file.file.truncated) {
      throw app.httpErrors.requestEntityTooLarge("File too large");
    }
    const { isAllowedMimeType, saveUploadedFile } = await import("../../infra/storage/upload.service.js");
    if (!isAllowedMimeType(mimeType)) {
      throw app.httpErrors.badRequest(`File type ${mimeType} is not allowed`);
    }
    const result = await saveUploadedFile(buffer, file.filename, mimeType);
    return reply.code(201).send(result);
  });

  // ─── Contacts (好友列表) ─────────────────────────────────────────────────────
  // Returns all WA contacts synced from the account's phone book via contacts.upsert events.
  // Only contacts with at least one matching contact_jid are returned.
  app.get("/api/wa/workbench/contacts", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { accountId, search } = req.query as { accountId?: string; search?: string };
    if (!accountId) {
      throw app.httpErrors.badRequest("accountId is required");
    }
    return withTenantTransaction(auth.tenantId, async (trx) =>
      listWorkbenchContacts(trx, { ...auth, waAccountId: accountId, search: search ?? null })
    );
  });

  // ─── Media proxy (decrypt WhatsApp CDN media) ───────────────────────────────
  // WhatsApp CDN URLs (mmg.whatsapp.net/*.enc) are AES-CBC encrypted.
  // This endpoint fetches and decrypts media server-side using the stored mediaKey,
  // then streams the clear-text bytes back to the browser.
  // Token may be passed as ?token= query param since <img>/<video>/<audio> cannot set headers.
  app.get("/api/wa/media/:attachmentId", async (req, reply) => {
    const auth = requireWaSeatAccess(app, req);
    const { attachmentId } = req.params as { attachmentId: string };

    const result = await withTenantTransaction(auth.tenantId, async (trx) => {
      const att = await trx("wa_message_attachments")
        .where({ tenant_id: auth.tenantId, attachment_id: attachmentId })
        .first<Record<string, unknown> | undefined>();
      if (!att) return null;
      return att;
    });

    if (!result) throw app.httpErrors.notFound("Attachment not found");

    // provider_payload on the attachment row IS the full raw Baileys WAMessage,
    // which contains the mediaKey, fileEncSha256, directPath, etc. needed for decryption.
    const rawPayload = result.provider_payload;
    const payload = rawPayload
      ? (typeof rawPayload === "string" ? JSON.parse(String(rawPayload)) : rawPayload) as Record<string, unknown>
      : null;

    const attachmentType = String(result.attachment_type) as "image" | "video" | "audio" | "document" | "sticker";
    const contentKeyMap: Record<string, string> = {
      image: "imageMessage",
      video: "videoMessage",
      audio: "audioMessage",
      document: "documentMessage",
      sticker: "stickerMessage"
    };
    const msgContent = (payload?.message as Record<string, unknown> | null)?.[contentKeyMap[attachmentType]] as Record<string, unknown> | null;
    if (!msgContent) {
      throw app.httpErrors.notFound("Media content not available in stored payload");
    }

    // Buffers become { type:"Buffer", data:[...] } or {0:1,1:2,...} after JSON round-trip.
    function toBuffer(v: unknown): Buffer | undefined {
      if (!v) return undefined;
      if (Buffer.isBuffer(v)) return v;
      if (v instanceof Uint8Array) return Buffer.from(v);
      if (typeof v === "string") return Buffer.from(v, "base64");
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (o["type"] === "Buffer" && Array.isArray(o["data"])) return Buffer.from(o["data"] as number[]);
        const keys = Object.keys(o).filter((k) => /^\d+$/.test(k));
        if (keys.length > 0) return Buffer.from(keys.sort((a, b) => Number(a) - Number(b)).map((k) => Number(o[k])));
      }
      return undefined;
    }

    const reconstructed = {
      ...msgContent,
      mediaKey: toBuffer(msgContent["mediaKey"]),
      fileEncSha256: toBuffer(msgContent["fileEncSha256"]),
      fileSha256: toBuffer(msgContent["fileSha256"])
    };

    if (!reconstructed.mediaKey) {
      throw app.httpErrors.badGateway("Media key missing — cannot decrypt");
    }

    try {
      const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(
        reconstructed as Parameters<typeof downloadContentFromMessage>[0],
        attachmentType
      );

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      const mimeType = result.mime_type ? String(result.mime_type) : "application/octet-stream";
      const fileName = result.file_name ? String(result.file_name) : null;

      void reply.header("Content-Type", mimeType);
      void reply.header("Cache-Control", "private, max-age=86400");
      if (fileName) {
        void reply.header("Content-Disposition", `inline; filename="${fileName}"`);
      }
      return reply.send(buffer);
    } catch (error) {
      app.log.error({ attachmentId, error }, "[wa-media-proxy] decrypt/download failed");
      throw app.httpErrors.badGateway("Failed to fetch media from WhatsApp");
    }
  });

  app.post("/api/wa/workbench/contacts/:contactId/open", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    const { contactId } = req.params as { contactId: string };
    const body = req.body as { accountId?: string };
    if (!body.accountId) {
      throw app.httpErrors.badRequest("accountId is required");
    }
    return withTenantTransaction(auth.tenantId, async (trx) =>
      openWorkbenchContactConversation(trx, {
        ...auth,
        waAccountId: body.accountId!,
        contactId
      })
    );
  });
}
