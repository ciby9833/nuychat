import type { Knex } from "knex";

import { isHumanHandoffIntent } from "../ai/ai-runtime-contract.js";
import { isExplicitAIOptInMessage } from "./routing-context.service.js";
import { AIDispatchService, type AIDispatchTarget } from "./ai-dispatch.service.js";
import { HumanDispatchService, type HumanDispatchTarget } from "./human-dispatch.service.js";
import { RoutingDefaultTargetService } from "./routing-default-target.service.js";
import { normalizeRoutingRuleActions } from "./routing-rule-schema.js";
import type { RoutingContext, RoutingOwnerSide, RoutingPlan, RoutingPlanAction, RoutingPlanMode } from "./types.js";

type RoutingRuleRow = {
  rule_id: string;
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
};

const aiDispatchService = new AIDispatchService();
const humanDispatchService = new HumanDispatchService();
const routingDefaultTargetService = new RoutingDefaultTargetService();

export class RoutingDecisionService {
  async createPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext,
    input?: {
      triggerType?: RoutingPlan["triggerType"];
    }
  ): Promise<RoutingPlan> {
    const triggerType = input?.triggerType ?? "inbound_message";

    if (triggerType === "agent_handoff") {
      return this.createAgentHandoffPlanInternal(db, context);
    }
    if (triggerType === "ai_handoff") {
      return this.createAiHandoffHumanPlanInternal(db, context);
    }

    if (context.preserveHumanOwner) {
      return buildPreservedHumanPlan(context);
    }

    const matchedRule = await findMatchedRule(db, context);
    const policy = await resolvePolicy(db, context, matchedRule);
    const mode = resolvePolicyMode(context.operatingMode, policy.executionMode);

    const [humanCapacity, aiCapacity] = await Promise.all([
      humanDispatchService.inspectTarget(db, {
        tenantId: context.tenantId,
        target: policy.humanTarget,
        priority: matchedRule?.priority ?? 100
      }),
      aiDispatchService.inspectTarget(db, {
        tenantId: context.tenantId,
        aiTarget: policy.aiTarget,
        aiSoftConcurrencyLimit: null
      })
    ]);

    const override = resolveOverride(context);
    const serviceRequestMode = resolveServiceRequestMode(context, override.reason);
    const selectedOwnerType = resolveOwnerSide(mode, context, override, {
      humanLoadPct: humanCapacity.loadPct,
      humanAvailableAgents: humanCapacity.eligibleAgents,
      aiLoadPct: aiCapacity.loadPct,
      aiAvailableAgents: aiCapacity.availableAgents
    });

    const humanDecision = await humanDispatchService.decideForTarget(db, {
      tenantId: context.tenantId,
      target: policy.humanTarget,
      priority: matchedRule?.priority ?? 100,
      reason: selectedOwnerType === "human" ? "policy_selected_human" : "reserved_human_fallback",
      auditSource: buildAuditSource(matchedRule),
      excludeAgentIds: context.excludedAgentIds ?? []
    });

    const aiSelection = selectedOwnerType === "ai"
      ? await aiDispatchService.selectForTarget(db, {
          tenantId: context.tenantId,
          customerId: context.customerId,
          conversationId: context.conversationId,
          aiTarget: policy.aiTarget
        })
      : {
          aiAgentId: null,
          aiAgentName: null,
          selectionReason: "policy_selected_human",
          strategy: policy.aiTarget.assignmentStrategy,
          candidates: []
        };

    const fallbackDecision = await buildFallbackDecision(db, context, policy.humanTarget, matchedRule);
    const action = resolvePlanAction(selectedOwnerType, humanDecision.assignedAgentId);
    const humanProgress = resolveHumanProgress(serviceRequestMode, action, selectedOwnerType);
    const queueMode = resolveQueueMode(humanProgress);
    const queuePosition = selectedOwnerType === "human" ? humanDecision.queuePosition : null;
    const estimatedWaitSec = selectedOwnerType === "human" ? humanDecision.estimatedWaitSec : null;
    const aiFallbackAllowed = serviceRequestMode === "human_requested";
    const lockedHumanSide = serviceRequestMode === "human_requested" && selectedOwnerType === "human";
    const decisionReason = describeDecisionReason({
      mode,
      selectedOwnerType,
      overrideReason: override.reason,
      humanDecisionReason: humanDecision.reason,
      aiSelectionReason: aiSelection.selectionReason
    });

    return {
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      customerId: context.customerId,
      caseId: context.caseId,
      segmentId: context.segmentId,
      triggerType,
      mode,
      action,
      currentOwner: {
        ownerType: "system",
        ownerId: null
      },
      target: {
        departmentId: humanDecision.departmentId,
        teamId: humanDecision.teamId,
        agentId: selectedOwnerType === "human" ? humanDecision.assignedAgentId : null,
        aiAgentId: selectedOwnerType === "ai" ? aiSelection.aiAgentId : null,
        aiAgentName: selectedOwnerType === "ai" ? aiSelection.aiAgentName : null,
        strategy: humanDecision.strategy,
        priority: humanDecision.priority
      },
      fallback: fallbackDecision,
      statusPlan: {
        conversationStatus: selectedOwnerType === "human" ? "queued" : "open",
        queueStatus: selectedOwnerType === "human" ? humanDecision.status : "pending",
        handoffRequired: false,
        selectedOwnerType,
        serviceRequestMode,
        humanProgress,
        queueMode,
        queuePosition,
        estimatedWaitSec,
        aiFallbackAllowed,
        lockedHumanSide
      },
      trace: {
        issueSummary: context.issueSummary,
        decision: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          planAction: action,
          matchedConditions: matchedRule?.conditions ?? {},
          selectedOwnerType,
          reason: decisionReason,
          overrideReason: override.reason,
          capacity: {
            humanLoadPct: humanCapacity.loadPct,
            humanAvailableAgents: humanCapacity.eligibleAgents,
            aiLoadPct: aiCapacity.loadPct,
            aiAvailableAgents: aiCapacity.availableAgents
          }
        },
        humanDispatch: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: humanDecision.reason,
          candidates: humanDecision.audit.candidates
        },
        aiSelection: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: aiSelection.selectionReason,
          selectionMode: matchedRule ? "rule" : "fallback",
          strategy: aiSelection.strategy as ("round_robin" | "least_busy" | "sticky" | null),
          candidates: aiSelection.candidates
        }
      }
    };
  }

  private async createAgentHandoffPlanInternal(db: Knex | Knex.Transaction, context: RoutingContext): Promise<RoutingPlan> {
    const matchedRule = await findMatchedRule(db, context);
    const policy = await resolvePolicy(db, context, matchedRule);

    const [humanDecision, aiSelection, fallbackDecision] = await Promise.all([
      humanDispatchService.decideForTarget(db, {
        tenantId: context.tenantId,
        target: policy.humanTarget,
        priority: matchedRule?.priority ?? 100,
        reason: "agent_handoff_human_fallback",
        auditSource: buildAuditSource(matchedRule),
        excludeAgentIds: context.excludedAgentIds ?? []
      }),
      aiDispatchService.selectForTarget(db, {
        tenantId: context.tenantId,
        customerId: context.customerId,
        conversationId: context.conversationId,
        aiTarget: policy.aiTarget
      }),
      buildFallbackDecision(db, context, policy.humanTarget, matchedRule)
    ]);

    const selectedOwnerType: RoutingOwnerSide = aiSelection.aiAgentId ? "ai" : "human";
    const selectedHumanAgentId = humanDecision.assignedAgentId;
    const action: RoutingPlanAction = selectedOwnerType === "ai"
      ? "assign_ai_owner"
      : selectedHumanAgentId
        ? "assign_specific_owner"
        : "enqueue_for_human";

    const decisionReason = selectedOwnerType === "ai"
      ? `agent_handoff:${aiSelection.selectionReason}`
      : `agent_handoff:${selectedHumanAgentId ? "human_assigned" : "human_queue"}`;

    return {
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      customerId: context.customerId,
      caseId: context.caseId,
      segmentId: context.segmentId,
      triggerType: "agent_handoff",
      mode: "ai_first",
      action,
      currentOwner: {
        ownerType: context.currentHandlerType === "human" ? "agent" : context.currentHandlerType === "ai" ? "ai" : "system",
        ownerId: context.currentHandlerId ?? null
      },
      target: {
        departmentId: humanDecision.departmentId,
        teamId: humanDecision.teamId,
        agentId: selectedOwnerType === "human" ? selectedHumanAgentId : null,
        aiAgentId: selectedOwnerType === "ai" ? aiSelection.aiAgentId : null,
        aiAgentName: selectedOwnerType === "ai" ? aiSelection.aiAgentName : null,
        strategy: humanDecision.strategy,
        priority: humanDecision.priority
      },
      fallback: fallbackDecision,
      statusPlan: {
        conversationStatus: selectedOwnerType === "ai" ? "open" : "queued",
        queueStatus: selectedOwnerType === "ai" ? "pending" : (selectedHumanAgentId ? "assigned" : "pending"),
        handoffRequired: selectedOwnerType !== "ai",
        selectedOwnerType,
        serviceRequestMode: "normal",
        humanProgress: selectedOwnerType === "human" ? (selectedHumanAgentId ? "assigned_waiting" : "queued_waiting") : "none",
        queueMode: selectedOwnerType === "human" ? (selectedHumanAgentId ? "assigned_waiting" : "pending_unavailable") : "none",
        queuePosition: selectedOwnerType === "human" ? humanDecision.queuePosition : null,
        estimatedWaitSec: selectedOwnerType === "human" ? humanDecision.estimatedWaitSec : null,
        aiFallbackAllowed: false,
        lockedHumanSide: false
      },
      trace: {
        issueSummary: context.issueSummary,
        decision: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          planAction: action,
          matchedConditions: matchedRule?.conditions ?? {},
          selectedOwnerType,
          reason: decisionReason,
          overrideReason: selectedOwnerType === "ai" ? "agent_handoff_forced_ai_attempt" : null,
          capacity: {
            humanLoadPct: null,
            humanAvailableAgents: 0,
            aiLoadPct: null,
            aiAvailableAgents: aiSelection.aiAgentId ? 1 : 0
          }
        },
        humanDispatch: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: humanDecision.reason,
          candidates: humanDecision.audit.candidates
        },
        aiSelection: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: aiSelection.selectionReason,
          selectionMode: matchedRule ? "rule" : "fallback",
          strategy: aiSelection.strategy as ("round_robin" | "least_busy" | "sticky" | null),
          candidates: aiSelection.candidates
        }
      }
    };
  }

  private async createAiHandoffHumanPlanInternal(db: Knex | Knex.Transaction, context: RoutingContext): Promise<RoutingPlan> {
    const matchedRule = await findMatchedRule(db, context);
    const policy = await resolvePolicy(db, context, matchedRule);

    let humanDecision = await humanDispatchService.decideForTarget(db, {
      tenantId: context.tenantId,
      target: policy.humanTarget,
      priority: matchedRule?.priority ?? 100,
      reason: "ai_handoff_human_dispatch",
      auditSource: buildAuditSource(matchedRule),
      excludeAgentIds: context.excludedAgentIds ?? []
    });

    if (!humanDecision.assignedAgentId) {
      const fallbackHumanDecision = await humanDispatchService.decideForAnyAvailableTarget(db, {
        tenantId: context.tenantId,
        departmentId: policy.humanTarget.departmentId,
        teamId: policy.humanTarget.teamId,
        strategy: policy.humanTarget.assignmentStrategy ?? "balanced_new_case",
        priority: matchedRule?.priority ?? 100,
        reason: "ai_handoff_human_dispatch_any_available",
        auditSource: buildAuditSource(matchedRule),
        excludeAgentIds: context.excludedAgentIds ?? []
      });
      if (fallbackHumanDecision) {
        humanDecision = fallbackHumanDecision;
      }
    }

    const fallbackDecision = await buildFallbackDecision(db, context, policy.humanTarget, matchedRule);
    const action: RoutingPlanAction = humanDecision.assignedAgentId ? "assign_specific_owner" : "enqueue_for_human";
    const decisionReason = humanDecision.assignedAgentId ? "ai_handoff:human_assigned" : "ai_handoff:human_queue";

    return {
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      customerId: context.customerId,
      caseId: context.caseId,
      segmentId: context.segmentId,
      triggerType: "ai_handoff",
      mode: "human_first",
      action,
      currentOwner: {
        ownerType: context.currentHandlerType === "ai" ? "ai" : context.currentHandlerType === "human" ? "agent" : "system",
        ownerId: context.currentHandlerId ?? null
      },
      target: {
        departmentId: humanDecision.departmentId,
        teamId: humanDecision.teamId,
        agentId: humanDecision.assignedAgentId,
        aiAgentId: null,
        aiAgentName: null,
        strategy: humanDecision.strategy,
        priority: humanDecision.priority
      },
      fallback: fallbackDecision,
      statusPlan: {
        conversationStatus: "queued",
        queueStatus: humanDecision.assignedAgentId ? "assigned" : "pending",
        handoffRequired: true,
        selectedOwnerType: "human",
        serviceRequestMode: "human_requested",
        humanProgress: humanDecision.assignedAgentId ? "assigned_waiting" : "queued_waiting",
        queueMode: humanDecision.assignedAgentId ? "assigned_waiting" : "pending_unavailable",
        queuePosition: humanDecision.queuePosition,
        estimatedWaitSec: humanDecision.estimatedWaitSec,
        aiFallbackAllowed: true,
        lockedHumanSide: true
      },
      trace: {
        issueSummary: context.issueSummary,
        decision: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          planAction: action,
          matchedConditions: matchedRule?.conditions ?? {},
          selectedOwnerType: "human",
          reason: decisionReason,
          overrideReason: "ai_handoff_forced_human",
          capacity: {
            humanLoadPct: null,
            humanAvailableAgents: humanDecision.assignedAgentId ? 1 : 0,
            aiLoadPct: null,
            aiAvailableAgents: 0
          }
        },
        humanDispatch: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: humanDecision.reason,
          candidates: humanDecision.audit.candidates
        },
        aiSelection: {
          routingRuleId: matchedRule?.rule_id ?? null,
          routingRuleName: matchedRule?.name ?? null,
          matchedConditions: matchedRule?.conditions ?? {},
          reason: "ai_handoff_forced_human",
          selectionMode: "none",
          strategy: null,
          candidates: []
        }
      }
    };
  }
}

function resolveServiceRequestMode(
  context: RoutingContext,
  overrideReason: string | null
): "normal" | "human_requested" | "ai_opt_in" {
  if (overrideReason === "customer_requested_human") {
    return "human_requested";
  }
  if (
    context.existingAssignment?.serviceRequestMode === "human_requested" &&
    isExplicitAIOptInMessage(context.issueSummary.lastMessagePreview)
  ) {
    return "ai_opt_in";
  }
  if (context.existingAssignment?.serviceRequestMode === "ai_opt_in") {
    return "normal";
  }
  if (
    context.existingAssignment?.serviceRequestMode === "human_requested" &&
    context.existingAssignment?.lockedHumanSide
  ) {
    return "human_requested";
  }
  if (overrideReason === "human_handoff_queue_active") {
    return "human_requested";
  }
  return "normal";
}

function resolveHumanProgress(
  serviceRequestMode: "normal" | "human_requested" | "ai_opt_in",
  action: RoutingPlanAction,
  selectedOwnerType: RoutingOwnerSide
): "none" | "assigned_waiting" | "queued_waiting" | "human_active" | "unavailable_fallback_ai" {
  if (serviceRequestMode !== "human_requested") return "none";
  if (selectedOwnerType === "ai") return "unavailable_fallback_ai";
  if (action === "assign_specific_owner") return "assigned_waiting";
  if (action === "enqueue_for_human") return "queued_waiting";
  return "none";
}

function resolveQueueMode(
  humanProgress: "none" | "assigned_waiting" | "queued_waiting" | "human_active" | "unavailable_fallback_ai"
): "none" | "assigned_waiting" | "pending_unavailable" {
  if (humanProgress === "assigned_waiting") return "assigned_waiting";
  if (humanProgress === "queued_waiting") return "pending_unavailable";
  return "none";
}

async function findMatchedRule(db: Knex | Knex.Transaction, context: RoutingContext): Promise<RoutingRuleRow | null> {
  const rules = await db("routing_rules")
    .where({ tenant_id: context.tenantId, is_active: true })
    .select("rule_id", "name", "priority", "conditions", "actions")
    .orderBy("priority", "asc") as RoutingRuleRow[];

  return rules.find((rule) => matchesRule(rule.conditions, context)) ?? null;
}

function matchesRule(conditions: Record<string, unknown>, context: RoutingContext): boolean {
  return Object.entries(conditions).every(([key, value]) => {
    if (key === "channelType") return context.channelType === value;
    if (key === "channelId") return context.channelId === value;
    if (key === "customerLanguage") return context.customerLanguage === value;
    if (key === "customerTier") return context.customerTier === value;
    return false;
  });
}

async function resolvePolicy(
  db: Knex | Knex.Transaction,
  context: RoutingContext,
  matchedRule: RoutingRuleRow | null
): Promise<{
  executionMode: RoutingPlanMode | null;
  humanTarget: HumanDispatchTarget;
  aiTarget: AIDispatchTarget;
}> {
  const normalized = normalizeRoutingRuleActions(matchedRule?.actions ?? {});
  const humanStrategy = normalized.humanStrategy ?? "balanced_new_case";
  const humanTarget = await routingDefaultTargetService.resolveHumanTarget(db, {
    tenantId: context.tenantId,
    serviceTarget: normalized.serviceTarget,
    assignmentStrategy: humanStrategy,
    priority: matchedRule?.priority ?? 100
  });

  return {
    executionMode: normalized.executionMode,
    humanTarget,
    aiTarget: {
      aiAgentId: null,
      assignmentStrategy: normalized.aiStrategy ?? "least_busy"
    }
  };
}

function resolvePolicyMode(tenantOperatingMode: string, executionMode: RoutingPlanMode | null): RoutingPlanMode {
  if (executionMode) return executionMode;
  if (tenantOperatingMode === "human_first") return "human_first";
  if (tenantOperatingMode === "ai_first" || tenantOperatingMode === "ai_autonomous") return "ai_first";
  return "hybrid";
}

function resolveOverride(context: RoutingContext): { ownerType: RoutingOwnerSide | null; reason: string | null } {
  if (isHumanHandoffIntent(context.issueSummary.lastIntent)) {
    return {
      ownerType: "human",
      reason: "customer_requested_human"
    };
  }

  if (
    context.existingAssignment?.serviceRequestMode === "human_requested" &&
    isExplicitAIOptInMessage(context.issueSummary.lastMessagePreview)
  ) {
    return {
      ownerType: "ai",
      reason: "customer_explicit_ai_opt_in"
    };
  }

  if (
    context.existingAssignment?.serviceRequestMode === "human_requested" &&
    context.existingAssignment?.lockedHumanSide
  ) {
    return {
      ownerType: "human",
      reason: "human_handoff_queue_active"
    };
  }

  return { ownerType: null, reason: null };
}

function resolveOwnerSide(
  mode: RoutingPlanMode,
  context: RoutingContext,
  override: { ownerType: RoutingOwnerSide | null; reason: string | null },
  capacity: {
    humanLoadPct: number | null;
    humanAvailableAgents: number;
    aiLoadPct: number | null;
    aiAvailableAgents: number;
  }
): RoutingOwnerSide {
  if (override.ownerType === "human") {
    if (capacity.humanAvailableAgents > 0) return "human";
    if (capacity.aiAvailableAgents > 0) return "ai";
    return "human";
  }
  if (override.ownerType === "ai") {
    if (capacity.aiAvailableAgents > 0) return "ai";
    if (capacity.humanAvailableAgents > 0) return "human";
    return "ai";
  }

  if (mode === "human_only") return "human";
  if (mode === "ai_only") return "ai";

  if (mode === "human_first") {
    if (capacity.humanAvailableAgents > 0) return "human";
    return capacity.aiAvailableAgents > 0 ? "ai" : "human";
  }

  if (mode === "ai_first") {
    if (capacity.aiAvailableAgents > 0) return "ai";
    return capacity.humanAvailableAgents > 0 ? "human" : "ai";
  }

  return resolveSmartOwnerSide(context, capacity);
}

function resolveSmartOwnerSide(
  context: RoutingContext,
  capacity: {
    humanLoadPct: number | null;
    humanAvailableAgents: number;
    aiLoadPct: number | null;
    aiAvailableAgents: number;
  }
): RoutingOwnerSide {
  if (capacity.humanAvailableAgents === 0 && capacity.aiAvailableAgents > 0) return "ai";
  if (capacity.aiAvailableAgents === 0) return "human";

  if (isHumanPriorityConversation(context)) return "human";
  if (isAIFriendlyConversation(context)) return "ai";

  const humanLoad = capacity.humanLoadPct ?? 100;
  const aiLoad = capacity.aiLoadPct ?? 100;
  return aiLoad < humanLoad ? "ai" : "human";
}

function isHumanPriorityConversation(context: RoutingContext): boolean {
  const intent = (context.issueSummary.lastIntent ?? "").toLowerCase();
  const sentiment = (context.issueSummary.lastSentiment ?? "").toLowerCase();
  const tier = (context.customerTier ?? "").toLowerCase();

  if (tier === "vip") return true;
  if (sentiment.includes("negative") || sentiment.includes("angry")) return true;
  return ["complaint", "refund", "dispute", "legal", "escalat", "cancel"].some((keyword) => intent.includes(keyword));
}

function isAIFriendlyConversation(context: RoutingContext): boolean {
  const intent = (context.issueSummary.lastIntent ?? "").toLowerCase();
  return ["faq", "order_status", "tracking", "logistics", "invoice", "hours", "pricing", "product"].some((keyword) =>
    intent.includes(keyword)
  );
}

function resolvePlanAction(selectedOwnerType: RoutingOwnerSide, assignedAgentId: string | null): RoutingPlanAction {
  if (selectedOwnerType === "ai") return "assign_ai_owner";
  if (assignedAgentId) return "assign_specific_owner";
  return "enqueue_for_human";
}

async function buildFallbackDecision(
  db: Knex | Knex.Transaction,
  context: RoutingContext,
  humanTarget: HumanDispatchTarget,
  matchedRule: RoutingRuleRow | null
): Promise<RoutingPlan["fallback"]> {
  const decision = await humanDispatchService.decideForTarget(db, {
    tenantId: context.tenantId,
    target: humanTarget,
    priority: matchedRule?.priority ?? 100,
    reason: "fallback_human_target",
    auditSource: buildAuditSource(matchedRule),
    excludeAgentIds: context.excludedAgentIds ?? []
  });

  return {
    departmentId: decision.departmentId,
    teamId: decision.teamId,
    agentId: decision.assignedAgentId,
    strategy: decision.strategy,
    priority: decision.priority
  };
}

function buildAuditSource(matchedRule: RoutingRuleRow | null) {
  return {
    ruleId: matchedRule?.rule_id ?? null,
    ruleName: matchedRule?.name ?? null,
    matchedConditions: matchedRule?.conditions ?? {}
  };
}

function describeDecisionReason(input: {
  mode: RoutingPlanMode;
  selectedOwnerType: RoutingOwnerSide;
  overrideReason: string | null;
  humanDecisionReason: string;
  aiSelectionReason: string;
}): string {
  if (input.overrideReason) {
    if (input.overrideReason === "customer_explicit_ai_opt_in") {
      return "customer_explicit_ai_opt_in";
    }
    if (input.overrideReason === "customer_requested_human" && input.selectedOwnerType === "ai") {
      return "customer_requested_human:fallback_ai_no_serviceable_human";
    }
    if (input.overrideReason === "human_handoff_queue_active" && input.selectedOwnerType === "ai") {
      return "human_handoff_queue_active:fallback_ai_no_serviceable_human";
    }
    return input.overrideReason;
  }
  return input.selectedOwnerType === "human"
    ? `${input.mode}:${input.humanDecisionReason}`
    : `${input.mode}:${input.aiSelectionReason}`;
}

function buildPreservedHumanPlan(context: RoutingContext): RoutingPlan {
  return {
    tenantId: context.tenantId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    caseId: context.caseId,
    segmentId: context.segmentId,
    triggerType: "inbound_message",
    mode: "human_first",
    action: "preserve_existing_owner",
    currentOwner: {
      ownerType: "agent",
      ownerId: context.assignedAgentId
    },
    target: {
      departmentId: context.existingAssignment?.departmentId ?? null,
      teamId: context.existingAssignment?.teamId ?? null,
      agentId: context.assignedAgentId,
      aiAgentId: null,
      aiAgentName: null,
      strategy: context.existingAssignment?.assignmentStrategy ?? "least_busy",
      priority: context.existingAssignment?.priority ?? 100
    },
    fallback: null,
    statusPlan: {
      conversationStatus: "human_active",
      queueStatus: "assigned",
      handoffRequired: false,
      selectedOwnerType: "human",
      serviceRequestMode: context.existingAssignment?.serviceRequestMode ?? "normal",
      humanProgress: context.existingAssignment?.humanProgress ?? "human_active",
      queueMode: context.existingAssignment?.queueMode ?? "assigned_waiting",
      queuePosition: context.existingAssignment?.queuePosition ?? null,
      estimatedWaitSec: context.existingAssignment?.estimatedWaitSec ?? null,
      aiFallbackAllowed: context.existingAssignment?.aiFallbackAllowed ?? false,
      lockedHumanSide: context.existingAssignment?.lockedHumanSide ?? false
    },
    trace: {
      issueSummary: context.issueSummary,
      decision: {
        routingRuleId: null,
        routingRuleName: "preserve-human-owner",
        planAction: "preserve_existing_owner",
        matchedConditions: {},
        selectedOwnerType: "human",
        reason: "preserve_existing_human_owner",
        overrideReason: null,
        capacity: {
          humanLoadPct: null,
          humanAvailableAgents: 0,
          aiLoadPct: null,
          aiAvailableAgents: 0
        }
      },
      humanDispatch: {
        routingRuleId: null,
        routingRuleName: "preserve-human-owner",
        matchedConditions: {},
        reason: "preserve_existing_human_owner",
        candidates: []
      },
      aiSelection: {
        routingRuleId: null,
        routingRuleName: null,
        matchedConditions: {},
        reason: "preserve_existing_human_owner",
        selectionMode: "none",
        strategy: null,
        candidates: []
      }
    }
  };
}
