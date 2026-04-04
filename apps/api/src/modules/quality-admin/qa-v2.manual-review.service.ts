import { withTenantTransaction } from "../../infra/db/client.js";
import { normalizeStringArray, parseJsonStringArray } from "../tenant/tenant-admin.shared.js";
import { loadQaCaseEvidence } from "./qa-v2.case-data.js";
import type { QaTaskRow } from "./qa-v2.types.js";

export async function saveQaManualReview(
  tenantId: string,
  caseId: string,
  reviewerIdentityId: string,
  input: {
    action: "confirm" | "modify" | "reject";
    totalScore?: number;
    verdict?: string;
    tags?: string[];
    summary?: string | null;
    segmentReviews?: Array<{
      segmentId: string;
      score: number;
      tags?: string[];
      comment?: string | null;
      dimensionScores?: Record<string, number>;
    }>;
  }
) {
  return withTenantTransaction(tenantId, async (trx) => {
    const task = await trx("qa_review_tasks")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("created_at", "desc")
      .first<QaTaskRow | undefined>();
    if (!task) {
      throw new Error(`QA task not found for case: ${caseId}`);
    }

    const evidence = await loadQaCaseEvidence(trx, tenantId, caseId);
    if (!evidence) {
      throw new Error(`QA case not found: ${caseId}`);
    }

    const latestAiReview = await trx("qa_ai_reviews")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>();

    const [review] = await trx("qa_case_reviews")
      .insert({
        tenant_id: tenantId,
        qa_task_id: task.qa_task_id,
        case_id: caseId,
        reviewer_identity_id: reviewerIdentityId,
        source: input.action === "confirm" ? "human_confirmed" : input.action === "modify" ? "human_modified" : "human_rejected",
        final_owner_type: evidence.finalOwnerType,
        final_owner_id: evidence.finalOwnerId,
        resolved_by_agent_id: evidence.resolvedByAgentId,
        total_score: input.totalScore ?? Number(latestAiReview?.score ?? 0),
        verdict: input.verdict ?? String(latestAiReview?.verdict ?? "needs_review"),
        tags: JSON.stringify(normalizeStringArray(input.tags ?? parseJsonStringArray(latestAiReview?.risk_reasons))),
        summary: input.summary?.trim() || String(latestAiReview?.case_summary ?? ""),
        status: "published"
      })
      .onConflict(["tenant_id", "qa_task_id"])
      .merge({
        reviewer_identity_id: reviewerIdentityId,
        source: input.action === "confirm" ? "human_confirmed" : input.action === "modify" ? "human_modified" : "human_rejected",
        total_score: input.totalScore ?? Number(latestAiReview?.score ?? 0),
        verdict: input.verdict ?? String(latestAiReview?.verdict ?? "needs_review"),
        tags: JSON.stringify(normalizeStringArray(input.tags ?? parseJsonStringArray(latestAiReview?.risk_reasons))),
        summary: input.summary?.trim() || String(latestAiReview?.case_summary ?? ""),
        status: "published",
        updated_at: trx.fn.now()
      })
      .returning(["qa_case_review_id", "total_score", "verdict", "tags", "summary", "status", "updated_at"]);

    await trx("qa_segment_reviews").where({ tenant_id: tenantId, qa_case_review_id: review.qa_case_review_id }).delete();
    const segmentReviews = input.segmentReviews ?? [];
    if (segmentReviews.length > 0) {
      await trx("qa_segment_reviews").insert(segmentReviews.map((item) => ({
        tenant_id: tenantId,
        qa_case_review_id: review.qa_case_review_id,
        segment_id: item.segmentId,
        owner_type: evidence.segments.find((segment) => segment.segmentId === item.segmentId)?.ownerType ?? "unknown",
        owner_agent_id: evidence.segments.find((segment) => segment.segmentId === item.segmentId)?.ownerAgentId ?? null,
        owner_ai_agent_id: evidence.segments.find((segment) => segment.segmentId === item.segmentId)?.ownerAiAgentId ?? null,
        score: item.score,
        dimension_scores: JSON.stringify(item.dimensionScores ?? {}),
        tags: JSON.stringify(normalizeStringArray(item.tags ?? [])),
        comment: item.comment?.trim() || null
      })));
    }

    await trx("qa_review_tasks")
      .where({ tenant_id: tenantId, qa_task_id: task.qa_task_id })
      .update({
        status: input.action === "confirm"
          ? "reviewed_confirmed"
          : input.action === "modify"
            ? "reviewed_modified"
            : "reviewed_rejected",
        updated_at: trx.fn.now()
      });

    return {
      qaTaskId: task.qa_task_id,
      qaCaseReviewId: review.qa_case_review_id,
      status: input.action === "confirm"
        ? "reviewed_confirmed"
        : input.action === "modify"
          ? "reviewed_modified"
          : "reviewed_rejected"
    };
  });
}
