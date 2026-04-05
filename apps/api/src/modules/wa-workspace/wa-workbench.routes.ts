/**
 * 作用:
 * - 提供 WA 员工工作台接口。
 *
 * 交互:
 * - 使用 wa-auth 强校验租户登录态与 WA 座席资格。
 * - 调用 wa-workbench.service 处理会话列表、接管、发送消息等业务。
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
  releaseWorkbenchConversation,
  takeOverWorkbenchConversation
} from "./wa-workbench.service.js";

export async function waWorkbenchRoutes(app: FastifyInstance) {
  app.get("/api/wa/workbench/accounts", async (req) => {
    const auth = requireWaSeatAccess(app, req);
    return withTenantTransaction(auth.tenantId, async (trx) => listWorkbenchAccounts(trx, auth));
  });

  app.post("/api/wa/workbench/accounts/:waAccountId/login-task", async (req) => {
    const auth = requireWaSeatAccess(app, req);
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
          text: body.text.trim()
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
        caption: typeof body.text === "string" ? body.text.trim() : null
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
}
