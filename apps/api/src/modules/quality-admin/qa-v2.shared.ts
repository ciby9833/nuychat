import {
  parseJsonObject,
  parseJsonStringArray,
  toIsoString
} from "../tenant/tenant-admin.shared.js";

export const DEFAULT_GUIDELINE = `# QA准则

## 总则
- 以是否解决客户问题为第一优先
- 以礼貌、准确、清晰、合规作为核心评估维度
- 对转接场景，重点判断转接是否及时、是否合理、是否造成客户重复说明

## 评分维度
### 1. 解决度
- 是否真正回答客户问题
- 是否给出明确下一步
- 是否存在“未解决但直接结束”

### 2. 礼貌性
- 语气是否礼貌、尊重
- 是否存在生硬、推诿、冒犯

### 3. 准确性
- 信息是否正确
- 是否存在误导、含糊、答非所问

### 4. 合规性
- 是否违反业务边界或承诺超范围内容
- 是否存在不当收集、敏感承诺、跳过流程

### 5. 及时性
- 响应是否明显拖延
- 转接是否及时、是否导致客户重复说明

## 通过标准
- 已明确解决问题，且表达礼貌、准确、无明显遗漏
- 若发生转接，转接过程合理，没有造成显著体验损失

## 风险标准
- 未解决客户问题却结束会话
- 回复明显错误、含糊、误导或不合规
- 多次转接且没有清晰推进
- 明显态度问题、推诿、机械应答

## 输出要求
- 先判断整体case是否通过
- 再对每个segment给出责任评分
- 只引用与结论直接相关的关键证据
- 输出时重点围绕：解决度、礼貌性、准确性、合规性、及时性
`;

export const QA_RUNTIME_LIMITS = {
  sampleModulo: 10,
  caseMessageLimit: 500,
  aiMaxTokens: 3000,
  evidenceTextLimit: 240,
  caseSummaryLimit: 1500
} as const;

export function extractMessageText(content: unknown) {
  const parsed = parseJsonObject(content);
  if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text.trim();
  const structured = parseJsonObject(parsed.structured);
  if (Array.isArray(structured.blocks)) {
    const texts = structured.blocks
      .map((block) => {
        if (!block || typeof block !== "object" || Array.isArray(block)) return "";
        const record = block as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (Array.isArray(record.items)) {
          return record.items.map((item) => String(item)).join(" | ");
        }
        return "";
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

export function serializeQaAiReview(row: Record<string, unknown>) {
  return {
    qaAiReviewId: row.qa_ai_review_id,
    score: Number(row.score ?? 0),
    verdict: row.verdict,
    confidence: Number(row.confidence ?? 0),
    riskLevel: row.risk_level,
    riskReasons: parseJsonStringArray(row.risk_reasons),
    manualReviewRecommended: Boolean(row.manual_review_recommended),
    caseSummary: row.case_summary,
    segmentReviews: Array.isArray(row.segment_reviews_json)
      ? row.segment_reviews_json
      : parseJsonObject(row.segment_reviews_json),
    evidence: Array.isArray(row.evidence_json)
      ? row.evidence_json
      : parseJsonObject(row.evidence_json),
    status: row.status,
    createdAt: row.created_at ? toIsoString(row.created_at) : null
  };
}

export function serializeQaCaseReview(row: Record<string, unknown>) {
  return {
    qaCaseReviewId: row.qa_case_review_id,
    totalScore: Number(row.total_score ?? 0),
    verdict: row.verdict,
    tags: parseJsonStringArray(row.tags),
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at ? toIsoString(row.created_at) : null,
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : null
  };
}
