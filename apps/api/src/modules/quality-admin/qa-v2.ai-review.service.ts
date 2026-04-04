import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import {
  resolveTenantAISettingsForScene,
  type TenantAISettings
} from "../ai/provider-config.service.js";
import {
  normalizeStringArray,
  parseJsonNumberMap,
  parseJsonObject,
  parseJsonStringArray
} from "../tenant/tenant-admin.shared.js";
import { loadQaCaseEvidence } from "./qa-v2.case-data.js";
import { ensureActiveQaGuideline } from "./qa-v2.guideline.service.js";
import { QA_RUNTIME_LIMITS } from "./qa-v2.shared.js";
import type { QaAiReviewRecord, QaCaseEvidence, QaTaskRow, QaTaskSource } from "./qa-v2.types.js";

export async function enqueueQaReviewForCase(
  tenantId: string,
  caseId: string,
  input?: { source?: QaTaskSource; createdById?: string | null }
) {
  const prepared = await withTenantTransaction(tenantId, async (trx) => {
    const evidence = await loadQaCaseEvidence(trx, tenantId, caseId);
    if (!evidence) return null;
    if (!["resolved", "closed"].includes(evidence.status)) return null;

    const guideline = await ensureActiveQaGuideline(trx, tenantId);
    const source = classifyTaskSource(evidence, input?.source);

    const [task] = await trx("qa_review_tasks")
      .insert({
        tenant_id: tenantId,
        case_id: caseId,
        source,
        review_mode: "ai_only",
        queue_type: null,
        status: "queued",
        ai_status: "queued",
        risk_level: null,
        risk_reasons: JSON.stringify([]),
        confidence: null,
        recommended_action: null,
        assigned_reviewer_identity_id: null,
        guideline_id: guideline.guidelineId,
        guideline_version: guideline.version
      })
      .onConflict(["tenant_id", "case_id"])
      .merge({
        source,
        guideline_id: guideline.guidelineId,
        guideline_version: guideline.version,
        updated_at: trx.fn.now()
      })
      .returning(["qa_task_id", "guideline_id", "guideline_version"]);

    return {
      qaTaskId: String(task.qa_task_id),
      guidelineId: task.guideline_id ? String(task.guideline_id) : null,
      guidelineVersion: Number(task.guideline_version ?? guideline.version)
    };
  });

  if (!prepared) return null;

  await scheduleLongTask({
    tenantId,
    caseId,
    taskType: "qa_ai_review_generate",
    title: `QA AI review ${caseId}`,
    source: "workflow",
    priority: 90,
    schedulerKey: `qa-ai-review:${caseId}`,
    createdById: input?.createdById ?? null,
    payload: {
      qaTaskId: prepared.qaTaskId,
      guidelineId: prepared.guidelineId,
      guidelineVersion: prepared.guidelineVersion
    }
  });

  return { qaTaskId: prepared.qaTaskId };
}

export async function runQaAiReviewTask(
  trx: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    qaTaskId: string;
    asyncTaskId: string;
    payload: Record<string, unknown>;
  }
) {
  const task = await trx("qa_review_tasks")
    .where({ tenant_id: input.tenantId, qa_task_id: input.qaTaskId })
    .select("*")
    .first<QaTaskRow | undefined>();
  if (!task) {
    throw new Error(`QA task not found: ${input.qaTaskId}`);
  }

  await trx("qa_review_tasks")
    .where({ tenant_id: input.tenantId, qa_task_id: input.qaTaskId })
    .update({
      status: "ai_running",
      ai_status: "running",
      updated_at: trx.fn.now()
    });

  const guideline = await ensureActiveQaGuideline(trx, input.tenantId, task.guideline_id ?? undefined);
  const evidence = await loadQaCaseEvidence(trx, input.tenantId, task.case_id);
  if (!evidence) {
    await markQaTaskSkipped(trx, input.tenantId, input.qaTaskId, "case_not_found");
    return {
      skipped: true,
      reason: "case_not_found"
    };
  }

  const aiSettings = await resolveTenantAISettingsForScene(trx, input.tenantId, "qa_review");
  if (!aiSettings) {
    await markQaTaskSkipped(trx, input.tenantId, input.qaTaskId, "no_ai_config");
    return {
      skipped: true,
      reason: "no_ai_config"
    };
  }

  const qaResult = await generateQaAiReview(aiSettings, guideline, evidence);
  const queueDecision = classifyQueueDecision(evidence, qaResult);

  const [savedAiReview] = await trx("qa_ai_reviews")
    .insert({
      tenant_id: input.tenantId,
      case_id: task.case_id,
      qa_task_id: task.qa_task_id,
      guideline_id: guideline.guidelineId,
      guideline_version: guideline.version,
      provider_name: aiSettings.providerName,
      model: aiSettings.model,
      score: qaResult.score,
      verdict: qaResult.verdict,
      confidence: qaResult.confidence,
      risk_level: qaResult.riskLevel,
      risk_reasons: JSON.stringify(qaResult.riskReasons),
      manual_review_recommended: qaResult.manualReviewRecommended,
      case_summary: qaResult.caseSummary,
      segment_reviews_json: JSON.stringify(qaResult.segmentReviews),
      evidence_json: JSON.stringify(qaResult.evidence),
      raw_output_json: JSON.stringify({
        queueDecision,
        payload: qaResult
      }),
      status: "completed"
    })
    .returning(["qa_ai_review_id"]);

  await trx("qa_review_tasks")
    .where({ tenant_id: input.tenantId, qa_task_id: input.qaTaskId })
    .update({
      queue_type: queueDecision.queueType,
      review_mode: queueDecision.reviewMode,
      status: queueDecision.taskStatus,
      ai_status: "completed",
      risk_level: queueDecision.riskLevel,
      risk_reasons: JSON.stringify(queueDecision.riskReasons),
      confidence: queueDecision.confidence,
      recommended_action: queueDecision.recommendedAction,
      updated_at: trx.fn.now()
    });

  if (queueDecision.queueType === "auto_pass") {
    const reviewId = await upsertAutoPassCaseReview(trx, input.tenantId, task, evidence, qaResult);
    return {
      qaAiReviewId: savedAiReview.qa_ai_review_id,
      qaCaseReviewId: reviewId,
      queueType: queueDecision.queueType,
      score: qaResult.score
    };
  }

  return {
    qaAiReviewId: savedAiReview.qa_ai_review_id,
    queueType: queueDecision.queueType,
    score: qaResult.score
  };
}

function classifyTaskSource(evidence: QaCaseEvidence, preferred?: QaTaskSource): QaTaskSource {
  if (preferred) return preferred;
  if (evidence.hasSlaBreach || evidence.reassignCount > 0 || evidence.segmentCount > 2) {
    return "risk_trigger";
  }
  return "auto_sampling";
}

function shouldSampleCase(caseId: string) {
  let hash = 0;
  for (let index = 0; index < caseId.length; index += 1) {
    hash = ((hash << 5) - hash + caseId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % QA_RUNTIME_LIMITS.sampleModulo === 0;
}

function classifyQueueDecision(evidence: QaCaseEvidence, qaResult: QaAiReviewRecord) {
  const reasons = Array.from(new Set([
    ...qaResult.riskReasons,
    ...(evidence.hasSlaBreach ? ["sla_breach"] : []),
    ...(evidence.reassignCount > 1 ? ["multi_reassign"] : []),
    ...(evidence.segmentCount > 3 ? ["multi_segment"] : [])
  ]));

  const highRisk =
    qaResult.riskLevel === "high"
    || qaResult.score < 80
    || qaResult.confidence < 0.65
    || qaResult.manualReviewRecommended
    || evidence.hasSlaBreach
    || evidence.reassignCount > 1;

  if (highRisk) {
    return {
      queueType: "risk" as const,
      reviewMode: "human_required" as const,
      taskStatus: "review_required" as const,
      riskLevel: qaResult.riskLevel === "low" ? "medium" : qaResult.riskLevel,
      riskReasons: reasons,
      confidence: qaResult.confidence,
      recommendedAction: "manual_review"
    };
  }

  if (shouldSampleCase(evidence.caseId)) {
    return {
      queueType: "sample" as const,
      reviewMode: "human_sampled" as const,
      taskStatus: "review_required" as const,
      riskLevel: qaResult.riskLevel,
      riskReasons: reasons,
      confidence: qaResult.confidence,
      recommendedAction: "sample_review"
    };
  }

  return {
    queueType: "auto_pass" as const,
    reviewMode: "ai_only" as const,
    taskStatus: "ai_completed" as const,
    riskLevel: qaResult.riskLevel,
    riskReasons: reasons,
    confidence: qaResult.confidence,
    recommendedAction: "auto_pass"
  };
}

async function markQaTaskSkipped(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  qaTaskId: string,
  reason: string
) {
  await trx("qa_review_tasks")
    .where({ tenant_id: tenantId, qa_task_id: qaTaskId })
    .update({
      status: "skipped",
      ai_status: "skipped",
      queue_type: "risk",
      review_mode: "human_required",
      risk_level: "high",
      risk_reasons: JSON.stringify([reason]),
      recommended_action: "manual_review",
      updated_at: trx.fn.now()
    });
}

async function upsertAutoPassCaseReview(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  task: QaTaskRow,
  evidence: QaCaseEvidence,
  qaResult: QaAiReviewRecord
) {
  const [review] = await trx("qa_case_reviews")
    .insert({
      tenant_id: tenantId,
      qa_task_id: task.qa_task_id,
      case_id: task.case_id,
      reviewer_identity_id: null,
      source: "ai_auto_pass",
      final_owner_type: evidence.finalOwnerType,
      final_owner_id: evidence.finalOwnerId,
      resolved_by_agent_id: evidence.resolvedByAgentId,
      total_score: qaResult.score,
      verdict: qaResult.verdict,
      tags: JSON.stringify(normalizeStringArray(qaResult.riskReasons)),
      summary: qaResult.caseSummary,
      status: "published"
    })
    .onConflict(["tenant_id", "qa_task_id"])
    .merge({
      source: "ai_auto_pass",
      final_owner_type: evidence.finalOwnerType,
      final_owner_id: evidence.finalOwnerId,
      resolved_by_agent_id: evidence.resolvedByAgentId,
      total_score: qaResult.score,
      verdict: qaResult.verdict,
      tags: JSON.stringify(normalizeStringArray(qaResult.riskReasons)),
      summary: qaResult.caseSummary,
      status: "published",
      updated_at: trx.fn.now()
    })
    .returning(["qa_case_review_id"]);

  await trx("qa_segment_reviews")
    .where({ tenant_id: tenantId, qa_case_review_id: review.qa_case_review_id })
    .delete();

  if (qaResult.segmentReviews.length > 0) {
    await trx("qa_segment_reviews").insert(qaResult.segmentReviews.map((segment) => {
      const matched = evidence.segments.find((item) => item.segmentId === segment.segmentId);
      return {
        tenant_id: tenantId,
        qa_case_review_id: review.qa_case_review_id,
        segment_id: segment.segmentId,
        owner_type: segment.ownerType,
        owner_agent_id: matched?.ownerAgentId ?? null,
        owner_ai_agent_id: matched?.ownerAiAgentId ?? null,
        score: segment.score,
        dimension_scores: JSON.stringify(segment.dimensionScores ?? {}),
        tags: JSON.stringify(normalizeStringArray(segment.tags)),
        comment: segment.comment
      };
    }));
  }

  return String(review.qa_case_review_id);
}

async function generateQaAiReview(
  aiSettings: TenantAISettings,
  guideline: {
    guidelineId: string;
    contentMd: string;
    version: number;
  },
  evidence: QaCaseEvidence
): Promise<QaAiReviewRecord> {
  const transcript = evidence.messages.map((message) =>
    `[${message.createdAt}] (${message.segmentId ?? "no-segment"}) ${message.direction}/${message.senderType ?? "unknown"} ${message.senderName ?? ""}: ${message.text}`
  ).join("\n");

  const segmentSummary = evidence.segments.map((segment) => ({
    segmentId: segment.segmentId,
    ownerType: segment.ownerType,
    ownerName: segment.ownerAgentName ?? segment.ownerAiAgentName ?? null,
    startedAt: segment.startedAt,
    endedAt: segment.endedAt,
    messageCount: segment.messageCount,
    transferredFromSegmentId: segment.transferredFromSegmentId
  }));

  const prompt = {
    guidelineVersion: guideline.version,
    guidelineMarkdown: guideline.contentMd,
    case: {
      caseId: evidence.caseId,
      title: evidence.title,
      summary: evidence.summary,
      status: evidence.status,
      channelType: evidence.channelType,
      customerTier: evidence.customerTier,
      finalOwnerType: evidence.finalOwnerType,
      finalOwnerName: evidence.finalOwnerName,
      resolvedByAgentName: evidence.resolvedByAgentName,
      hasSlaBreach: evidence.hasSlaBreach,
      reassignCount: evidence.reassignCount
    },
    segments: segmentSummary,
    transcript
  };

  const completion = await aiSettings.provider.complete({
    model: aiSettings.model,
    temperature: 0,
    maxTokens: Math.min(QA_RUNTIME_LIMITS.aiMaxTokens, aiSettings.maxTokens),
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content: `你是租户内的QA质检引擎。请依据提供的QA准则、case上下文、segment链路和聊天记录进行评估。返回JSON，不要返回其他文本。
Schema:
{
  "score": 0-100,
  "verdict": "pass|needs_review|fail",
  "confidence": 0-1,
  "riskLevel": "low|medium|high",
  "riskReasons": ["..."],
  "manualReviewRecommended": true,
  "recommendedAction": "auto_pass|risk_review|sample_review",
  "caseSummary": "...",
  "evidence": [{"messageId": null, "quote": "...", "reason": "..."}],
  "segmentReviews": [{
    "segmentId": "...",
    "ownerType": "human|ai|system",
    "score": 0-100,
    "tags": ["..."],
    "comment": "...",
    "dimensionScores": {"accuracy": 0, "politeness": 0, "resolution": 0}
  }]
}`
      },
      {
        role: "user",
        content: JSON.stringify(prompt)
      }
    ]
  });

  const parsed = parseJsonObject(completion.content);
  const segmentReviews = Array.isArray(parsed.segmentReviews)
    ? parsed.segmentReviews
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          segmentId: typeof item.segmentId === "string" ? item.segmentId : "",
          score: Math.max(0, Math.min(100, Number(item.score ?? 0))),
          ownerType: typeof item.ownerType === "string" ? item.ownerType : "unknown",
          tags: parseJsonStringArray(item.tags),
          comment: typeof item.comment === "string" ? item.comment.trim() : "",
          dimensionScores: parseJsonNumberMap(item.dimensionScores)
        }))
        .filter((item) => item.segmentId)
    : [];

  const evidenceItems = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          messageId: typeof item.messageId === "string" ? item.messageId : null,
          quote: typeof item.quote === "string" ? item.quote.slice(0, QA_RUNTIME_LIMITS.evidenceTextLimit) : "",
          reason: typeof item.reason === "string" ? item.reason.slice(0, QA_RUNTIME_LIMITS.evidenceTextLimit) : ""
        }))
        .filter((item) => item.quote)
    : [];

  return {
    score: Math.max(0, Math.min(100, Number(parsed.score ?? 0))),
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "needs_review",
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    riskLevel: parsed.riskLevel === "high" || parsed.riskLevel === "medium" || parsed.riskLevel === "low"
      ? parsed.riskLevel
      : "medium",
    riskReasons: parseJsonStringArray(parsed.riskReasons),
    manualReviewRecommended: Boolean(parsed.manualReviewRecommended),
    recommendedAction: parsed.recommendedAction === "risk_review" || parsed.recommendedAction === "sample_review"
      ? parsed.recommendedAction
      : "auto_pass",
    caseSummary: typeof parsed.caseSummary === "string" && parsed.caseSummary.trim()
      ? parsed.caseSummary.trim().slice(0, QA_RUNTIME_LIMITS.caseSummaryLimit)
      : `QA review for ${evidence.title}`,
    evidence: evidenceItems,
    segmentReviews
  };
}
