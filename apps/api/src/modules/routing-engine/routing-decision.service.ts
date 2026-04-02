import type { Knex } from "knex";

import { isHumanHandoffIntent } from "../ai/ai-runtime-contract.js";
import { AIDispatchService } from "./ai-dispatch.service.js";
import { HumanDispatchService } from "./human-dispatch.service.js";
import { normalizeRoutingRuleActions, type NormalizedRoutingRuleActions } from "./routing-rule-schema.js";
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

export class RoutingDecisionService {
  async createPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    if (context.preserveHumanOwner) {
      return buildPreservedHumanPlan(context);
    }

    const matchedRule = await findMatchedRule(db, context);
    const normalized = normalizeRoutingRuleActions(matchedRule?.actions ?? {});
    const mode = resolvePolicyMode(context.operatingMode, normalized.executionMode);

    const [humanCapacity, aiCapacity] = await Promise.all([
      humanDispatchService.inspectTarget(db, {
        tenantId: context.tenantId,
        target: normalized.humanTarget,
        priority: matchedRule?.priority ?? 100
      }),
      aiDispatchService.inspectTarget(db, {
        tenantId: context.tenantId,
        aiTarget: normalized.aiTarget,
        aiSoftConcurrencyLimit: normalized.overflowPolicy.aiSoftConcurrencyLimit
      })
    ]);

    const override = resolveOverride(context, normalized);
    const selectedOwnerType = resolveOwnerSide(mode, normalized, override, {
      humanLoadPct: humanCapacity.loadPct,
      humanAvailableAgents: humanCapacity.eligibleAgents,
      aiLoadPct: aiCapacity.loadPct,
      aiAvailableAgents: aiCapacity.availableAgents
    });

    const humanDecision = await humanDispatchService.decideForTarget(db, {
      tenantId: context.tenantId,
      target: normalized.humanTarget,
      priority: matchedRule?.priority ?? 100,
      reason: selectedOwnerType === "human" ? "policy_selected_human" : "reserved_human_fallback",
      auditSource: buildAuditSource(matchedRule)
    });

    const aiSelection = selectedOwnerType === "ai"
      ? await aiDispatchService.selectForTarget(db, {
          tenantId: context.tenantId,
          customerId: context.customerId,
          conversationId: context.conversationId,
          aiTarget: normalized.aiTarget
        })
      : {
          aiAgentId: null,
          aiAgentName: null,
          selectionReason: "policy_selected_human",
          strategy: normalized.aiTarget.assignmentStrategy,
          candidates: []
        };

    const fallbackDecision = await buildFallbackDecision(db, context, normalized, matchedRule);
    const action = resolvePlanAction(selectedOwnerType, humanDecision.assignedAgentId);
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
      triggerType: "inbound_message",
      mode,
      action,
      currentOwner: {
        ownerType: "system",
        ownerId: null
      },
      target: {
        moduleId: humanDecision.moduleId,
        skillGroupId: humanDecision.skillGroupId,
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
        queueStatus: selectedOwnerType === "human"
          ? humanDecision.status
          : "resolved",
        handoffRequired: false,
        selectedOwnerType
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

  async createAgentHandoffPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    const matchedRule = await findMatchedRule(db, context);
    const normalized = normalizeRoutingRuleActions(matchedRule?.actions ?? {});

    const [humanDecision, aiSelection, fallbackDecision] = await Promise.all([
      humanDispatchService.decideForTarget(db, {
        tenantId: context.tenantId,
        target: normalized.humanTarget,
        priority: matchedRule?.priority ?? 100,
        reason: "agent_handoff_human_fallback",
        auditSource: buildAuditSource(matchedRule)
      }),
      aiDispatchService.selectForTarget(db, {
        tenantId: context.tenantId,
        customerId: context.customerId,
        conversationId: context.conversationId,
        aiTarget: normalized.aiTarget
      }),
      buildFallbackDecision(db, context, normalized, matchedRule)
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
        moduleId: humanDecision.moduleId,
        skillGroupId: humanDecision.skillGroupId,
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
        selectedOwnerType
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

  async createAiHandoffHumanPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    const matchedRule = await findMatchedRule(db, context);
    const normalized = normalizeRoutingRuleActions(matchedRule?.actions ?? {});

    let humanDecision = await humanDispatchService.decideForTarget(db, {
      tenantId: context.tenantId,
      target: normalized.humanTarget,
      priority: matchedRule?.priority ?? 100,
      reason: "ai_handoff_human_dispatch",
      auditSource: buildAuditSource(matchedRule)
    });

    if (!humanDecision.assignedAgentId) {
      const fallbackHumanDecision = await humanDispatchService.decideForAnyAvailableTarget(db, {
        tenantId: context.tenantId,
        departmentId: normalized.humanTarget.departmentId,
        teamId: normalized.humanTarget.teamId,
        strategy: normalized.humanTarget.assignmentStrategy ?? "least_busy",
        priority: matchedRule?.priority ?? 100,
        reason: "ai_handoff_human_dispatch_fallback_any_group",
        auditSource: buildAuditSource(matchedRule),
        excludeSkillGroupCodes: normalized.humanTarget.skillGroupCode ? [normalized.humanTarget.skillGroupCode] : []
      });
      if (fallbackHumanDecision) {
        humanDecision = fallbackHumanDecision;
      }
    }

    const fallbackDecision = await buildFallbackDecision(db, context, normalized, matchedRule);

    const action: RoutingPlanAction = humanDecision.assignedAgentId ? "assign_specific_owner" : "enqueue_for_human";
    const decisionReason = humanDecision.assignedAgentId
      ? "ai_handoff:human_assigned"
      : "ai_handoff:human_queue";

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
        moduleId: humanDecision.moduleId,
        skillGroupId: humanDecision.skillGroupId,
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
        selectedOwnerType: "human"
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

async function findMatchedRule(
  db: Knex | Knex.Transaction,
  context: RoutingContext
): Promise<RoutingRuleRow | null> {
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

function resolvePolicyMode(tenantOperatingMode: string, executionMode: RoutingPlanMode | null): RoutingPlanMode {
  if (executionMode) return executionMode;
  if (tenantOperatingMode === "human_first") return "human_first";
  if (tenantOperatingMode === "ai_autonomous") return "ai_only";
  return "ai_first";
}

function resolveOverride(
  context: RoutingContext,
  normalized: NormalizedRoutingRuleActions
): { ownerType: RoutingOwnerSide | null; reason: string | null } {
  const preview = (context.issueSummary.lastMessagePreview ?? "").toLowerCase();
  const requestedHumanByKeyword = normalized.overrides.humanRequestKeywords.some((keyword) =>
    preview.includes(keyword.toLowerCase())
  );
  const requestedHumanByIntent = isHumanHandoffIntent(context.issueSummary.lastIntent);

  if (
    normalized.overrides.customerRequestsHuman === "force_human" &&
    (requestedHumanByKeyword || requestedHumanByIntent)
  ) {
    return {
      ownerType: "human",
      reason: requestedHumanByIntent ? "customer_requested_human_by_intent" : "customer_requested_human_by_keyword"
    };
  }

  return { ownerType: null, reason: null };
}

function resolveOwnerSide(
  mode: RoutingPlanMode,
  normalized: NormalizedRoutingRuleActions,
  override: { ownerType: RoutingOwnerSide | null; reason: string | null },
  capacity: {
    humanLoadPct: number | null;
    humanAvailableAgents: number;
    aiLoadPct: number | null;
    aiAvailableAgents: number;
  }
): RoutingOwnerSide {
  if (override.ownerType === "human") return "human";

  if (mode === "human_only") return "human";
  if (mode === "ai_only") return "ai";

  if (mode === "human_first") {
    if (capacity.humanAvailableAgents === 0 && capacity.aiAvailableAgents > 0) {
      return "ai";
    }
    const overflowThreshold = normalized.overflowPolicy.humanToAiThresholdPct;
    const shouldOverflow = overflowThreshold !== null &&
      capacity.humanLoadPct !== null &&
      capacity.humanLoadPct >= overflowThreshold &&
      capacity.aiAvailableAgents > 0;

    return shouldOverflow ? "ai" : "human";
  }

  if (mode === "ai_first") {
    if (capacity.aiAvailableAgents === 0 && capacity.humanAvailableAgents > 0) {
      return "human";
    }
    const overflowThreshold = normalized.overflowPolicy.aiToHumanThresholdPct;
    const shouldOverflow = overflowThreshold !== null &&
      capacity.aiLoadPct !== null &&
      capacity.aiLoadPct >= overflowThreshold &&
      capacity.humanAvailableAgents > 0;

    return shouldOverflow ? "human" : "ai";
  }

  const hybridStrategy = normalized.hybridPolicy.strategy ?? "load_balanced";
  if (hybridStrategy === "prefer_human") {
    if (capacity.humanAvailableAgents > 0) return "human";
    return "ai";
  }
  if (hybridStrategy === "prefer_ai") {
    if (capacity.aiAvailableAgents > 0) return "ai";
    return "human";
  }

  const humanLoad = capacity.humanLoadPct ?? Number.POSITIVE_INFINITY;
  const aiLoad = capacity.aiLoadPct ?? Number.POSITIVE_INFINITY;

  if (capacity.humanAvailableAgents === 0 && capacity.aiAvailableAgents > 0) return "ai";
  if (capacity.aiAvailableAgents === 0) return "human";
  return humanLoad <= aiLoad ? "human" : "ai";
}

function resolvePlanAction(
  selectedOwnerType: RoutingOwnerSide,
  assignedAgentId: string | null
): RoutingPlanAction {
  if (selectedOwnerType === "ai") return "assign_ai_owner";
  if (assignedAgentId) return "assign_specific_owner";
  return "enqueue_for_human";
}

async function buildFallbackDecision(
  db: Knex | Knex.Transaction,
  context: RoutingContext,
  normalized: NormalizedRoutingRuleActions,
  matchedRule: RoutingRuleRow | null
): Promise<RoutingPlan["fallback"]> {
  const fallbackTarget = normalized.fallbackTarget ?? {
    departmentId: normalized.humanTarget.departmentId,
    teamId: normalized.humanTarget.teamId,
    skillGroupCode: normalized.humanTarget.skillGroupCode,
    assignmentStrategy: normalized.humanTarget.assignmentStrategy
  };

  const decision = await humanDispatchService.decideForTarget(db, {
    tenantId: context.tenantId,
    target: {
      departmentId: fallbackTarget.departmentId,
      departmentCode: null,
      teamId: fallbackTarget.teamId,
      teamCode: null,
      skillGroupCode: fallbackTarget.skillGroupCode,
      assignmentStrategy: fallbackTarget.assignmentStrategy
    },
    priority: matchedRule?.priority ?? 100,
    reason: "fallback_human_target",
    auditSource: buildAuditSource(matchedRule)
  });

  return {
    moduleId: decision.moduleId,
    departmentId: decision.departmentId,
    teamId: decision.teamId,
    skillGroupId: decision.skillGroupId,
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
  if (input.overrideReason) return input.overrideReason;
  if (input.selectedOwnerType === "human") {
    return `${input.mode}:${input.humanDecisionReason}`;
  }
  return `${input.mode}:${input.aiSelectionReason}`;
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
      moduleId: context.existingAssignment?.moduleId ?? null,
      skillGroupId: context.existingAssignment?.skillGroupId ?? null,
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
      selectedOwnerType: "human"
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
