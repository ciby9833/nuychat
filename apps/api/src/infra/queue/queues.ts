import { Queue } from "bullmq";

import { redisConnection } from "../redis/client.js";

export const inboundQueue = new Queue("inbound", { connection: redisConnection });
export const outboundQueue = new Queue("outbound", { connection: redisConnection });
export const analyticsQueue = new Queue("analytics", { connection: redisConnection });
export const routingQueue = new Queue("routing", { connection: redisConnection });
export const taskEngineQueue = new Queue("task-engine", { connection: redisConnection });
export const customerProfileRefreshQueue = new Queue("customer-profile-refresh", { connection: redisConnection });
export const conversationTimeoutQueue = new Queue("conversation-timeout", { connection: redisConnection });

export type InboundJobPayload = {
  tenantId: string;
  channelId: string;
  channelType: string;
  externalId: string;
  rawMessage: Record<string, unknown>;
};

export type OutboundMediaPayload = {
  url: string;
  mimeType: string;
  fileName?: string;
};

export type OutboundJobPayload = {
  tenantId: string;
  conversationId: string;
  channelId: string;
  channelType: string;
  message: {
    text: string;
    agentId?: string;
    /** Populated for AI-generated replies; causes sender_type="bot" in DB */
    aiAgentName?: string;
    /** Optional attachment sent by agent */
    attachment?: OutboundMediaPayload;
    replyToMessageId?: string;
    replyToExternalId?: string;
    reactionEmoji?: string;
    reactionMessageId?: string;
    reactionExternalId?: string;
  };
};

export type RoutingJobPayload = {
  tenantId: string;
  planId: string;
  conversationId: string;
  customerId: string;
  messageId?: string | null;
  channelType: string;
};

export type TaskScheduleJobPayload = {
  tenantId: string;
  customerId?: string | null;
  conversationId?: string | null;
  caseId?: string | null;
  taskType: string;
  title: string;
  source: "system" | "ai" | "agent" | "workflow";
  priority?: number;
  schedulerKey?: string | null;
  createdById?: string | null;
  payload: Record<string, unknown>;
};

export type TaskEngineJobPayload = {
  tenantId: string;
  taskId: string;
};

export type CustomerProfileRefreshJobPayload = {
  tenantId?: string | null;
  limit?: number;
};

export type ConversationTimeoutJobPayload = {
  tenantId: string;
  conversationId: string;
  /**
   * Primary timeout semantics:
   * - first_response: no human first reply yet
   * - assignment_accept: assigned/reserved but still unclaimed
   * - follow_up: already handled, now waiting to close or follow up
   *
   * Legacy values remain accepted in-flight so existing delayed jobs do not break
   * during rolling restarts.
   */
  alertType:
    | "first_response"
    | "assignment_accept"
    | "follow_up"
    | "frt"
    | "reassign"
    | "close"
    | "unanswered_close";
  followUpMode?: "semantic" | "waiting_customer";
  closeMode?: "semantic" | "waiting_customer";
  /** Epoch ms when this job was scheduled — used to skip if activity occurred after scheduling */
  scheduledAt: number;
};
