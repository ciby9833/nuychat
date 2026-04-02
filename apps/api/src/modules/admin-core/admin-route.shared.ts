import type { Knex } from "knex";

import {
  isInternalControlPayload,
  normalizeStructuredMessage,
  structuredToPlainText
} from "../../shared/messaging/structured-message.js";
import { CUSTOMER_MESSAGE_SENDER_TYPE, SERVICE_REPLY_SENDER_TYPES } from "../message/message.constants.js";
import { normalizeRoutingRuleActions } from "../routing-engine/routing-rule-schema.js";
import { isDateString, toIsoString } from "../tenant/tenant-admin.shared.js";

export function readStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function readNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function extractMessagePreview(content: unknown): string {
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as unknown;
      return extractMessagePreview(parsed);
    } catch {
      return content;
    }
  }

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    const structured = normalizeStructuredMessage(record.structured);
    if (structured) {
      return structuredToPlainText(structured, "-");
    }
    if (typeof record.text === "string" && record.text.trim()) {
      return isInternalControlPayload(record.text) ? "-" : record.text.trim();
    }
    if (Array.isArray(record.attachments) && record.attachments.length > 0) return "[media]";
  }

  return "-";
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>);
}

export type LatestAITrace = {
  handoffReason: string | null;
  error: string | null;
  steps: unknown;
};

export async function getLatestAITracesByConversation(
  trx: Knex.Transaction,
  tenantId: string,
  conversationIds: string[]
): Promise<Map<string, LatestAITrace>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await trx("ai_traces")
    .where({ tenant_id: tenantId })
    .whereIn("conversation_id", conversationIds)
    .select("conversation_id", "steps", "handoff_reason", "error", "created_at")
    .orderBy("conversation_id", "asc")
    .orderBy("created_at", "desc");

  const latest = new Map<string, LatestAITrace>();
  for (const row of rows) {
    const conversationId = String(row.conversation_id);
    if (latest.has(conversationId)) continue;
    latest.set(conversationId, {
      handoffReason: (row.handoff_reason as string | null) ?? null,
      error: (row.error as string | null) ?? null,
      steps: parseJsonValue(row.steps)
    });
  }

  return latest;
}

export function deriveAIRisk(input: {
  handoffRequired: boolean;
  handoffReason: string | null;
  trace: LatestAITrace | null;
}): { riskLevel: "normal" | "attention" | "high"; riskReasons: string[] } {
  const reasons: string[] = [];
  let high = false;
  let attention = false;

  const handoffReason = (input.handoffReason ?? input.trace?.handoffReason ?? "").toLowerCase();
  const traceError = (input.trace?.error ?? "").trim();
  const intent = extractTraceIntent(input.trace?.steps);

  if (input.handoffRequired) {
    high = true;
    reasons.push("AI 已请求转人工");
  }

  if (traceError) {
    high = true;
    reasons.push("AI 执行异常");
  }

  if (matchesRiskReason(handoffReason, ["complaint", "angry", "refund", "dispute", "legal", "abuse", "escalat"])) {
    high = true;
    reasons.push("会话涉及敏感投诉或争议");
  }

  if (matchesRiskReason(handoffReason, ["unknown", "unclear", "blocked", "policy", "no_active_ai_agent"])) {
    attention = true;
    reasons.push("AI 判断不稳定或能力受限");
  }

  if (intent === "unknown") {
    attention = true;
    reasons.push("意图识别不明确");
  }

  return {
    riskLevel: high ? "high" : attention ? "attention" : "normal",
    riskReasons: Array.from(new Set(reasons))
  };
}

function extractTraceIntent(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const record = step as Record<string, unknown>;
    if (record.step === "intent" && typeof record.output === "string") {
      return record.output.toLowerCase();
    }
  }
  return null;
}

function matchesRiskReason(reason: string, keywords: string[]): boolean {
  if (!reason) return false;
  return keywords.some((keyword) => reason.includes(keyword));
}

export function buildDispatchSuggestions(
  executions: Array<Record<string, unknown>>,
  transitions: Array<Record<string, unknown>>,
  teamCandidates: Array<Record<string, unknown>>
) {
  const aiAgents: SuggestionItem[] = [];
  const teams: SuggestionItem[] = [];
  const customerSegments: SuggestionItem[] = [];

  const byRule = new Map<string, Array<Record<string, unknown>>>();
  for (const row of executions) {
    const ruleName = typeof row.routing_rule_name === "string" && row.routing_rule_name.trim()
      ? row.routing_rule_name.trim()
      : "未命名默认规则";
    const bucket = byRule.get(ruleName) ?? [];
    bucket.push(row);
    byRule.set(ruleName, bucket);
  }

  const transitionsByExecution = new Map<string, Array<Record<string, unknown>>>();
  for (const row of transitions) {
    const executionId = typeof row.execution_ref === "string" ? row.execution_ref : "";
    if (!executionId) continue;
    const bucket = transitionsByExecution.get(executionId) ?? [];
    bucket.push(row);
    transitionsByExecution.set(executionId, bucket);
  }

  const aiBuckets = new Map<string, Array<Record<string, unknown>>>();
  const customerBuckets = new Map<string, Array<Record<string, unknown>>>();
  const teamCandidateBuckets = new Map<string, TeamCandidateBucket>();

  for (const row of executions) {
    const summary = parseJsonRecord(row.decision_summary);
    const aiAgentId = typeof summary.aiAgentId === "string" ? summary.aiAgentId : null;
    const customerKey = `${typeof row.customer_tier === "string" ? row.customer_tier : "unknown"}::${typeof row.channel_type === "string" ? row.channel_type : "unknown"}`;

    if (aiAgentId) {
      const bucket = aiBuckets.get(aiAgentId) ?? [];
      bucket.push(row);
      aiBuckets.set(aiAgentId, bucket);
    }

    const customerBucket = customerBuckets.get(customerKey) ?? [];
    customerBucket.push(row);
    customerBuckets.set(customerKey, customerBucket);
  }

  const normalizedTeamCandidates = teamCandidates.length > 0
    ? teamCandidates
    : executions.flatMap((row) => {
        const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
        return parseJsonArray(row.candidates)
          .filter((candidate) => candidate.candidateType === "team")
          .map((candidate) => ({
            executionRef: executionId,
            candidate_id: candidate.candidateId,
            candidate_label: candidate.candidateLabel,
            accepted: candidate.accepted,
            reject_reason: candidate.rejectReason,
            details: candidate.details ?? {}
          }));
      });

  for (const row of normalizedTeamCandidates) {
    const teamId = typeof row.candidate_id === "string" ? row.candidate_id : "";
    if (!teamId) continue;
    const teamName = typeof row.candidate_label === "string" && row.candidate_label.trim()
      ? row.candidate_label.trim()
      : teamId.slice(0, 8);
    const bucket = teamCandidateBuckets.get(teamId) ?? {
      teamId,
      teamName,
      total: 0,
      accepted: 0,
      rejected: 0,
      rejectReasons: new Map<string, number>(),
      noEligibleAgent: 0
    };
    bucket.total += 1;
    if (row.accepted) {
      bucket.accepted += 1;
    } else {
      bucket.rejected += 1;
      const rejectReason = typeof row.reject_reason === "string" && row.reject_reason.trim()
        ? row.reject_reason.trim()
        : "unknown";
      bucket.rejectReasons.set(rejectReason, (bucket.rejectReasons.get(rejectReason) ?? 0) + 1);
      if (
        rejectReason === "team_has_no_eligible_agent" ||
        rejectReason === "agent_on_break" ||
        rejectReason === "agent_not_scheduled" ||
        rejectReason === "outside_shift_window" ||
        rejectReason === "agent_concurrency_disabled" ||
        rejectReason === "agent_concurrency_full"
      ) {
        bucket.noEligibleAgent += 1;
      }
    }
    teamCandidateBuckets.set(teamId, bucket);
  }

  for (const [ruleName, rows] of byRule.entries()) {
    if (rows.length < 5) continue;

    const aiRows = rows.filter((row) => row.trigger_type === "ai_routing");
    const fallbackAi = aiRows.filter((row) => row.reason === "first_active_ai_agent").length;
    const noEligible = rows.filter((row) => row.reason === "no-eligible-agent").length;
    const manualTransferCount = rows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) =>
        transition.decision_type === "human_to_human_transfer" ||
        transition.decision_type === "supervisor_transfer"
      );
    }).length;
    const aiHandoffCount = aiRows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;

    if (noEligible / rows.length >= 0.25) {
      teams.push({
        key: `${ruleName}-capacity-gap`,
        severity: "high",
        category: "capacity",
        title: `规则 ${ruleName} 存在明显供给缺口`,
        summary: "该规则命中的会话中，有较高比例最终没有找到可分配人工。",
        metrics: {
          totalExecutions: rows.length,
          noEligibleAgent: noEligible,
          ratio: Number((noEligible / rows.length).toFixed(2))
        },
        recommendation: "优先检查该规则关联的技能组、团队排班、presence 和并发上限，必要时扩大团队范围。"
      });
    }

    if (aiRows.length >= 5 && aiHandoffCount / aiRows.length >= 0.4) {
      aiAgents.push({
        key: `${ruleName}-ai-handoff`,
        severity: "medium",
        category: "ai_quality",
        title: `规则 ${ruleName} 的 AI 转人工比例偏高`,
        summary: "AI 已命中的会话里，较多最终仍然进入人工队列。",
        metrics: {
          aiExecutions: aiRows.length,
          aiHandoff: aiHandoffCount,
          ratio: Number((aiHandoffCount / aiRows.length).toFixed(2))
        },
        recommendation: "检查该规则是否更适合 human_first，或替换更匹配的 AI 座席与提示词。"
      });
    }

    if (aiRows.length >= 5 && fallbackAi / aiRows.length >= 0.5) {
      aiAgents.push({
        key: `${ruleName}-ai-fallback`,
        severity: "medium",
        category: "routing",
        title: `规则 ${ruleName} 过度依赖 AI fallback`,
        summary: "多数 AI 路由没有命中明确的 AI 绑定，而是退回到默认 active AI。",
        metrics: {
          aiExecutions: aiRows.length,
          fallbackAi,
          ratio: Number((fallbackAi / aiRows.length).toFixed(2))
        },
        recommendation: "为该规则明确配置 aiAgentId，避免不同 AI 能力混用导致结果不稳定。"
      });
    }

    if (manualTransferCount / rows.length >= 0.2) {
      teams.push({
        key: `${ruleName}-manual-transfer`,
        severity: "low",
        category: "ownership",
        title: `规则 ${ruleName} 的人工转移偏多`,
        summary: "进入该规则的会话后，较多又被人工二次转移。",
        metrics: {
          totalExecutions: rows.length,
          manualTransfers: manualTransferCount,
          ratio: Number((manualTransferCount / rows.length).toFixed(2))
        },
        recommendation: "检查目标部门/团队是否过宽，或者技能组是否需要进一步细分，减少人工二次分流。"
      });
    }
  }

  for (const [aiAgentId, rows] of aiBuckets.entries()) {
    if (rows.length < 5) continue;
    const handoffCount = rows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;
    if (handoffCount / rows.length >= 0.45) {
      aiAgents.push({
        key: `${aiAgentId}-handoff-rate`,
        severity: "high",
        category: "ai_agent",
        title: `AI 座席 ${aiAgentId.slice(0, 8)} 转人工偏高`,
        summary: "该 AI 座席处理的会话里，较多最终仍然进入人工队列。",
        metrics: {
          aiAgentId,
          executions: rows.length,
          aiHandoff: handoffCount,
          ratio: Number((handoffCount / rows.length).toFixed(2))
        },
        recommendation: "优先检查该 AI 座席的人设、提示词、适用场景，必要时缩小其可处理范围。"
      });
    }
  }

  for (const bucket of teamCandidateBuckets.values()) {
    if (bucket.total < 5 || bucket.rejected === 0) continue;
    const sortedReasons = [...bucket.rejectReasons.entries()].sort((a, b) => b[1] - a[1]);
    const [topRejectReason, topRejectCount] = sortedReasons[0] ?? ["unknown", 0];
    const topRejectRatio = topRejectCount / bucket.rejected;
    const noEligibleRatio = bucket.noEligibleAgent / bucket.total;

    if (noEligibleRatio >= 0.25) {
      teams.push({
        key: `${bucket.teamId}-capacity-gap`,
        severity: "high",
        category: "team_capacity",
        title: `团队 ${bucket.teamName} 经常因无可用座席被淘汰`,
        summary: "该团队进入候选范围后，较高比例因班次、休息或并发原因没有可接单座席。",
        metrics: {
          teamId: bucket.teamId,
          candidateCount: bucket.total,
          noEligible: bucket.noEligibleAgent,
          ratio: Number(noEligibleRatio.toFixed(2)),
          topRejectReason
        },
        recommendation: describeTeamRejectRecommendation(topRejectReason)
      });
      continue;
    }

    if (topRejectReason === "team_not_selected" && topRejectRatio >= 0.6) {
      teams.push({
        key: `${bucket.teamId}-not-selected`,
        severity: "medium",
        category: "team_priority",
        title: `团队 ${bucket.teamName} 常进候选但很少最终命中`,
        summary: "该团队具备接单资格，但在团队层决策中大多被其他团队优先选走。",
        metrics: {
          teamId: bucket.teamId,
          candidateCount: bucket.total,
          rejected: bucket.rejected,
          ratio: Number((bucket.rejected / bucket.total).toFixed(2)),
          topRejectReason
        },
        recommendation: "检查该团队的负载、主团队归属和规则范围，确认它是否应该承担更高优先级，或改为更明确的 team 定向规则。"
      });
    }
  }

  for (const [bucketKey, rows] of customerBuckets.entries()) {
    if (rows.length < 8) continue;
    const [tier, channel] = bucketKey.split("::");
    const aiRows = rows.filter((row) => row.trigger_type === "ai_routing");
    const aiHandoffCount = aiRows.filter((row) => {
      const executionId = typeof row.trace_id === "string" ? row.trace_id : "";
      const related = transitionsByExecution.get(executionId) ?? [];
      return related.some((transition) => transition.decision_type === "ai_handoff_to_human_queue");
    }).length;
    if (aiRows.length >= 5 && aiHandoffCount / aiRows.length >= 0.5) {
      customerSegments.push({
        key: `${bucketKey}-segment-ai`,
        severity: "medium",
        category: "customer_segment",
        title: `${tier} / ${channel} 客群 AI 转人工偏高`,
        summary: "这个客户等级和渠道组合下，AI 接待后仍然大量进入人工。",
        metrics: {
          tier,
          channel,
          aiExecutions: aiRows.length,
          aiHandoff: aiHandoffCount,
          ratio: Number((aiHandoffCount / aiRows.length).toFixed(2))
        },
        recommendation: "评估该客群是否更适合 human_first，或为其单独配置更匹配的 AI 与规则。"
      });
    }
  }

  return {
    aiAgents: aiAgents.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8),
    teams: teams.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8),
    customerSegments: customerSegments.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 8)
  };
}

type SuggestionItem = {
  key: string;
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  summary: string;
  metrics: Record<string, number | string>;
  recommendation: string;
};

type TeamCandidateBucket = {
  teamId: string;
  teamName: string;
  total: number;
  accepted: number;
  rejected: number;
  rejectReasons: Map<string, number>;
  noEligibleAgent: number;
};

function severityRank(value: "high" | "medium" | "low") {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function describeTeamRejectRecommendation(reason: string) {
  if (reason === "agent_on_break") {
    return "优先检查该团队 break 规则和高峰期休息安排，避免候选团队整体在关键时段失去可接单能力。";
  }
  if (reason === "agent_not_scheduled" || reason === "outside_shift_window") {
    return "优先检查该团队排班覆盖与规则时段是否匹配，必要时调整班次覆盖或收窄该规则的生效范围。";
  }
  if (reason === "agent_concurrency_disabled" || reason === "agent_concurrency_full") {
    return "优先检查该团队并发上限和实时负载，必要时提高并发配置或扩充同技能座席。";
  }
  return "优先检查该团队的排班、休息、presence 和并发配置，确认它在命中规则的时段内确实有可接单座席。";
}

export function serializeRoutingRuleActions(value: unknown) {
  const normalized = normalizeRoutingRuleActions(value);
  return {
    executionMode: normalized.executionMode,
    humanTarget: {
      ...(normalized.humanTarget.departmentId ? { departmentId: normalized.humanTarget.departmentId } : {}),
      ...(normalized.humanTarget.departmentCode ? { departmentCode: normalized.humanTarget.departmentCode } : {}),
      ...(normalized.humanTarget.teamId ? { teamId: normalized.humanTarget.teamId } : {}),
      ...(normalized.humanTarget.teamCode ? { teamCode: normalized.humanTarget.teamCode } : {}),
      ...(normalized.humanTarget.skillGroupCode ? { skillGroupCode: normalized.humanTarget.skillGroupCode } : {}),
      ...(normalized.humanTarget.assignmentStrategy ? { assignmentStrategy: normalized.humanTarget.assignmentStrategy } : {})
    },
    aiTarget: {
      ...(normalized.aiTarget.aiAgentId ? { aiAgentId: normalized.aiTarget.aiAgentId } : {}),
      ...(normalized.aiTarget.assignmentStrategy ? { assignmentStrategy: normalized.aiTarget.assignmentStrategy } : {})
    },
    ...(normalized.overflowPolicy.humanToAiThresholdPct !== null ||
    normalized.overflowPolicy.aiToHumanThresholdPct !== null ||
    normalized.overflowPolicy.aiSoftConcurrencyLimit !== null
      ? {
          overflowPolicy: {
            ...(normalized.overflowPolicy.humanToAiThresholdPct !== null
              ? { humanToAiThresholdPct: normalized.overflowPolicy.humanToAiThresholdPct }
              : {}),
            ...(normalized.overflowPolicy.aiToHumanThresholdPct !== null
              ? { aiToHumanThresholdPct: normalized.overflowPolicy.aiToHumanThresholdPct }
              : {}),
            ...(normalized.overflowPolicy.aiSoftConcurrencyLimit !== null
              ? { aiSoftConcurrencyLimit: normalized.overflowPolicy.aiSoftConcurrencyLimit }
              : {})
          }
        }
      : {}),
    ...(normalized.hybridPolicy.strategy
      ? {
          hybridPolicy: {
            strategy: normalized.hybridPolicy.strategy
          }
        }
      : {}),
    ...(normalized.overrides.customerRequestsHuman ||
    normalized.overrides.humanRequestKeywords.length > 0 ||
    normalized.overrides.aiUnhandled
      ? {
          overrides: {
            ...(normalized.overrides.customerRequestsHuman
              ? { customerRequestsHuman: normalized.overrides.customerRequestsHuman }
              : {}),
            ...(normalized.overrides.humanRequestKeywords.length > 0
              ? { humanRequestKeywords: normalized.overrides.humanRequestKeywords }
              : {}),
            ...(normalized.overrides.aiUnhandled
              ? { aiUnhandled: normalized.overrides.aiUnhandled }
              : {})
          }
        }
      : {}),
    ...(normalized.fallbackTarget
      ? {
          fallbackTarget: {
            ...(normalized.fallbackTarget.departmentId ? { departmentId: normalized.fallbackTarget.departmentId } : {}),
            ...(normalized.fallbackTarget.teamId ? { teamId: normalized.fallbackTarget.teamId } : {}),
            ...(normalized.fallbackTarget.skillGroupCode ? { skillGroupCode: normalized.fallbackTarget.skillGroupCode } : {}),
            ...(normalized.fallbackTarget.assignmentStrategy ? { assignmentStrategy: normalized.fallbackTarget.assignmentStrategy } : {})
          }
        }
      : {})
  };
}

export function resolveDateRange(input: {
  preset?: string;
  from?: string;
  to?: string;
  timezone: string;
}): { startIso: string; endIso: string } {
  if (input.preset === "custom" && isDateString(input.from) && isDateString(input.to)) {
    return {
      startIso: zonedDateBoundaryToIso(input.from, "start"),
      endIso: zonedDateBoundaryToIso(input.to, "end")
    };
  }

  const today = formatDateInTimezone(new Date(), input.timezone);
  if (input.preset === "yesterday") {
    const yesterday = shiftDateString(today, -1);
    return { startIso: zonedDateBoundaryToIso(yesterday, "start"), endIso: zonedDateBoundaryToIso(yesterday, "end") };
  }
  if (input.preset === "last7d") {
    const start = shiftDateString(today, -6);
    return { startIso: zonedDateBoundaryToIso(start, "start"), endIso: zonedDateBoundaryToIso(today, "end") };
  }

  return { startIso: zonedDateBoundaryToIso(today, "start"), endIso: zonedDateBoundaryToIso(today, "end") };
}

function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function shiftDateString(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function zonedDateBoundaryToIso(date: string, boundary: "start" | "end"): string {
  const suffix = boundary === "start" ? "T00:00:00+07:00" : "T23:59:59.999+07:00";
  return new Date(`${date}${suffix}`).toISOString();
}

export function buildSupervisorWaitingConversationIdsQuery(
  trx: Knex.Transaction,
  tenantId: string
) {
  const latestCustomerMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_customer_message_at: string | Date | null }[]>(
      "m.created_at as latest_customer_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "inbound")
    .where("m.sender_type", CUSTOMER_MESSAGE_SENDER_TYPE)
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lcm");

  const latestServiceMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_service_message_at: string | Date | null }[]>(
      "m.created_at as latest_service_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "outbound")
    .whereIn("m.sender_type", [...SERVICE_REPLY_SENDER_TYPES])
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lsm");

  return trx("conversations as c")
    .leftJoin(latestCustomerMessageQuery, function joinLatestCustomerMessage() {
      this.on("lcm.conversation_id", "=", "c.conversation_id").andOn("lcm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(latestServiceMessageQuery, function joinLatestServiceMessage() {
      this.on("lsm.conversation_id", "=", "c.conversation_id").andOn("lsm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .where("c.tenant_id", tenantId)
    .whereNotIn("c.status", ["resolved", "closed"])
    .whereNotNull("lcm.latest_customer_message_at")
    .where((builder) => {
      builder.whereNull("lsm.latest_service_message_at").orWhereRaw("lcm.latest_customer_message_at > lsm.latest_service_message_at");
    })
    .select(
      "c.tenant_id",
      "c.conversation_id",
      "lcm.latest_customer_message_at as waiting_from",
      trx.raw("GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - lcm.latest_customer_message_at))))::int as waiting_seconds"),
      trx.raw(`
        case
          when qa.assigned_ai_agent_id is not null and c.status in ('open', 'bot_active') then 'ai'
          else 'human'
        end as owner_bucket
      `)
    );
}

export async function buildSupervisorConversationWorkbenchRows(
  trx: Knex.Transaction,
  tenantId: string,
  filters: { departmentId: string | null; teamId: string | null; agentId: string | null }
) {
  const latestCustomerMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_customer_message_at: string | Date | null }[]>(
      "m.created_at as latest_customer_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "inbound")
    .where("m.sender_type", CUSTOMER_MESSAGE_SENDER_TYPE)
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lcm");

  const latestServiceMessageQuery = trx("messages as m")
    .select("m.tenant_id", "m.conversation_id")
    .max<{ tenant_id: string; conversation_id: string; latest_service_message_at: string | Date | null }[]>(
      "m.created_at as latest_service_message_at"
    )
    .where("m.tenant_id", tenantId)
    .where("m.direction", "outbound")
    .whereIn("m.sender_type", [...SERVICE_REPLY_SENDER_TYPES])
    .groupBy("m.tenant_id", "m.conversation_id")
    .as("lsm");

  const reassignCountQuery = trx("conversation_events as ce")
    .select("ce.tenant_id", "ce.conversation_id")
    .count<{ tenant_id: string; conversation_id: string; reassign_count: string }[]>("ce.event_type as reassign_count")
    .where("ce.tenant_id", tenantId)
    .where("ce.event_type", "assignment_reassigned")
    .groupBy("ce.tenant_id", "ce.conversation_id")
    .as("rc");

  const waitingConversationIdsQuery = buildSupervisorWaitingConversationIdsQuery(trx, tenantId).as("sw");

  const rows = await trx("conversations as c")
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("conversation_cases as cc", function joinCurrentCase() {
      this.on("cc.case_id", "=", "c.current_case_id").andOn("cc.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("customers as cu", function joinCustomer() {
      this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("departments as d", function joinDepartment() {
      this.on("d.department_id", "=", "qa.department_id").andOn("d.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("teams as t", function joinTeam() {
      this.on("t.team_id", "=", "qa.team_id").andOn("t.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("agent_profiles as current_ap", function joinCurrentAgent() {
      this.on("current_ap.agent_id", "=", "cc.current_owner_id").andOn("current_ap.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_memberships as current_tm", "current_tm.membership_id", "current_ap.membership_id")
    .leftJoin("tenant_ai_agents as current_ai", function joinCurrentAi() {
      this.on("current_ai.ai_agent_id", "=", "cc.current_owner_id").andOn("current_ai.tenant_id", "=", "cc.tenant_id");
    })
    .leftJoin("tenant_ai_agents as current_handler_ai", function joinCurrentHandlerAi() {
      this.on(trx.raw("current_handler_ai.ai_agent_id::text") as unknown as string, "=", trx.ref("c.current_handler_id"))
        .andOn("current_handler_ai.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("agent_profiles as reserved_ap", function joinReservedAgent() {
      this.on("reserved_ap.agent_id", "=", "qa.assigned_agent_id").andOn("reserved_ap.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin("tenant_memberships as reserved_tm", "reserved_tm.membership_id", "reserved_ap.membership_id")
    .leftJoin("tenant_ai_agents as reserved_ai", function joinReservedAi() {
      this.on("reserved_ai.ai_agent_id", "=", "qa.assigned_ai_agent_id").andOn("reserved_ai.tenant_id", "=", "qa.tenant_id");
    })
    .leftJoin(latestCustomerMessageQuery, function joinLatestCustomerMessage() {
      this.on("lcm.conversation_id", "=", "c.conversation_id").andOn("lcm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(latestServiceMessageQuery, function joinLatestServiceMessage() {
      this.on("lsm.conversation_id", "=", "c.conversation_id").andOn("lsm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(reassignCountQuery, function joinReassignCounts() {
      this.on("rc.conversation_id", "=", "c.conversation_id").andOn("rc.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin(waitingConversationIdsQuery, function joinWaitingConversations() {
      this.on("sw.conversation_id", "=", "c.conversation_id").andOn("sw.tenant_id", "=", "c.tenant_id");
    })
    .where("c.tenant_id", tenantId)
    .whereExists(function ensureConversationHasMessages() {
      this.select(trx.raw("1"))
        .from("messages as m")
        .whereRaw("m.tenant_id = c.tenant_id")
        .andWhereRaw("m.conversation_id = c.conversation_id");
    })
    .modify((qb) => {
      if (filters.departmentId) qb.andWhere("qa.department_id", filters.departmentId);
      if (filters.teamId) qb.andWhere("qa.team_id", filters.teamId);
      if (filters.agentId) {
        qb.andWhere((scope) => {
          scope
            .where("qa.assigned_agent_id", filters.agentId)
            .orWhere("c.assigned_agent_id", filters.agentId)
            .orWhere((inner) => inner.where("cc.current_owner_type", "agent").andWhere("cc.current_owner_id", filters.agentId));
        });
      }
    })
    .select(
      "c.conversation_id",
      "c.status as conversation_status",
      "c.channel_type",
      "c.last_message_preview",
      "c.last_message_at",
      "c.current_handler_type",
      "c.current_handler_id",
      "c.assigned_agent_id as conversation_assigned_agent_id",
      "qa.assignment_id",
      "qa.status as queue_status",
      "qa.handoff_required",
      "qa.handoff_reason",
      "qa.assigned_agent_id",
      "qa.assigned_ai_agent_id",
      "qa.department_id",
      "qa.team_id",
      "cc.case_id",
      "cc.title as case_title",
      "cc.current_owner_type",
      "cc.current_owner_id",
      "cu.display_name as customer_name",
      "cu.external_ref as customer_ref",
      "d.name as department_name",
      "t.name as team_name",
      "current_tm.display_name as current_owner_agent_name",
      "current_ai.name as current_owner_ai_name",
      "current_handler_ai.name as current_handler_ai_name",
      "reserved_tm.display_name as reserved_owner_agent_name",
      "reserved_ai.name as reserved_owner_ai_name",
      "lcm.latest_customer_message_at",
      "lsm.latest_service_message_at",
      "rc.reassign_count",
      "sw.owner_bucket",
      "sw.waiting_from",
      "sw.waiting_seconds"
    )
    .orderByRaw("COALESCE(lcm.latest_customer_message_at, c.last_message_at, c.updated_at) desc nulls last") as Array<Record<string, unknown>>;

  return rows.map((row) => mapSupervisorConversationWorkbenchRow(row));
}

export function normalizeSupervisorWorkbenchScope(value: unknown): "all" | "waiting" | "exception" | "active" | "resolved" {
  if (value === "all" || value === "waiting" || value === "exception" || value === "active" || value === "resolved") {
    return value;
  }
  return "all";
}

export function filterSupervisorConversationWorkbenchRows(
  rows: Array<ReturnType<typeof mapSupervisorConversationWorkbenchRow>>,
  scope: "all" | "waiting" | "exception" | "active" | "resolved"
) {
  if (scope === "all") return rows;
  if (scope === "waiting") return rows.filter((row) => row.waitingSeconds > 0);
  if (scope === "exception") return rows.filter((row) => Boolean(row.currentExceptionReason));
  if (scope === "resolved") {
    return rows.filter((row) => row.conversationStatus === "resolved" || row.conversationStatus === "closed");
  }
  return rows.filter((row) => row.conversationStatus !== "resolved" && row.conversationStatus !== "closed");
}

function mapSupervisorConversationWorkbenchRow(row: Record<string, unknown>) {
  const currentResponsible = resolveSupervisorCurrentResponsible(row);
  const reservedResponsible = resolveSupervisorReservedResponsible(row);
  const latestCustomerMessageAt = toOptionalIsoString(row.latest_customer_message_at);
  const latestServiceMessageAt = toOptionalIsoString(row.latest_service_message_at);
  const currentExceptionReason = deriveSupervisorExceptionReason({
    handoffRequired: Boolean(row.handoff_required),
    handoffReason: readNullableString(row.handoff_reason),
    latestCustomerMessageAt,
    latestServiceMessageAt,
    currentResponsibleType: currentResponsible.ownerType,
    reservedResponsibleType: reservedResponsible.ownerType
  });

  return {
    assignmentId: readNullableString(row.assignment_id),
    conversationId: String(row.conversation_id),
    caseId: readNullableString(row.case_id),
    caseTitle: readNullableString(row.case_title),
    conversationStatus: readNullableString(row.conversation_status),
    queueStatus: readNullableString(row.queue_status),
    channelType: readNullableString(row.channel_type),
    customerName: readNullableString(row.customer_name),
    customerRef: readNullableString(row.customer_ref),
    departmentId: readNullableString(row.department_id),
    departmentName: readNullableString(row.department_name),
    teamId: readNullableString(row.team_id),
    teamName: readNullableString(row.team_name),
    lastMessagePreview: readNullableString(row.last_message_preview),
    lastMessageAt: toOptionalIsoString(row.last_message_at),
    lastCustomerMessageAt: latestCustomerMessageAt,
    lastServiceMessageAt: latestServiceMessageAt,
    waitingFrom: toOptionalIsoString(row.waiting_from),
    waitingSeconds: Number(row.waiting_seconds ?? 0),
    ownerBucket: readNullableString(row.owner_bucket),
    hasFirstResponse: Boolean(latestServiceMessageAt),
    reassignCount: Number(row.reassign_count ?? 0),
    currentResponsibleType: currentResponsible.ownerType,
    currentResponsibleId: currentResponsible.ownerId,
    currentResponsibleName: currentResponsible.ownerName,
    reservedResponsibleType: reservedResponsible.ownerType,
    reservedResponsibleId: reservedResponsible.ownerId,
    reservedResponsibleName: reservedResponsible.ownerName,
    currentExceptionReason
  };
}

function resolveSupervisorCurrentResponsible(row: Record<string, unknown>) {
  const currentOwnerType = readNullableString(row.current_owner_type);
  const currentOwnerId = readNullableString(row.current_owner_id);
  if (currentOwnerType && currentOwnerType !== "system" && currentOwnerId) {
    return {
      ownerType: currentOwnerType,
      ownerId: currentOwnerId,
      ownerName: readNullableString(row.current_owner_agent_name) ?? readNullableString(row.current_owner_ai_name)
    };
  }

  const currentHandlerType = readNullableString(row.current_handler_type);
  const currentHandlerId = readNullableString(row.current_handler_id);
  if (currentHandlerType === "ai" && currentHandlerId) {
    return {
      ownerType: "ai",
      ownerId: currentHandlerId,
      ownerName: readNullableString(row.current_handler_ai_name) ?? readNullableString(row.current_owner_ai_name)
    };
  }

  if (currentHandlerType === "human" && readNullableString(row.conversation_assigned_agent_id)) {
    return {
      ownerType: "agent",
      ownerId: readNullableString(row.conversation_assigned_agent_id),
      ownerName: readNullableString(row.reserved_owner_agent_name)
    };
  }

  return { ownerType: currentOwnerType, ownerId: currentOwnerId, ownerName: null };
}

function resolveSupervisorReservedResponsible(row: Record<string, unknown>) {
  const queueStatus = readNullableString(row.queue_status);
  const queueAssignmentIsActive = queueStatus === "pending" || queueStatus === "assigned" || queueStatus === "accepted";
  if (!queueAssignmentIsActive) {
    const conversationAssignedAgentId = readNullableString(row.conversation_assigned_agent_id);
    if (conversationAssignedAgentId) {
      return { ownerType: "agent", ownerId: conversationAssignedAgentId, ownerName: readNullableString(row.reserved_owner_agent_name) };
    }

    const currentHandlerType = readNullableString(row.current_handler_type);
    const currentHandlerId = readNullableString(row.current_handler_id);
    if (currentHandlerType === "ai" && currentHandlerId) {
      return {
        ownerType: "ai",
        ownerId: currentHandlerId,
        ownerName: readNullableString(row.current_handler_ai_name) ?? readNullableString(row.current_owner_ai_name)
      };
    }

    return { ownerType: null, ownerId: null, ownerName: null };
  }

  const assignedAgentId = readNullableString(row.assigned_agent_id);
  if (assignedAgentId) {
    return { ownerType: "agent", ownerId: assignedAgentId, ownerName: readNullableString(row.reserved_owner_agent_name) };
  }

  const assignedAiAgentId = readNullableString(row.assigned_ai_agent_id);
  if (assignedAiAgentId) {
    return { ownerType: "ai", ownerId: assignedAiAgentId, ownerName: readNullableString(row.reserved_owner_ai_name) };
  }

  return { ownerType: null, ownerId: null, ownerName: null };
}

function deriveSupervisorExceptionReason(input: {
  handoffRequired: boolean;
  handoffReason: string | null;
  latestCustomerMessageAt: string | null;
  latestServiceMessageAt: string | null;
  currentResponsibleType: string | null;
  reservedResponsibleType: string | null;
}) {
  if (input.handoffReason === "unanswered_auto_closed") return "unanswered_auto_closed";
  if (!input.latestCustomerMessageAt) return null;
  if (!input.latestServiceMessageAt) {
    if (input.reservedResponsibleType === "ai" || input.currentResponsibleType === "ai") return "awaiting_ai_first_response";
    if (input.reservedResponsibleType === "agent" || input.currentResponsibleType === "agent") return "awaiting_agent_first_response";
    return "unassigned_no_first_response";
  }
  if (new Date(input.latestCustomerMessageAt).getTime() > new Date(input.latestServiceMessageAt).getTime()) {
    if (input.handoffRequired) return input.handoffReason ?? "handoff_pending";
    if (input.reservedResponsibleType === "ai" || input.currentResponsibleType === "ai") return "awaiting_ai_reply";
    if (input.reservedResponsibleType === "agent" || input.currentResponsibleType === "agent") return "awaiting_agent_reply";
    return "awaiting_assignment";
  }
  return null;
}

function toOptionalIsoString(value: unknown): string | null {
  if (!value) return null;
  return toIsoString(value);
}

export function normalizeModuleOperatingMode(value: unknown): "human_first" | "ai_first" | "ai_autonomous" | "workflow_first" {
  if (value === "human_first" || value === "ai_first" || value === "ai_autonomous" || value === "workflow_first") {
    return value;
  }
  return "ai_first";
}

export function resolveConversationCaseEffectiveOwner(row: Record<string, unknown>): {
  ownerType: string | null;
  ownerId: string | null;
  ownerName: string | null;
} {
  const caseStatus = readNullableString(row.status);
  const currentOwnerType = readNullableString(row.current_owner_type);
  const currentOwnerId = readNullableString(row.current_owner_id);
  if (currentOwnerType && currentOwnerType !== "system" && currentOwnerId) {
    return {
      ownerType: currentOwnerType,
      ownerId: currentOwnerId,
      ownerName: readNullableString(row.owner_agent_name) ?? readNullableString(row.owner_ai_name)
    };
  }

  const reservedAgentId = readNullableString(row.assigned_agent_id);
  if (reservedAgentId) {
    return { ownerType: "agent", ownerId: reservedAgentId, ownerName: readNullableString(row.reserved_agent_name) };
  }

  const currentHandlerType = readNullableString(row.current_handler_type);
  const currentHandlerId = readNullableString(row.current_handler_id);
  if (currentHandlerType === "ai" && currentHandlerId) {
    return { ownerType: "ai", ownerId: currentHandlerId, ownerName: readNullableString(row.current_handler_ai_name) };
  }

  if (caseStatus === "resolved" || caseStatus === "closed") {
    const finalOwnerType = readNullableString(row.final_owner_type);
    const finalOwnerId = readNullableString(row.final_owner_id);
    if (finalOwnerType && finalOwnerType !== "system" && finalOwnerId) {
      return {
        ownerType: finalOwnerType,
        ownerId: finalOwnerId,
        ownerName: readNullableString(row.final_owner_agent_name) ?? readNullableString(row.final_owner_ai_name)
      };
    }
  }

  const reservedAiId = readNullableString(row.assigned_ai_agent_id);
  if (reservedAiId) {
    return { ownerType: "ai", ownerId: reservedAiId, ownerName: readNullableString(row.reserved_ai_name) };
  }

  return { ownerType: currentOwnerType, ownerId: currentOwnerId, ownerName: null };
}
