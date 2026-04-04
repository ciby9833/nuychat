import { Queue } from "bullmq";

import { redisConnection } from "../redis/client.js";
import type { StructuredMessage, StructuredMessageAction } from "../../shared/types/structured-message.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conn = redisConnection as any;
export const inboundQueue = new Queue("inbound", { connection: conn });
export const outboundQueue = new Queue("outbound", { connection: conn });
export const analyticsQueue = new Queue("analytics", { connection: conn });
export const routingQueue = new Queue("routing", { connection: conn });
export const taskBackgroundQueue = new Queue("task-background", { connection: conn });
export const taskScriptQueue = new Queue("task-script", { connection: conn });
export const customerProfileRefreshQueue = new Queue("customer-profile-refresh", { connection: conn });
export const conversationTimeoutQueue = new Queue("conversation-timeout", { connection: conn });

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
  taskContext?: {
    taskId: string;
    markCustomerReplySent?: boolean;
  };
  message: {
    text: string;
    structured?: StructuredMessage | null;
    actions?: StructuredMessageAction[];
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
   * - subsequent_response: service has replied before, customer replied again, owner has not followed up
   * - follow_up: already handled, now waiting to close or follow up
   *
   * Legacy values remain accepted in-flight so existing delayed jobs do not break
   * during rolling restarts.
   */
  alertType:
    | "first_response"
    | "assignment_accept"
    | "subsequent_response"
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
