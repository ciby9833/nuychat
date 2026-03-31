import { EventEmitter } from "node:events";

import { duplicateRedisConnection } from "../../infra/redis/client.js";

type RealtimeEventBase = {
  eventId?: string;
};

type ConversationCreatedEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelId: string;
  channelType: string;
  chatType?: "direct" | "group";
  chatExternalRef?: string;
  chatName?: string | null;
  lastMessagePreview: string | null;
  occurredAt: string;
};

type ConversationUpdatedEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  unreadCount?: number;
  lastMessagePreview?: string | null;
  status?: string;
  queueStatus?: string;
  assignedAgentId?: string | null;
  skillGroupId?: string | null;
  occurredAt: string;
};

type MessageReceivedEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  messageId: string | null;
  externalId: string;
  messageType: string;
  chatType?: "direct" | "group";
  chatExternalRef?: string;
  chatName?: string | null;
  text?: string;
  senderExternalRef: string;
  occurredAt: string;
};

type MessageSentEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  messageId: string | null;
  text?: string;
  senderId?: string | null;
  occurredAt: string;
};

type MessageUpdatedEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  messageId: string;
  messageStatus: string;
  occurredAt: string;
};

type TaskUpdatedEvent = RealtimeEventBase & {
  tenantId: string;
  taskId: string;
  conversationId?: string | null;
  status: string;
  title: string;
  summary?: string | null;
  error?: string | null;
  occurredAt: string;
};

type TicketSlaWarningEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  occurredAt: string;
};

type TicketSlaBreachedEvent = RealtimeEventBase & {
  tenantId: string;
  conversationId: string;
  occurredAt: string;
};

export type RealtimeEvents = {
  "conversation.created": ConversationCreatedEvent;
  "conversation.updated": ConversationUpdatedEvent;
  "message.received": MessageReceivedEvent;
  "message.sent": MessageSentEvent;
  "message.updated": MessageUpdatedEvent;
  "task.updated": TaskUpdatedEvent;
};

class RealtimeEventBus extends EventEmitter {
  private readonly channel = "realtime.events";
  private readonly publisher = duplicateRedisConnection();
  private readonly subscriber = duplicateRedisConnection();
  private readonly streamWriter = duplicateRedisConnection();
  private subscriptionReady: Promise<void> | null = null;
  private subscriberBound = false;

  emitEvent<K extends keyof RealtimeEvents>(event: K, payload: RealtimeEvents[K]) {
    void this.publish(event, payload);
  }

  onEvent<K extends keyof RealtimeEvents>(event: K, listener: (payload: RealtimeEvents[K]) => void) {
    void this.ensureSubscription();
    this.on(event, listener);
    return () => this.off(event, listener);
  }

  async close() {
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit(), this.streamWriter.quit()]);
  }

  private async publish<K extends keyof RealtimeEvents>(event: K, payload: RealtimeEvents[K]) {
    await this.ensureSubscription();
    const eventId = await this.appendToStream(payload.tenantId, event, payload);
    const enrichedPayload = {
      ...payload,
      eventId
    } as RealtimeEvents[K];
    await this.publisher.publish(
      this.channel,
      JSON.stringify({
        event,
        payload: enrichedPayload
      })
    );
  }

  private async ensureSubscription() {
    if (!this.subscriptionReady) {
      this.subscriptionReady = (async () => {
        if (!this.subscriberBound) {
          this.subscriber.on("message", (_channel, raw) => {
            const parsed = parseRealtimeEnvelope(raw);
            if (!parsed) return;
            this.emit(parsed.event, parsed.payload);
          });
          this.subscriberBound = true;
        }
        await this.subscriber.subscribe(this.channel);
      })();
    }

    await this.subscriptionReady;
  }

  private async appendToStream<K extends keyof RealtimeEvents>(tenantId: string, event: K, payload: RealtimeEvents[K]) {
    return this.streamWriter.xadd(
      streamKeyForTenant(tenantId),
      "MAXLEN",
      "~",
      10000,
      "*",
      "event",
      String(event),
      "payload",
      JSON.stringify(payload)
    );
  }
}

export const realtimeEventBus = new RealtimeEventBus();

export async function replayTenantEvents(
  tenantId: string,
  afterEventId?: string | null,
  limit = 200
): Promise<Array<{ eventId: string; event: keyof RealtimeEvents; payload: RealtimeEvents[keyof RealtimeEvents] }>> {
  const redis = duplicateRedisConnection();
  try {
    const rows = await redis.xrange(
      streamKeyForTenant(tenantId),
      afterEventId ? `(${afterEventId}` : "-",
      "+",
      "COUNT",
      Math.min(Math.max(limit, 1), 500)
    );

    return rows.flatMap(([eventId, fields]) => {
      const event = readField(fields, "event");
      const payloadRaw = readField(fields, "payload");
      if (!event || !payloadRaw) return [];
      try {
        const payload = JSON.parse(payloadRaw) as RealtimeEvents[keyof RealtimeEvents];
        return [{
          eventId,
          event: event as keyof RealtimeEvents,
          payload: {
            ...payload,
            eventId
          }
        }];
      } catch {
        return [];
      }
    });
  } finally {
    await redis.quit().catch(() => null);
  }
}

function streamKeyForTenant(tenantId: string) {
  return `realtime.events.stream:${tenantId}`;
}

function readField(fields: string[], key: string) {
  const index = fields.findIndex((field) => field === key);
  return index >= 0 ? fields[index + 1] ?? null : null;
}

function parseRealtimeEnvelope(raw: string):
  | { event: keyof RealtimeEvents; payload: RealtimeEvents[keyof RealtimeEvents] }
  | null {
  try {
    const parsed = JSON.parse(raw) as { event?: keyof RealtimeEvents; payload?: RealtimeEvents[keyof RealtimeEvents] };
    if (!parsed?.event || !parsed.payload) return null;
    return {
      event: parsed.event,
      payload: parsed.payload
    };
  } catch {
    return null;
  }
}

export type {
  ConversationCreatedEvent,
  ConversationUpdatedEvent,
  MessageReceivedEvent,
  MessageSentEvent,
  TicketSlaWarningEvent,
  TicketSlaBreachedEvent,
  TaskUpdatedEvent
};
