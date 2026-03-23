import type { Knex } from "knex";

export type DispatchAuditCandidateInput = {
  candidateType: "agent" | "team" | "department" | "ai_agent";
  candidateId: string | null;
  candidateLabel?: string | null;
  stage: string;
  accepted: boolean;
  rejectReason?: string | null;
  details?: Record<string, unknown>;
};

export type DispatchExecutionInput = {
  tenantId: string;
  conversationId: string;
  caseId?: string | null;
  customerId?: string | null;
  segmentId?: string | null;
  triggerType: string;
  triggerActorType?: string | null;
  triggerActorId?: string | null;
  decisionType: string;
  channelType?: string | null;
  channelId?: string | null;
  customerTier?: string | null;
  customerLanguage?: string | null;
  routingRuleId?: string | null;
  routingRuleName?: string | null;
  matchedConditions?: Record<string, unknown>;
  inputSnapshot?: Record<string, unknown>;
  decisionSummary?: Record<string, unknown>;
  decisionReason?: string | null;
  candidates?: DispatchAuditCandidateInput[];
};

export class DispatchAuditService {
  async recordExecution(
    db: Knex | Knex.Transaction,
    input: DispatchExecutionInput
  ): Promise<string> {
    const [row] = await db("decision_traces")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        case_id: input.caseId ?? (await resolveCaseId(db, input.tenantId, input.conversationId)),
        customer_id: input.customerId ?? null,
        segment_id: input.segmentId ?? null,
        trace_kind: "dispatch_execution",
        trigger_type: input.triggerType,
        trigger_actor_type: input.triggerActorType ?? null,
        trigger_actor_id: input.triggerActorId ?? null,
        decision_type: input.decisionType,
        stage: "decision",
        channel_type: input.channelType ?? null,
        channel_id: input.channelId ?? null,
        customer_tier: input.customerTier ?? null,
        customer_language: input.customerLanguage ?? null,
        routing_rule_id: input.routingRuleId ?? null,
        routing_rule_name: input.routingRuleName ?? null,
        matched_conditions: JSON.stringify(input.matchedConditions ?? {}),
        input_snapshot: JSON.stringify(input.inputSnapshot ?? {}),
        decision_summary: JSON.stringify(input.decisionSummary ?? {}),
        reason: input.decisionReason ?? null,
        candidates: JSON.stringify(input.candidates ?? [])
      })
      .returning(["trace_id"]);

    return row.trace_id as string;
  }

  async recordTransition(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      caseId?: string | null;
      customerId?: string | null;
      executionId?: string | null;
      transitionType: string;
      actorType?: string | null;
      actorId?: string | null;
      fromOwnerType?: string | null;
      fromOwnerId?: string | null;
      fromSegmentId?: string | null;
      toOwnerType?: string | null;
      toOwnerId?: string | null;
      toSegmentId?: string | null;
      reason?: string | null;
      payload?: Record<string, unknown>;
    }
  ) {
    await db("decision_traces").insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      case_id: input.caseId
        ?? (input.executionId ? await resolveExecutionCaseId(db, input.tenantId, input.executionId) : null)
        ?? (await resolveCaseId(db, input.tenantId, input.conversationId)),
      customer_id: input.customerId ?? null,
      trace_kind: "dispatch_transition",
      execution_ref: input.executionId ?? null,
      decision_type: input.transitionType,
      stage: "transition",
      trigger_actor_type: input.actorType ?? null,
      trigger_actor_id: input.actorId ?? null,
      from_owner_type: input.fromOwnerType ?? null,
      from_owner_id: input.fromOwnerId ?? null,
      from_segment_id: input.fromSegmentId ?? null,
      to_owner_type: input.toOwnerType ?? null,
      to_owner_id: input.toOwnerId ?? null,
      to_segment_id: input.toSegmentId ?? null,
      reason: input.reason ?? null,
      payload: JSON.stringify(input.payload ?? {})
    });
  }
}

async function resolveCaseId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const conversation = await db("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();

  if (conversation?.current_case_id) return conversation.current_case_id;

  const latestCase = await db("conversation_cases")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .orderByRaw("CASE WHEN status IN ('open', 'in_progress', 'waiting_customer', 'waiting_internal') THEN 0 ELSE 1 END")
    .orderBy("last_activity_at", "desc")
    .orderBy("opened_at", "desc")
    .select("case_id")
    .first<{ case_id: string } | undefined>();

  return latestCase?.case_id ?? null;
}

async function resolveExecutionCaseId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  executionId: string
) {
  const execution = await db("decision_traces")
    .where({ tenant_id: tenantId, trace_id: executionId, trace_kind: "dispatch_execution" })
    .select("case_id")
    .first<{ case_id: string | null } | undefined>();

  return execution?.case_id ?? null;
}
