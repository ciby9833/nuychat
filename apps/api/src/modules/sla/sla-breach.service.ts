import type { Knex } from "knex";

import { db } from "../../infra/db/client.js";
import { resolveConversationSlaDefinition } from "./conversation-sla.service.js";

type ConversationSlaMetric = "first_response" | "assignment_accept" | "follow_up" | "resolution";

export async function recordConversationSlaBreach(input: {
  trx?: Knex.Transaction;
  tenantId: string;
  conversationId: string;
  customerId?: string | null;
  caseId?: string | null;
  agentId?: string | null;
  metric: ConversationSlaMetric;
  targetSec: number;
  actualSec: number;
  severity: "warning" | "critical";
  details?: Record<string, unknown>;
}): Promise<void> {
  const executor = input.trx ?? db;
  if (input.targetSec <= 0 || input.actualSec <= input.targetSec) return;

  const customerId = input.customerId ?? await resolveCustomerId(executor, input.tenantId, input.conversationId);
  const caseId = input.caseId ?? await resolveCaseId(executor, input.tenantId, input.conversationId);
  const definition = customerId ? await resolveConversationSlaDefinition(input.tenantId, customerId) : null;
  const breachSec = input.actualSec - input.targetSec;

  const duplicate = await executor("sla_breaches")
    .where({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      metric: input.metric,
      target_sec: input.targetSec,
      actual_sec: input.actualSec
    })
    .whereRaw("COALESCE(case_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(?, '00000000-0000-0000-0000-000000000000'::uuid)", [caseId])
    .first("breach_id");
  if (duplicate) return;

  await executor("sla_breaches").insert({
    tenant_id: input.tenantId,
    definition_id: definition?.definitionId ?? null,
    trigger_policy_id: null,
    conversation_id: input.conversationId,
    case_id: caseId,
    agent_id: input.agentId ?? null,
    metric: input.metric,
    target_sec: input.targetSec,
    actual_sec: input.actualSec,
    breach_sec: breachSec,
    severity: input.severity,
    status: "open",
    details: input.details ?? {}
  });
}

async function resolveCustomerId(executor: Knex.Transaction | Knex, tenantId: string, conversationId: string): Promise<string | null> {
  const row = await executor("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("customer_id")
    .first<{ customer_id: string | null } | undefined>();
  return row?.customer_id ?? null;
}

async function resolveCaseId(executor: Knex.Transaction | Knex, tenantId: string, conversationId: string): Promise<string | null> {
  const row = await executor("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();
  return row?.current_case_id ?? null;
}
