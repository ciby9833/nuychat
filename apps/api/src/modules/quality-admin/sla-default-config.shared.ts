import type { Knex } from "knex";

import { toIsoString } from "../tenant/tenant-admin.shared.js";
import { normalizeTriggerActionsBody } from "./quality-admin.shared.js";

const DEFAULT_DEFINITION_NAME = "__default_sla__";
const DEFAULT_TRIGGER_POLICY_NAME = "__default_sla_policy__";

export type SlaDefaultConfigPayload = {
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec: number | null;
  subsequentResponseTargetSec: number | null;
  subsequentResponseReassignWhen: "always" | "owner_unavailable";
  followUpTargetSec: number | null;
  resolutionTargetSec: number;
  firstResponseAction: "alert" | "escalate";
  assignmentAcceptAction: "alert" | "escalate" | "reassign";
  followUpAction: "alert" | "escalate" | "reassign" | "close_case";
  followUpCloseMode: "semantic" | "waiting_customer" | null;
  resolutionAction: "alert" | "escalate";
};

export type SlaDefaultConfigRecord = SlaDefaultConfigPayload & {
  definitionId: string | null;
  triggerPolicyId: string | null;
  updatedAt: string | null;
};

export const DEFAULT_SLA_CONFIG: SlaDefaultConfigPayload = {
  firstResponseTargetSec: 300,
  assignmentAcceptTargetSec: 300,
  subsequentResponseTargetSec: 300,
  subsequentResponseReassignWhen: "owner_unavailable",
  followUpTargetSec: 1800,
  resolutionTargetSec: 7200,
  firstResponseAction: "alert",
  assignmentAcceptAction: "reassign",
  followUpAction: "close_case",
  followUpCloseMode: "waiting_customer",
  resolutionAction: "escalate"
};

export async function readSlaDefaultConfig(trx: Knex.Transaction, tenantId: string): Promise<SlaDefaultConfigRecord> {
  const [definitionRow, triggerRow] = await Promise.all([
    resolveDefaultDefinitionRow(trx, tenantId),
    resolveDefaultTriggerPolicyRow(trx, tenantId)
  ]);

  const config = DEFAULT_SLA_CONFIG;
  const definition = definitionRow
    ? {
        definitionId: String(definitionRow.definition_id),
        firstResponseTargetSec: Number(definitionRow.first_response_target_sec ?? config.firstResponseTargetSec),
        assignmentAcceptTargetSec:
          definitionRow.assignment_accept_target_sec === null || definitionRow.assignment_accept_target_sec === undefined
            ? null
            : Number(definitionRow.assignment_accept_target_sec),
        subsequentResponseTargetSec:
          definitionRow.subsequent_response_target_sec === null || definitionRow.subsequent_response_target_sec === undefined
            ? null
            : Number(definitionRow.subsequent_response_target_sec),
        followUpTargetSec:
          definitionRow.follow_up_target_sec === null || definitionRow.follow_up_target_sec === undefined
            ? null
            : Number(definitionRow.follow_up_target_sec),
        resolutionTargetSec: Number(definitionRow.resolution_target_sec ?? config.resolutionTargetSec),
        updatedAt: toIsoString(definitionRow.updated_at)
      }
    : {
        definitionId: null,
        firstResponseTargetSec: config.firstResponseTargetSec,
        assignmentAcceptTargetSec: config.assignmentAcceptTargetSec,
        subsequentResponseTargetSec: config.subsequentResponseTargetSec,
        followUpTargetSec: config.followUpTargetSec,
        resolutionTargetSec: config.resolutionTargetSec,
        updatedAt: null
      };

  const triggerActions = triggerRow
    ? {
        triggerPolicyId: String(triggerRow.trigger_policy_id),
        firstResponseAction: firstActionType(triggerRow.first_response_actions, "first_response", config.firstResponseAction) as SlaDefaultConfigPayload["firstResponseAction"],
        assignmentAcceptAction: firstActionType(triggerRow.assignment_accept_actions, "assignment_accept", config.assignmentAcceptAction) as SlaDefaultConfigPayload["assignmentAcceptAction"],
        subsequentResponseReassignWhen: firstReassignCondition(triggerRow.subsequent_response_actions, config.subsequentResponseReassignWhen),
        followUpAction: firstActionType(triggerRow.follow_up_actions, "follow_up", config.followUpAction) as SlaDefaultConfigPayload["followUpAction"],
        followUpCloseMode: firstCloseCaseMode(triggerRow.follow_up_actions, config.followUpCloseMode),
        resolutionAction: firstActionType(triggerRow.resolution_actions, "resolution", config.resolutionAction) as SlaDefaultConfigPayload["resolutionAction"],
        updatedAt: toIsoString(triggerRow.updated_at)
      }
    : {
        triggerPolicyId: null,
        firstResponseAction: config.firstResponseAction,
        assignmentAcceptAction: config.assignmentAcceptAction,
        subsequentResponseReassignWhen: config.subsequentResponseReassignWhen,
        followUpAction: config.followUpAction,
        followUpCloseMode: config.followUpCloseMode,
        resolutionAction: config.resolutionAction,
        updatedAt: null
      };

  return {
    definitionId: definition.definitionId,
    triggerPolicyId: triggerActions.triggerPolicyId,
    firstResponseTargetSec: definition.firstResponseTargetSec,
    assignmentAcceptTargetSec: definition.assignmentAcceptTargetSec,
    subsequentResponseTargetSec: definition.subsequentResponseTargetSec,
    subsequentResponseReassignWhen: triggerActions.subsequentResponseReassignWhen,
    followUpTargetSec: definition.followUpTargetSec,
    resolutionTargetSec: definition.resolutionTargetSec,
    firstResponseAction: triggerActions.firstResponseAction,
    assignmentAcceptAction: triggerActions.assignmentAcceptAction,
    followUpAction: triggerActions.followUpAction,
    followUpCloseMode: triggerActions.followUpCloseMode,
    resolutionAction: triggerActions.resolutionAction,
    updatedAt: definition.updatedAt && triggerActions.updatedAt
      ? (definition.updatedAt > triggerActions.updatedAt ? definition.updatedAt : triggerActions.updatedAt)
      : (definition.updatedAt ?? triggerActions.updatedAt)
  };
}

export async function upsertSlaDefaultConfig(
  trx: Knex.Transaction,
  tenantId: string,
  input: SlaDefaultConfigPayload
): Promise<SlaDefaultConfigRecord> {
  const definition = {
    tenant_id: tenantId,
    name: DEFAULT_DEFINITION_NAME,
    priority: "standard",
    first_response_target_sec: Math.max(1, Math.floor(input.firstResponseTargetSec)),
    assignment_accept_target_sec:
      input.assignmentAcceptTargetSec === null || input.assignmentAcceptTargetSec === undefined
        ? null
        : Math.max(1, Math.floor(input.assignmentAcceptTargetSec)),
    subsequent_response_target_sec:
      input.subsequentResponseTargetSec === null || input.subsequentResponseTargetSec === undefined
        ? null
        : Math.max(1, Math.floor(input.subsequentResponseTargetSec)),
    follow_up_target_sec:
      input.followUpTargetSec === null || input.followUpTargetSec === undefined
        ? null
        : Math.max(1, Math.floor(input.followUpTargetSec)),
    resolution_target_sec: Math.max(1, Math.floor(input.resolutionTargetSec)),
    conditions: {},
    is_active: true,
    updated_at: trx.fn.now()
  };

  const triggerPolicy = {
    tenant_id: tenantId,
    name: DEFAULT_TRIGGER_POLICY_NAME,
    priority: "standard",
    first_response_actions: JSON.stringify([{ type: input.firstResponseAction }]),
    assignment_accept_actions: JSON.stringify([{ type: input.assignmentAcceptAction }]),
    subsequent_response_actions: JSON.stringify([{ type: "reassign", condition: input.subsequentResponseReassignWhen }]),
    follow_up_actions: JSON.stringify(
      input.followUpAction === "close_case"
        ? [{ type: "close_case", mode: input.followUpCloseMode ?? "waiting_customer" }]
        : [{ type: input.followUpAction }]
    ),
    resolution_actions: JSON.stringify([{ type: input.resolutionAction }]),
    conditions: JSON.stringify({}),
    is_active: true,
    updated_at: trx.fn.now()
  };

  await trx("sla_definitions")
    .insert(definition)
    .onConflict(["tenant_id", "name"])
    .merge(definition);

  await trx("sla_trigger_policies")
    .insert(triggerPolicy)
    .onConflict(["tenant_id", "name"])
    .merge(triggerPolicy);

  await trx("sla_definitions")
    .where({ tenant_id: tenantId, is_active: true })
    .whereNot("name", DEFAULT_DEFINITION_NAME)
    .update({ is_active: false, updated_at: trx.fn.now() });

  await trx("sla_trigger_policies")
    .where({ tenant_id: tenantId, is_active: true })
    .whereNot("name", DEFAULT_TRIGGER_POLICY_NAME)
    .update({ is_active: false, updated_at: trx.fn.now() });

  return readSlaDefaultConfig(trx, tenantId);
}

async function resolveDefaultDefinitionRow(trx: Knex.Transaction, tenantId: string) {
  const exact = await trx("sla_definitions")
    .where({ tenant_id: tenantId, name: DEFAULT_DEFINITION_NAME })
    .select(
      "definition_id",
      "first_response_target_sec",
      "assignment_accept_target_sec",
      "subsequent_response_target_sec",
      "follow_up_target_sec",
      "resolution_target_sec",
      "updated_at"
    )
    .first<Record<string, unknown> | undefined>();
  if (exact) return exact;
  return trx("sla_definitions")
    .where({ tenant_id: tenantId, is_active: true })
    .select(
      "definition_id",
      "first_response_target_sec",
      "assignment_accept_target_sec",
      "subsequent_response_target_sec",
      "follow_up_target_sec",
      "resolution_target_sec",
      "updated_at"
    )
    .orderBy("priority", "asc")
    .orderBy("created_at", "asc")
    .first<Record<string, unknown> | undefined>();
}

async function resolveDefaultTriggerPolicyRow(trx: Knex.Transaction, tenantId: string) {
  const exact = await trx("sla_trigger_policies")
    .where({ tenant_id: tenantId, name: DEFAULT_TRIGGER_POLICY_NAME })
    .select(
      "trigger_policy_id",
      "first_response_actions",
      "assignment_accept_actions",
      "subsequent_response_actions",
      "follow_up_actions",
      "resolution_actions",
      "updated_at"
    )
    .first<Record<string, unknown> | undefined>();
  if (exact) return exact;
  return trx("sla_trigger_policies")
    .where({ tenant_id: tenantId, is_active: true })
    .select(
      "trigger_policy_id",
      "first_response_actions",
      "assignment_accept_actions",
      "subsequent_response_actions",
      "follow_up_actions",
      "resolution_actions",
      "updated_at"
    )
    .orderBy("priority", "asc")
    .orderBy("created_at", "asc")
    .first<Record<string, unknown> | undefined>();
}

function firstActionType(
  raw: unknown,
  metric: Parameters<typeof normalizeTriggerActionsBody>[1],
  fallback: SlaDefaultConfigPayload["firstResponseAction" | "assignmentAcceptAction" | "followUpAction" | "resolutionAction"]
) {
  return normalizeTriggerActionsBody(raw, metric)[0]?.type ?? fallback;
}

function firstCloseCaseMode(raw: unknown, fallback: "semantic" | "waiting_customer" | null) {
  const action = normalizeTriggerActionsBody(raw, "follow_up").find((item) => item.type === "close_case");
  return action?.mode ?? fallback;
}

function firstReassignCondition(raw: unknown, fallback: "always" | "owner_unavailable") {
  const action = normalizeTriggerActionsBody(raw, "subsequent_response").find((item) => item.type === "reassign");
  return action?.condition ?? fallback;
}
