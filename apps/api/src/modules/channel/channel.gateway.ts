import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import { inboundQueue } from "../../infra/queue/queues.js";

export async function channelGateway(app: FastifyInstance) {
  app.get("/webhook/:channelId", async (req, reply) => {
    const query = req.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === process.env.WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.send(query["hub.challenge"] ?? "");
    }

    return reply.status(403).send("Forbidden");
  });

  app.post(
    "/webhook/:channelId",
    {
      config: { rawBody: true }
    },
    async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (req as { rawBody?: Buffer }).rawBody;

      if (!verifySignature(rawBody, signature)) {
        return reply.status(401).send("Invalid signature");
      }

      const payload = req.body as Record<string, unknown>;
      const messages = extractMessages(payload);

      for (const msg of messages) {
        const messageId = typeof msg.id === "string" ? msg.id : crypto.randomUUID();
        await inboundQueue.add(
          "process-inbound",
          {
            channelId,
            channelType: "whatsapp",
            rawMessage: msg
          },
          {
            jobId: `wa:${messageId}`,
            removeOnComplete: 100,
            removeOnFail: 50
          }
        );
      }

      return reply.send("EVENT_RECEIVED");
    }
  );
}

function verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!rawBody || !signature?.startsWith("sha256=") || !process.env.META_APP_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature.slice(7), "hex")
    );
  } catch {
    return false;
  }
}

type InboundMessage = {
  id?: string;
  [key: string]: unknown;
};

function extractMessages(payload: Record<string, unknown>): InboundMessage[] {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
  const changes =
    entry && typeof entry === "object" && Array.isArray((entry as { changes?: unknown[] }).changes)
      ? (entry as { changes: unknown[] }).changes[0]
      : undefined;
  const value = changes && typeof changes === "object" ? (changes as { value?: unknown }).value : undefined;
  return value && typeof value === "object" && Array.isArray((value as { messages?: unknown[] }).messages)
    ? ((value as { messages: InboundMessage[] }).messages ?? [])
    : [];
}

