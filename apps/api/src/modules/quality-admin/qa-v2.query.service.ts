import { withTenantTransaction } from "../../infra/db/client.js";
import { parseJsonStringArray, toIsoString } from "../tenant/tenant-admin.shared.js";
import { loadQaCaseEvidence } from "./qa-v2.case-data.js";
import { serializeQaAiReview, serializeQaCaseReview } from "./qa-v2.shared.js";
import type { QaTaskRow } from "./qa-v2.types.js";

export async function getQaDashboard(
  tenantId: string,
  input?: {
    dateFrom?: string;
    dateTo?: string;
    agentIds?: string[];
  }
) {
  return withTenantTransaction(tenantId, async (trx) => {
    const dateFrom = input?.dateFrom?.trim() || null;
    const dateTo = input?.dateTo?.trim() || null;
    const agentIds = input?.agentIds?.filter(Boolean) ?? [];

    const [
      countsRow,
      autoPassRow,
      riskRow,
      sampleRow,
      avgScoreRow,
      agentRows,
      diffRows
    ] = await Promise.all([
      trx("qa_review_tasks")
        .join("conversation_cases as cc", function joinCase() {
          this.on("cc.case_id", "=", "qa_review_tasks.case_id").andOn("cc.tenant_id", "=", "qa_review_tasks.tenant_id");
        })
        .where("qa_review_tasks.tenant_id", tenantId)
        .modify((qb) => {
          if (dateFrom) qb.andWhere("qa_review_tasks.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("qa_review_tasks.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("cc.resolved_by_agent_id", agentIds);
        })
        .count<{ cnt: string }>("qa_task_id as cnt")
        .first(),
      trx("qa_review_tasks")
        .join("conversation_cases as cc", function joinCase() {
          this.on("cc.case_id", "=", "qa_review_tasks.case_id").andOn("cc.tenant_id", "=", "qa_review_tasks.tenant_id");
        })
        .where({ "qa_review_tasks.tenant_id": tenantId, "qa_review_tasks.queue_type": "auto_pass" })
        .modify((qb) => {
          if (dateFrom) qb.andWhere("qa_review_tasks.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("qa_review_tasks.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("cc.resolved_by_agent_id", agentIds);
        })
        .count<{ cnt: string }>("qa_task_id as cnt")
        .first(),
      trx("qa_review_tasks")
        .join("conversation_cases as cc", function joinCase() {
          this.on("cc.case_id", "=", "qa_review_tasks.case_id").andOn("cc.tenant_id", "=", "qa_review_tasks.tenant_id");
        })
        .where({ "qa_review_tasks.tenant_id": tenantId, "qa_review_tasks.queue_type": "risk" })
        .modify((qb) => {
          if (dateFrom) qb.andWhere("qa_review_tasks.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("qa_review_tasks.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("cc.resolved_by_agent_id", agentIds);
        })
        .count<{ cnt: string }>("qa_task_id as cnt")
        .first(),
      trx("qa_review_tasks")
        .join("conversation_cases as cc", function joinCase() {
          this.on("cc.case_id", "=", "qa_review_tasks.case_id").andOn("cc.tenant_id", "=", "qa_review_tasks.tenant_id");
        })
        .where({ "qa_review_tasks.tenant_id": tenantId, "qa_review_tasks.queue_type": "sample" })
        .modify((qb) => {
          if (dateFrom) qb.andWhere("qa_review_tasks.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("qa_review_tasks.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("cc.resolved_by_agent_id", agentIds);
        })
        .count<{ cnt: string }>("qa_task_id as cnt")
        .first(),
      trx("qa_case_reviews")
        .where("tenant_id", tenantId)
        .modify((qb) => {
          if (dateFrom) qb.andWhere("created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("resolved_by_agent_id", agentIds);
        })
        .avg<{ avg_score: string | null }>("total_score as avg_score")
        .first(),
      trx("qa_case_reviews as qcr")
        .leftJoin("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "qcr.resolved_by_agent_id").andOn("ap.tenant_id", "=", "qcr.tenant_id");
        })
        .where("qcr.tenant_id", tenantId)
        .whereNotNull("qcr.resolved_by_agent_id")
        .modify((qb) => {
          if (dateFrom) qb.andWhere("qcr.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("qcr.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("qcr.resolved_by_agent_id", agentIds);
        })
        .groupBy("qcr.resolved_by_agent_id", "ap.display_name")
        .select("qcr.resolved_by_agent_id", "ap.display_name")
        .avg<{ resolved_by_agent_id: string; display_name: string | null; avg_score: string | null }[]>("qcr.total_score as avg_score"),
      trx("qa_case_reviews as human")
        .join("qa_ai_reviews as ai", function joinAi() {
          this.on("ai.case_id", "=", "human.case_id").andOn("ai.tenant_id", "=", "human.tenant_id");
        })
        .where("human.tenant_id", tenantId)
        .modify((qb) => {
          if (dateFrom) qb.andWhere("human.created_at", ">=", `${dateFrom}T00:00:00.000Z`);
          if (dateTo) qb.andWhere("human.created_at", "<=", `${dateTo}T23:59:59.999Z`);
          if (agentIds.length > 0) qb.whereIn("human.resolved_by_agent_id", agentIds);
        })
        .select("human.case_id", "human.total_score as human_score", "ai.score as ai_score")
    ]);

    const total = Number(countsRow?.cnt ?? 0);
    const autoPassed = Number(autoPassRow?.cnt ?? 0);
    const riskCases = Number(riskRow?.cnt ?? 0);
    const sampleCases = Number(sampleRow?.cnt ?? 0);
    const aiHumanDiff = diffRows.length > 0
      ? Math.round(diffRows.reduce((sum: number, row: any) => sum + Math.abs(Number(row.human_score ?? 0) - Number(row.ai_score ?? 0)), 0) / diffRows.length)
      : 0;

    return {
      todayQaCount: total,
      autoPassRate: total > 0 ? Math.round((autoPassed / total) * 100) : 0,
      riskCaseCount: riskCases,
      sampleCaseCount: sampleCases,
      averageScore: Number(avgScoreRow?.avg_score ?? 0),
      aiVsHumanDiff: aiHumanDiff,
      agentAverages: agentRows.map((row) => ({
        agentId: row.resolved_by_agent_id,
        agentName: row.display_name ?? "Unknown",
        averageScore: Number(row.avg_score ?? 0)
      }))
    };
  });
}

export async function listQaTasks(
  tenantId: string,
  input: {
    queueType?: string;
    status?: string;
    search?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
    agentIds?: string[];
  }
) {
  return withTenantTransaction(tenantId, async (trx) => {
    const latestAiReviewQuery = trx("qa_ai_reviews as air")
      .select(
        trx.raw("distinct on (air.qa_task_id) air.qa_task_id"),
        "air.score",
        "air.confidence",
        "air.risk_level",
        "air.risk_reasons",
        "air.case_summary"
      )
      .where("air.tenant_id", tenantId)
      .orderBy("air.qa_task_id", "asc")
      .orderBy("air.created_at", "desc")
      .as("air_latest");

    const latestHumanReviewQuery = trx("qa_case_reviews as qcr")
      .select(
        trx.raw("distinct on (qcr.qa_task_id) qcr.qa_task_id"),
        "qcr.total_score",
        "qcr.verdict",
        "qcr.status",
        "qcr.updated_at"
      )
      .where("qcr.tenant_id", tenantId)
      .whereIn("qcr.source", ["human_confirmed", "human_modified", "human_rejected"])
      .orderBy("qcr.qa_task_id", "asc")
      .orderBy("qcr.updated_at", "desc")
      .as("human_latest");

    const rows = await trx("qa_review_tasks as qt")
      .join("conversation_cases as cc", function joinCase() {
        this.on("cc.case_id", "=", "qt.case_id").andOn("cc.tenant_id", "=", "qt.tenant_id");
      })
      .join("conversations as c", function joinConversation() {
        this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
      })
      .leftJoin("customers as cu", function joinCustomer() {
        this.on("cu.customer_id", "=", "cc.customer_id").andOn("cu.tenant_id", "=", "cc.tenant_id");
      })
      .leftJoin("agent_profiles as resolved_ap", function joinResolvedAgent() {
        this.on("resolved_ap.agent_id", "=", "cc.resolved_by_agent_id").andOn("resolved_ap.tenant_id", "=", "cc.tenant_id");
      })
      .leftJoin(latestAiReviewQuery, "air_latest.qa_task_id", "qt.qa_task_id")
      .leftJoin(latestHumanReviewQuery, "human_latest.qa_task_id", "qt.qa_task_id")
      .where("qt.tenant_id", tenantId)
      .modify((qb) => {
        if (input.queueType?.trim()) qb.andWhere("qt.queue_type", input.queueType.trim());
        if (input.status?.trim()) qb.andWhere("qt.status", input.status.trim());
        if (input.dateFrom?.trim()) qb.andWhere("qt.created_at", ">=", `${input.dateFrom.trim()}T00:00:00.000Z`);
        if (input.dateTo?.trim()) qb.andWhere("qt.created_at", "<=", `${input.dateTo.trim()}T23:59:59.999Z`);
        if ((input.agentIds?.length ?? 0) > 0) qb.whereIn("cc.resolved_by_agent_id", input.agentIds!);
        if (input.search?.trim()) {
          const like = `%${input.search.trim()}%`;
          qb.andWhere((scope) => {
            scope
              .whereILike("cc.title", like)
              .orWhereILike("cu.display_name", like)
              .orWhereILike("cu.external_ref", like)
              .orWhereILike("cc.case_id", like)
              .orWhereILike("c.conversation_id", like);
          });
        }
      })
      .select(
        "qt.qa_task_id",
        "qt.source",
        "qt.review_mode",
        "qt.queue_type",
        "qt.status",
        "qt.ai_status",
        "qt.risk_level",
        "qt.risk_reasons",
        "qt.confidence",
        "qt.recommended_action",
        "qt.created_at",
        "cc.case_id",
        "cc.title",
        "cc.status as case_status",
        "cc.final_owner_type",
        "cc.final_owner_id",
        "cc.resolved_by_agent_id",
        "c.conversation_id",
        "c.channel_type",
        "cu.display_name as customer_name",
        "cu.external_ref as customer_ref",
        "resolved_ap.display_name as resolved_agent_name",
        "air_latest.score as ai_score",
        "air_latest.confidence as ai_confidence",
        "air_latest.risk_level as ai_risk_level",
        "air_latest.risk_reasons as ai_risk_reasons",
        "air_latest.case_summary as ai_case_summary",
        "human_latest.total_score as human_score",
        "human_latest.verdict as human_verdict",
        "human_latest.status as human_status",
        "human_latest.updated_at as human_updated_at"
      )
      .orderBy("qt.created_at", "desc")
      .limit(Math.min(200, Math.max(20, Number(input.limit ?? 50))));

    const caseIds = rows.map((row: any) => String(row.case_id));
    const segmentRows = caseIds.length > 0
      ? await trx("conversation_segments")
          .where("tenant_id", tenantId)
          .whereIn("case_id", caseIds)
          .groupBy("case_id")
          .select("case_id")
          .count<{ case_id: string; cnt: string }[]>("segment_id as cnt")
          .select(
            trx.raw("sum(case when owner_type = 'human' then 1 else 0 end) as human_cnt"),
            trx.raw("sum(case when owner_type = 'ai' then 1 else 0 end) as ai_cnt")
          )
      : [];
    const segmentMap = new Map(segmentRows.map((row: any) => [String(row.case_id), row]));

    return rows.map((row: any) => {
      const segmentMeta = segmentMap.get(String(row.case_id));
      return {
        qaTaskId: row.qa_task_id,
        source: row.source,
        reviewMode: row.review_mode,
        queueType: row.queue_type,
        status: row.status,
        aiStatus: row.ai_status,
        riskLevel: row.risk_level ?? row.ai_risk_level ?? null,
        riskReasons: parseJsonStringArray(row.risk_reasons).length > 0
          ? parseJsonStringArray(row.risk_reasons)
          : parseJsonStringArray(row.ai_risk_reasons),
        confidence: row.confidence !== null ? Number(row.confidence) : row.ai_confidence !== null ? Number(row.ai_confidence) : null,
        recommendedAction: row.recommended_action,
        createdAt: toIsoString(row.created_at),
        caseId: row.case_id,
        caseTitle: row.title,
        caseStatus: row.case_status,
        conversationId: row.conversation_id,
        channelType: row.channel_type,
        customerName: row.customer_name,
        customerRef: row.customer_ref,
        resolvedByAgentId: row.resolved_by_agent_id,
        resolvedByAgentName: row.resolved_agent_name,
        aiScore: row.ai_score !== null ? Number(row.ai_score) : null,
        aiCaseSummary: row.ai_case_summary ?? null,
        humanScore: row.human_score !== null ? Number(row.human_score) : null,
        humanVerdict: row.human_verdict ?? null,
        humanStatus: row.human_status ?? null,
        humanUpdatedAt: row.human_updated_at ? toIsoString(row.human_updated_at) : null,
        scoreDiff: row.human_score !== null && row.ai_score !== null ? Math.abs(Number(row.human_score) - Number(row.ai_score)) : null,
        segmentCount: Number(segmentMeta?.cnt ?? 0),
        hasHumanSegments: Number(segmentMeta?.human_cnt ?? 0) > 0,
        hasAiSegments: Number(segmentMeta?.ai_cnt ?? 0) > 0
      };
    });
  });
}

export async function getQaCaseDetail(tenantId: string, caseId: string) {
  return withTenantTransaction(tenantId, async (trx) => {
    const evidence = await loadQaCaseEvidence(trx, tenantId, caseId);
    if (!evidence) return null;

    const latestTask = await trx("qa_review_tasks")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>();

    const latestAiReview = await trx("qa_ai_reviews")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>();

    const latestCaseReview = await trx("qa_case_reviews")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("updated_at", "desc")
      .first<Record<string, unknown> | undefined>();

    return {
      case: {
        caseId: evidence.caseId,
        conversationId: evidence.conversationId,
        customerId: evidence.customerId,
        customerName: evidence.customerName,
        customerRef: evidence.customerRef,
        customerTier: evidence.customerTier,
        channelType: evidence.channelType,
        title: evidence.title,
        summary: evidence.summary,
        status: evidence.status,
        openedAt: evidence.openedAt,
        resolvedAt: evidence.resolvedAt,
        closedAt: evidence.closedAt,
        lastActivityAt: evidence.lastActivityAt,
        finalOwnerType: evidence.finalOwnerType,
        finalOwnerId: evidence.finalOwnerId,
        finalOwnerName: evidence.finalOwnerName,
        resolvedByAgentId: evidence.resolvedByAgentId,
        resolvedByAgentName: evidence.resolvedByAgentName,
        segmentCount: evidence.segmentCount,
        hasHumanSegments: evidence.hasHumanSegments,
        hasAiSegments: evidence.hasAiSegments,
        reassignCount: evidence.reassignCount,
        hasSlaBreach: evidence.hasSlaBreach
      },
      messages: evidence.messages,
      segments: evidence.segments,
      task: latestTask ? {
        qaTaskId: String(latestTask.qa_task_id),
        queueType: typeof latestTask.queue_type === "string" ? latestTask.queue_type : null,
        status: typeof latestTask.status === "string" ? latestTask.status : null,
        aiStatus: typeof latestTask.ai_status === "string" ? latestTask.ai_status : null,
        reviewMode: typeof latestTask.review_mode === "string" ? latestTask.review_mode : null,
        confidence: latestTask.confidence !== null && latestTask.confidence !== undefined ? Number(latestTask.confidence) : null,
        recommendedAction: typeof latestTask.recommended_action === "string" ? latestTask.recommended_action : null,
        riskLevel: typeof latestTask.risk_level === "string" ? latestTask.risk_level : null,
        riskReasons: parseJsonStringArray(latestTask.risk_reasons),
        enteredBy: [
          typeof latestTask.queue_type === "string" ? `queue:${latestTask.queue_type}` : null,
          latestTask.confidence !== null && latestTask.confidence !== undefined ? `confidence:${Number(latestTask.confidence).toFixed(2)}` : null,
          typeof latestTask.recommended_action === "string" ? `action:${latestTask.recommended_action}` : null,
          typeof latestTask.risk_level === "string" ? `risk_level:${latestTask.risk_level}` : null,
          ...parseJsonStringArray(latestTask.risk_reasons).map((item) => `rule:${item}`)
        ].filter((item): item is string => Boolean(item))
      } : null,
      aiReview: latestAiReview ? serializeQaAiReview(latestAiReview) : null,
      caseReview: latestCaseReview ? serializeQaCaseReview(latestCaseReview) : null
    };
  });
}

export async function getQaReviewTaskByCaseId(
  tenantId: string,
  caseId: string
) {
  return withTenantTransaction(tenantId, async (trx) =>
    trx("qa_review_tasks")
      .where({ tenant_id: tenantId, case_id: caseId })
      .orderBy("created_at", "desc")
      .first<QaTaskRow | undefined>()
  );
}
