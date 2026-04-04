import type { Knex } from "knex";

import { toIsoString } from "../tenant/tenant-admin.shared.js";
import { extractMessageText, QA_RUNTIME_LIMITS } from "./qa-v2.shared.js";
import type { QaCaseEvidence, QaCaseMessage, QaCaseSegment } from "./qa-v2.types.js";

export async function loadQaCaseEvidence(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  caseId: string
): Promise<QaCaseEvidence | null> {
  const row = await trx("conversation_cases as cc")
    .join("conversations as c", function joinConversation() {
      this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("customers as cu", function joinCustomer() {
      this.on("cu.customer_id", "=", "cc.customer_id").andOn("cu.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("agent_profiles as final_ap", function joinFinalAgent() {
      this.on("final_ap.agent_id", "=", "cc.final_owner_id").andOn("final_ap.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_ai_agents as final_ai", function joinFinalAi() {
      this.on("final_ai.ai_agent_id", "=", "cc.final_owner_id").andOn("final_ai.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("agent_profiles as resolved_ap", function joinResolvedAgent() {
      this.on("resolved_ap.agent_id", "=", "cc.resolved_by_agent_id").andOn("resolved_ap.tenant_id", "=", "cc.tenant_id");
    })
    .where({ "cc.tenant_id": tenantId, "cc.case_id": caseId })
    .select(
      "cc.case_id",
      "cc.conversation_id",
      "cc.customer_id",
      "cc.title",
      "cc.summary",
      "cc.status",
      "cc.opened_at",
      "cc.resolved_at",
      "cc.closed_at",
      "cc.last_activity_at",
      "cc.final_owner_type",
      "cc.final_owner_id",
      "cc.resolved_by_agent_id",
      "c.channel_type",
      "cu.display_name as customer_name",
      "cu.external_ref as customer_ref",
      "cu.tier as customer_tier",
      "resolved_ap.display_name as resolved_agent_name",
      "final_ap.display_name as final_owner_agent_name",
      "final_ai.name as final_owner_ai_name"
    )
    .first<Record<string, unknown> | undefined>();

  if (!row) return null;

  const [segmentsRaw, messagesRaw, reassignRow, slaRow] = await Promise.all([
    trx("conversation_segments as cs")
      .leftJoin("agent_profiles as ap", function joinAgent() {
        this.on("ap.agent_id", "=", "cs.owner_agent_id").andOn("ap.tenant_id", "=", "cs.tenant_id");
      })
      .leftJoin("tenant_ai_agents as ai", function joinAi() {
        this.on("ai.ai_agent_id", "=", "cs.owner_ai_agent_id").andOn("ai.tenant_id", "=", "cs.tenant_id");
      })
      .leftJoin("messages as m", function joinMessage() {
        this.on("m.segment_id", "=", "cs.segment_id").andOn("m.tenant_id", "=", "cs.tenant_id");
      })
      .where({ "cs.tenant_id": tenantId, "cs.case_id": caseId })
      .groupBy(
        "cs.segment_id",
        "cs.owner_type",
        "cs.owner_agent_id",
        "ap.display_name",
        "cs.owner_ai_agent_id",
        "ai.name",
        "cs.status",
        "cs.started_at",
        "cs.ended_at",
        "cs.opened_reason",
        "cs.closed_reason",
        "cs.transferred_from_segment_id"
      )
      .select(
        "cs.segment_id",
        "cs.owner_type",
        "cs.owner_agent_id",
        "ap.display_name as owner_agent_name",
        "cs.owner_ai_agent_id",
        "ai.name as owner_ai_agent_name",
        "cs.status",
        "cs.started_at",
        "cs.ended_at",
        "cs.opened_reason",
        "cs.closed_reason",
        "cs.transferred_from_segment_id"
      )
      .count<{ segment_id: string; message_count: string }[]>("m.message_id as message_count")
      .orderBy("cs.started_at", "asc"),
    trx("messages as m")
      .leftJoin("agent_profiles as ap", function joinAgent() {
        this.on("ap.agent_id", "=", "m.sender_id").andOn("ap.tenant_id", "=", "m.tenant_id");
      })
      .leftJoin("tenant_ai_agents as ai", function joinAi() {
        this.on("ai.ai_agent_id", "=", "m.sender_id").andOn("ai.tenant_id", "=", "m.tenant_id");
      })
      .where({ "m.tenant_id": tenantId, "m.case_id": caseId })
      .select(
        "m.message_id",
        "m.segment_id",
        "m.direction",
        "m.sender_type",
        "m.sender_id",
        "m.content",
        "m.created_at",
        "ap.display_name as sender_agent_name",
        "ai.name as sender_ai_name"
      )
      .orderBy("m.created_at", "asc")
      .limit(QA_RUNTIME_LIMITS.caseMessageLimit),
    trx("conversation_events")
      .where({ tenant_id: tenantId, conversation_id: row.conversation_id, event_type: "assignment_reassigned" })
      .count<{ cnt: string }>("event_type as cnt")
      .first(),
    trx("sla_breaches")
      .where({ tenant_id: tenantId, case_id: caseId })
      .count<{ cnt: string }>("breach_id as cnt")
      .first()
  ]);

  const segments: QaCaseSegment[] = segmentsRaw.map((segment: any) => ({
    segmentId: segment.segment_id,
    ownerType: segment.owner_type,
    ownerAgentId: segment.owner_agent_id ?? null,
    ownerAgentName: segment.owner_agent_name ?? null,
    ownerAiAgentId: segment.owner_ai_agent_id ?? null,
    ownerAiAgentName: segment.owner_ai_agent_name ?? null,
    status: segment.status,
    startedAt: toIsoString(segment.started_at),
    endedAt: segment.ended_at ? toIsoString(segment.ended_at) : null,
    openedReason: segment.opened_reason ?? null,
    closedReason: segment.closed_reason ?? null,
    transferredFromSegmentId: segment.transferred_from_segment_id ?? null,
    messageCount: Number(segment.message_count ?? 0)
  }));

  const messages: QaCaseMessage[] = messagesRaw.map((message: any) => ({
    messageId: message.message_id,
    segmentId: message.segment_id ?? null,
    direction: message.direction,
    senderType: message.sender_type ?? null,
    senderId: message.sender_id ?? null,
    senderName: message.sender_agent_name ?? message.sender_ai_name ?? null,
    createdAt: toIsoString(message.created_at),
    text: extractMessageText(message.content)
  }));

  const finalOwnerType = typeof row.final_owner_type === "string" ? row.final_owner_type : null;
  const finalOwnerName = finalOwnerType === "ai"
    ? (row.final_owner_ai_name as string | null) ?? null
    : (row.final_owner_agent_name as string | null) ?? null;

  return {
    caseId: String(row.case_id),
    conversationId: String(row.conversation_id),
    customerId: String(row.customer_id),
    customerName: (row.customer_name as string | null) ?? null,
    customerRef: (row.customer_ref as string | null) ?? null,
    customerTier: (row.customer_tier as string | null) ?? null,
    channelType: String(row.channel_type),
    title: String(row.title ?? "Untitled case"),
    summary: (row.summary as string | null) ?? null,
    status: String(row.status),
    openedAt: row.opened_at ? toIsoString(row.opened_at) : null,
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    closedAt: row.closed_at ? toIsoString(row.closed_at) : null,
    lastActivityAt: row.last_activity_at ? toIsoString(row.last_activity_at) : null,
    finalOwnerType,
    finalOwnerId: (row.final_owner_id as string | null) ?? null,
    finalOwnerName,
    resolvedByAgentId: (row.resolved_by_agent_id as string | null) ?? null,
    resolvedByAgentName: (row.resolved_agent_name as string | null) ?? null,
    segmentCount: segments.length,
    hasHumanSegments: segments.some((segment) => segment.ownerType === "human"),
    hasAiSegments: segments.some((segment) => segment.ownerType === "ai"),
    reassignCount: Number(reassignRow?.cnt ?? 0),
    hasSlaBreach: Number(slaRow?.cnt ?? 0) > 0,
    messages,
    segments
  };
}
