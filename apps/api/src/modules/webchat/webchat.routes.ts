import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import { inboundQueue } from "../../infra/queue/queues.js";
import { isAllowedMimeType, saveUploadedFile } from "../../infra/storage/upload.service.js";
import {
  isInternalControlPayload,
  normalizeStructuredActions,
  normalizeStructuredMessage
} from "../../shared/messaging/structured-message.js";
import { findActiveWebChannelByPublicKey } from "../channel/channel.repository.js";
import { CustomerService } from "../customer/customer.service.js";

const customerService = new CustomerService();

export async function webchatRoutes(app: FastifyInstance) {
  app.get("/webchat.js", async (_req, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return buildWebchatWidgetScript();
  });

  app.post("/api/webchat/public/:publicKey/session", async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    const body = (req.body as {
      customerRef?: string;
      displayName?: string;
      client?: WebClientContextInput;
    } | undefined) ?? {};
    const customerRef = body.customerRef?.trim() || crypto.randomUUID();
    const displayName = body.displayName?.trim() || null;
    const channel = await resolveWebChannelByPublicKey(app, publicKey);
    const client = readClientContext(req.headers, body.client);

    return withTenantTransaction(channel.tenantId, async (trx) => {
      const customer = await customerService.getOrCreateByExternalRef(trx, {
        tenantId: channel.tenantId,
        channelType: "web",
        externalRef: customerRef,
        displayName: displayName ?? undefined
      });

      await patchWebClientMetadata(trx, {
        tenantId: channel.tenantId,
        customerId: customer.customerId,
        client
      });

      return {
        tenantId: channel.tenantId,
        tenantName: channel.tenantName,
        tenantSlug: channel.tenantSlug,
        channelId: channel.channelId,
        publicChannelKey: publicKey,
        customerRef,
        displayName,
        conversationId: null,
        client
      };
    });
  });

  app.get("/api/webchat/public/:publicKey/messages", async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    const query = req.query as { customerRef?: string; since?: string };
    const customerRef = query.customerRef?.trim();
    if (!customerRef) {
      throw app.httpErrors.badRequest("customerRef is required");
    }

    const channel = await resolveWebChannelByPublicKey(app, publicKey);
    const since = query.since ? new Date(query.since) : null;

    return withTenantTransaction(channel.tenantId, async (trx) => {
      const conversation = await trx("conversations as c")
        .join("customers as cu", "cu.customer_id", "c.customer_id")
        .select("c.conversation_id")
        .where({
          "c.tenant_id": channel.tenantId,
          "c.channel_id": channel.channelId,
          "c.channel_type": "web",
          "cu.external_ref": customerRef,
          "cu.primary_channel": "web"
        })
        .orderBy("c.updated_at", "desc")
        .first<{ conversation_id: string }>();

      if (!conversation) {
        return { conversationId: null, messages: [] };
      }

      const messageQuery = trx("messages")
        .leftJoin("messages as rm", function joinReplyMessage() {
          this.on("rm.message_id", "=", "messages.reply_to_message_id").andOn("rm.tenant_id", "=", "messages.tenant_id");
        })
        .select(
          "messages.message_id",
          "messages.direction",
          "messages.sender_type",
          "messages.message_type",
          "messages.content",
          "messages.reply_to_message_id",
          "messages.reply_to_external_id",
          "messages.reaction_target_message_id",
          "messages.reaction_target_external_id",
          "messages.reaction_emoji",
          "messages.created_at",
          "rm.content as reply_to_content"
        )
        .where({
          "messages.tenant_id": channel.tenantId,
          "messages.conversation_id": conversation.conversation_id
        })
        .orderBy("messages.created_at", "asc")
        .limit(200);

      if (since && !Number.isNaN(since.valueOf())) {
        messageQuery.andWhere("messages.created_at", ">", since);
      }

      const messages = await messageQuery;

      return {
        conversationId: conversation.conversation_id,
        messages: messages.map((message) => serializeWebchatMessageRow(message))
      };
    });
  });

  app.post("/api/webchat/public/:publicKey/messages", async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    const body = (req.body as {
      customerRef?: string;
      displayName?: string;
      text?: string;
      attachments?: WebAttachmentInput[];
      replyToMessageId?: string;
      reactionEmoji?: string;
      reactionToMessageId?: string;
      client?: WebClientContextInput;
    } | undefined) ?? {};
    const customerRef = body.customerRef?.trim();
    const text = body.text?.trim();
    const attachments = normalizeAttachments(body.attachments);
    const displayName = body.displayName?.trim();
    const replyToMessageId = normalizeString(body.replyToMessageId);
    const reactionEmoji = normalizeString(body.reactionEmoji);
    const reactionToMessageId = normalizeString(body.reactionToMessageId);
    const client = readClientContext(req.headers, body.client);

    if (!customerRef) {
      throw app.httpErrors.badRequest("customerRef is required");
    }
    if (reactionEmoji && !reactionToMessageId) {
      throw app.httpErrors.badRequest("reactionToMessageId is required");
    }
    if (!reactionEmoji && reactionToMessageId) {
      throw app.httpErrors.badRequest("reactionEmoji is required");
    }
    if (reactionEmoji && (text || attachments.length > 0 || replyToMessageId)) {
      throw app.httpErrors.badRequest("reaction cannot be combined with text, attachments, or reply");
    }
    if (!reactionEmoji && !text && attachments.length === 0) {
      throw app.httpErrors.badRequest("text, attachments, or reaction is required");
    }

    const channel = await resolveWebChannelByPublicKey(app, publicKey);
    const messageId = crypto.randomUUID();

    const [replyContext, reactionContext] = await withTenantTransaction(channel.tenantId, async (trx) => Promise.all([
      resolveWebchatMessageReference(trx, channel.tenantId, replyToMessageId),
      resolveWebchatMessageReference(trx, channel.tenantId, reactionToMessageId)
    ]));

    if (replyToMessageId && !replyContext.externalId) {
      throw app.httpErrors.badRequest("reply target message not found");
    }
    if (reactionToMessageId && !reactionContext.externalId) {
      throw app.httpErrors.badRequest("reaction target message not found");
    }

    await inboundQueue.add(
      "process-inbound",
      {
        tenantId: channel.tenantId,
        channelId: channel.channelId,
        channelType: "web",
        externalId: messageId,
        rawMessage: {
          id: messageId,
          customerRef,
          displayName,
          text,
          messageType: reactionEmoji && reactionContext.externalId ? "reaction" : attachments.length > 0 ? "media" : "text",
          attachments,
          context: replyContext.externalId ? { externalMessageId: replyContext.externalId } : undefined,
          reaction: reactionEmoji && reactionContext.externalId
            ? {
                emoji: reactionEmoji,
                targetExternalMessageId: reactionContext.externalId
              }
            : undefined,
          client,
          timestamp: new Date().toISOString()
        }
      },
      {
        jobId: `web:${channel.channelId}:${messageId}`,
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    return {
      queued: true,
      channelId: channel.channelId,
      publicChannelKey: publicKey,
      messageId
    };
  });

  app.post("/api/webchat/public/:publicKey/upload", async (req, reply) => {
    const { publicKey } = req.params as { publicKey: string };
    await resolveWebChannelByPublicKey(app, publicKey);

    const file = await req.file();
    if (!file) {
      throw app.httpErrors.badRequest("No file uploaded");
    }

    const mimeType = file.mimetype ?? "application/octet-stream";
    if (!isAllowedMimeType(mimeType)) {
      throw app.httpErrors.badRequest(`File type ${mimeType} is not allowed`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (file.file.truncated) {
      throw (app.httpErrors as any).requestEntityTooLarge("File too large");
    }

    const uploaded = await saveUploadedFile(buffer, file.filename, mimeType);
    return reply.code(201).send(uploaded);
  });

  app.get("/api/webchat/public/:publicKey/csat/pending", async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    const query = req.query as { customerRef?: string };
    const customerRef = query.customerRef?.trim();
    if (!customerRef) {
      throw app.httpErrors.badRequest("customerRef is required");
    }

    const channel = await resolveWebChannelByPublicKey(app, publicKey);
    return withTenantTransaction(channel.tenantId, async (trx) => {
      const row = await trx("csat_surveys as s")
        .join("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "s.customer_id").andOn("cu.tenant_id", "=", "s.tenant_id");
        })
        .where({
          "s.tenant_id": channel.tenantId,
          "s.channel_id": channel.channelId,
          "cu.external_ref": customerRef
        })
        .whereIn("s.status", ["scheduled", "sent"])
        .whereRaw("s.scheduled_at <= now()")
        .where((qb) => qb.whereNull("s.expires_at").orWhereRaw("s.expires_at > now()"))
        .select("s.survey_id", "s.survey_token", "s.status", "s.scheduled_at", "s.expires_at")
        .orderBy("s.scheduled_at", "desc")
        .first<{
          survey_id: string;
          survey_token: string;
          status: string;
          scheduled_at: string;
          expires_at: string | null;
        }>();

      if (!row) return { survey: null };
      return {
        survey: {
          surveyId: row.survey_id,
          token: row.survey_token,
          status: row.status,
          scheduledAt: new Date(row.scheduled_at).toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null
        }
      };
    });
  });

  app.post("/api/webchat/public/:publicKey/csat/respond", async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    const body = (req.body as {
      customerRef?: string;
      surveyToken?: string;
      rating?: number;
      feedback?: string;
    } | undefined) ?? {};

    const customerRef = body.customerRef?.trim();
    const surveyToken = body.surveyToken?.trim();
    const rating = Math.floor(Number(body.rating));
    if (!customerRef) throw app.httpErrors.badRequest("customerRef is required");
    if (!surveyToken) throw app.httpErrors.badRequest("surveyToken is required");
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw app.httpErrors.badRequest("rating must be 1-5");
    }

    const channel = await resolveWebChannelByPublicKey(app, publicKey);
    return withTenantTransaction(channel.tenantId, async (trx) => {
      const survey = await trx("csat_surveys as s")
        .join("customers as cu", function joinCustomer() {
          this.on("cu.customer_id", "=", "s.customer_id").andOn("cu.tenant_id", "=", "s.tenant_id");
        })
        .where({
          "s.tenant_id": channel.tenantId,
          "s.channel_id": channel.channelId,
          "s.survey_token": surveyToken,
          "cu.external_ref": customerRef
        })
        .select("s.survey_id", "s.conversation_id", "s.case_id", "s.customer_id", "s.agent_id", "s.status", "s.expires_at")
        .first<{
          survey_id: string;
          conversation_id: string;
          case_id: string | null;
          customer_id: string;
          agent_id: string | null;
          status: string;
          expires_at: string | null;
        }>();

      if (!survey) throw app.httpErrors.notFound("Survey not found");
      if (survey.expires_at && new Date(survey.expires_at).getTime() <= Date.now()) {
        throw app.httpErrors.badRequest("Survey expired");
      }

      const [response] = await trx("csat_responses")
        .insert({
          tenant_id: channel.tenantId,
          survey_id: survey.survey_id,
          conversation_id: survey.conversation_id,
          case_id: survey.case_id,
          customer_id: survey.customer_id,
          agent_id: survey.agent_id,
          rating,
          feedback: body.feedback?.trim() || null,
          source: "customer",
          metadata: {}
        })
        .onConflict(["survey_id"])
        .merge({
          case_id: survey.case_id,
          rating,
          feedback: body.feedback?.trim() || null,
          source: "customer",
          updated_at: trx.fn.now()
        })
        .returning(["response_id", "rating", "feedback", "responded_at"]);

      await trx("csat_surveys")
        .where({ tenant_id: channel.tenantId, survey_id: survey.survey_id })
        .update({ status: "responded", updated_at: trx.fn.now() });

      return {
        success: true,
        response: {
          responseId: response.response_id,
          rating: Number(response.rating),
          feedback: response.feedback,
          respondedAt: new Date(response.responded_at).toISOString()
        }
      };
    });
  });
}

async function resolveWebChannelByPublicKey(app: FastifyInstance, publicKey: string) {
  const channel = await findActiveWebChannelByPublicKey(publicKey);
  if (!channel) {
    throw app.httpErrors.notFound("Active WEB channel not found");
  }
  const tenant = await db("tenants")
    .select("name", "slug")
    .where({ tenant_id: channel.tenantId })
    .first<{ name: string; slug: string }>();
  return {
    ...channel,
    tenantName: tenant?.name ?? "Unknown Tenant",
    tenantSlug: tenant?.slug ?? "unknown"
  };
}

type WebClientContextInput = {
  source?: string;
  appId?: string | null;
  deviceType?: string;
  platform?: string | null;
  userAgent?: string | null;
  language?: string | null;
  timezone?: string | null;
  viewport?: { width?: number; height?: number };
  pageUrl?: string | null;
  referrer?: string | null;
};

type WebAttachmentInput = {
  name?: string;
  mimeType?: string;
  size?: number;
  url?: string;
};

function serializeWebchatMessageRow(message: {
  message_id: string;
  direction: string;
  sender_type?: string | null;
  message_type: string;
  content: unknown;
  reply_to_message_id?: string | null;
  reply_to_external_id?: string | null;
  reply_to_content?: unknown;
  reaction_target_message_id?: string | null;
  reaction_target_external_id?: string | null;
  reaction_emoji?: string | null;
  created_at: string;
}) {
  const payload = typeof message.content === "object" && message.content
    ? (message.content as Record<string, unknown>)
    : {};
  const text = typeof payload.text === "string" && !isInternalControlPayload(payload.text) ? payload.text : "";
  const payloadAttachments = Array.isArray(payload.attachments)
    ? (payload.attachments as Array<{ url?: string; mimeType?: string; fileName?: string }>)
    : [];
  const attachments = payloadAttachments.length > 0
    ? payloadAttachments.map((item) => ({
        name: String(item.fileName ?? "file"),
        mimeType: String(item.mimeType ?? "application/octet-stream"),
        size: 0,
        url: typeof item.url === "string" ? item.url : undefined
      }))
    : [];
  const structured = normalizeStructuredMessage(payload.structured);
  const actions = normalizeStructuredActions(payload.actions);
  const replyPayload = typeof message.reply_to_content === "object" && message.reply_to_content
    ? (message.reply_to_content as Record<string, unknown>)
    : null;
  const replyAttachments = Array.isArray(replyPayload?.attachments)
    ? (replyPayload.attachments as Array<{ url?: string; mimeType?: string; fileName?: string }>)
    : [];

  return {
    id: message.message_id,
    direction: message.direction,
    sender_type: message.sender_type ?? null,
    type: message.message_type,
    text,
    structured,
    actions,
    attachments,
    replyToMessageId: message.reply_to_message_id ?? null,
    replyToExternalId: message.reply_to_external_id ?? null,
    replyToContent: replyPayload
      ? {
          text: typeof replyPayload.text === "string" ? replyPayload.text : "",
          attachments: replyAttachments.map((item) => ({
            name: String(item.fileName ?? "file"),
            mimeType: String(item.mimeType ?? "application/octet-stream"),
            size: 0,
            url: typeof item.url === "string" ? item.url : undefined
          }))
        }
      : null,
    reactionTargetMessageId: message.reaction_target_message_id ?? null,
    reactionTargetExternalId: message.reaction_target_external_id ?? null,
    reactionEmoji: message.reaction_emoji ?? null,
    createdAt: new Date(message.created_at).toISOString()
  };
}

async function resolveWebchatMessageReference(
  trx: Knex.Transaction,
  tenantId: string,
  messageId: string | null
) {
  if (!messageId) {
    return { messageId: null, externalId: null };
  }

  const row = await trx("messages")
    .select("message_id", "external_id")
    .where({ tenant_id: tenantId, message_id: messageId })
    .first<{ message_id: string; external_id: string | null } | undefined>();

  return {
    messageId: row?.message_id ?? null,
    externalId: row?.external_id ?? null
  };
}

function normalizeAttachments(value: WebAttachmentInput[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 3)
    .map((item) => ({
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "file",
      mimeType: typeof item.mimeType === "string" && item.mimeType.trim()
        ? item.mimeType.trim()
        : "application/octet-stream",
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
      url: typeof item.url === "string" ? item.url : undefined
    }))
    .filter((item) => item.url);
}

function readClientContext(
  headers: Record<string, unknown>,
  bodyClient: WebClientContextInput | undefined
) {
  const ua = typeof headers["user-agent"] === "string" ? headers["user-agent"] : "";
  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  const referer = typeof headers.referer === "string" ? headers.referer : undefined;
  const fallbackDevice = /iPad|Tablet/i.test(ua)
    ? "tablet"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "mobile"
      : "desktop";

  return {
    source: normalizeString(bodyClient?.source) ?? "web",
    appId: normalizeString(bodyClient?.appId) ?? null,
    deviceType: normalizeString(bodyClient?.deviceType) ?? fallbackDevice,
    platform: normalizeString(bodyClient?.platform) ?? null,
    userAgent: normalizeString(bodyClient?.userAgent) ?? (ua || null),
    language: normalizeString(bodyClient?.language) ?? null,
    timezone: normalizeString(bodyClient?.timezone) ?? null,
    viewport: {
      width: clampNumber(bodyClient?.viewport?.width, 0, 10000),
      height: clampNumber(bodyClient?.viewport?.height, 0, 10000)
    },
    pageUrl: normalizeString(bodyClient?.pageUrl) ?? referer ?? null,
    referrer: normalizeString(bodyClient?.referrer) ?? origin ?? null
  };
}

async function patchWebClientMetadata(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    client: ReturnType<typeof readClientContext>;
  }
) {
  const patch = JSON.stringify({
    webClient: input.client,
    lastSeenAt: new Date().toISOString()
  });

  await trx("customers")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .update({
      metadata: trx.raw("COALESCE(metadata, '{}'::jsonb) || ?::jsonb", [patch]),
      updated_at: trx.fn.now()
    });
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function clampNumber(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function buildWebchatWidgetScript() {
  const defaultApiBase = readRequiredBaseUrlEnv("API_PUBLIC_BASE");
  const defaultAppBase = readRequiredBaseUrlEnv("WEBCHAT_APP_BASE");

  return `
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-key");
  if (!key) { console.error("[NuyChat] data-key is required"); return; }
  var apiBase = script.getAttribute("data-api-base") || ${JSON.stringify(defaultApiBase)};
  var appBase = script.getAttribute("data-app-base") || ${JSON.stringify(defaultAppBase)};
  var source = script.getAttribute("data-source") || "widget";
  var appId = script.getAttribute("data-app-id") || "web";
  var button = document.createElement("button");
  button.innerText = "客服";
  button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:10px 14px;border:none;border-radius:999px;background:#2563eb;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(37,99,235,.35);";
  var panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:16px;bottom:68px;z-index:2147483000;width:min(380px,calc(100vw - 24px));height:min(680px,calc(100vh - 100px));background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(2,6,23,.2);display:none;";
  var iframe = document.createElement("iframe");
  iframe.allow = "camera; microphone; clipboard-read; clipboard-write";
  iframe.style.cssText = "width:100%;height:100%;border:none;";
  iframe.src = appBase + "/?k=" + encodeURIComponent(key) + "&mode=widget&source=" + encodeURIComponent(source) + "&app=" + encodeURIComponent(appId);
  panel.appendChild(iframe);
  var isOpen = false;
  function applyMobileLayout() {
    if (window.innerWidth <= 768) {
      panel.style.right = "0";
      panel.style.bottom = "0";
      panel.style.width = "100vw";
      panel.style.height = "100vh";
      panel.style.borderRadius = "0";
    } else {
      panel.style.right = "16px";
      panel.style.bottom = "68px";
      panel.style.width = "min(380px,calc(100vw - 24px))";
      panel.style.height = "min(680px,calc(100vh - 100px))";
      panel.style.borderRadius = "14px";
    }
  }
  function toggle() {
    isOpen = !isOpen;
    panel.style.display = isOpen ? "block" : "none";
  }
  button.addEventListener("click", toggle);
  window.addEventListener("resize", applyMobileLayout);
  applyMobileLayout();
  document.body.appendChild(button);
  document.body.appendChild(panel);
})();`;
}
import { readRequiredBaseUrlEnv } from "../../infra/env.js";
