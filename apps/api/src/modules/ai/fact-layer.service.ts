/**
 * Fact Layer Service
 *
 * 公共事实层 — 为 orchestrator、copilot、skills/assist 三条链提供统一的事实源。
 *
 * 事实优先级（从高到低）：
 * 1. verified facts — 来自最新 capability script 执行结果
 * 2. task facts     — 来自当前 case 的手工任务状态
 * 3. state facts    — 来自 customer_memory_states 活跃状态
 *
 * 仅来自以下源的数据被视为 verified fact：
 * - capability script result（skill_invocations.result）
 * - 工单/订单/物流/CRM 等系统返回
 * - 人工确认操作（座席修改 case_task 状态）
 *
 * 不包括：模型猜测、意图推断、画像总结
 */

import type { Knex } from "knex";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** 从 skill 执行结果提取的已验证事实 */
export interface VerifiedFact {
  skillName: string;
  invokedAt: string;
  args: Record<string, unknown>;
  /** 完整的脚本输出（去掉 customerReply） */
  result: Record<string, unknown>;
  /** 从 result 中提取的结构化摘要 */
  summary: string;
  /** 从 result 中提取的关键业务字段（tracking/status/time/location/description） */
  keyFacts: KeyFacts | null;
}

/** Key business fields extracted from skill results (industry-agnostic) */
export interface KeyFacts {
  /** Primary reference identifier (order ID, ticket number, tracking number, booking ref, etc.) */
  referenceId: string | null;
  /** Current status of the referenced entity */
  status: string | null;
  /** Most recent timestamp associated with the entity */
  time: string | null;
  /** Relevant location or context (address, branch, department, etc.) */
  location: string | null;
  /** Human-readable description or summary */
  description: string | null;
  /**
   * @deprecated Use referenceId instead. Kept for backward compatibility
   * with existing skill scripts that extract tracking numbers.
   */
  trackingNumber: string | null;
}

/** 从 case_tasks 提取的任务事实 */
export interface TaskFact {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  ownerName: string | null;
  creatorType: string;
  sourceMessagePreview: string | null;
  dueAt: string | null;
  createdAt: string;
}

/** 从 customer_memory_states 提取的活跃状态事实 */
export interface StateFact {
  stateType: string;
  summary: string | null;
  payload: Record<string, unknown>;
  updatedAt: string;
}

/** 从 case_task_events 提取的任务变更事实 */
export interface TaskEventFact {
  taskId: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  createdAt: string;
}

/** 完整快照 — 三条链共享的事实上下文 */
export interface FactSnapshot {
  /** 最新已验证的技能执行事实（按 invoked_at DESC 排序） */
  verifiedFacts: VerifiedFact[];
  /** 当前 case 的手工任务状态 */
  taskFacts: TaskFact[];
  /** 最近的任务变更事件 */
  taskEventFacts: TaskEventFact[];
  /** 客户活跃状态 */
  stateFacts: StateFact[];
  /** 快照生成时间 */
  snapshotAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal row types
// ─────────────────────────────────────────────────────────────────────────────

type SkillInvocationRow = {
  skill_name: string;
  args: unknown;
  result: unknown;
  invoked_at: string | Date;
};

type CaseTaskRow = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  owner_name: string | null;
  creator_type: string;
  source_message_preview: string | null;
  due_at: string | Date | null;
  created_at: string | Date;
};

type MemoryStateRow = {
  state_type: string;
  summary: string | null;
  state_payload: unknown;
  updated_at: string | Date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 构建完整 FactSnapshot — 从 skill_invocations + case_tasks + customer_memory_states 聚合。
 *
 * @param db            Knex 连接或事务
 * @param tenantId      租户 ID
 * @param conversationId 会话 ID
 * @param customerId    客户 ID（可选，仅用于 stateFacts）
 */
export async function buildFactSnapshot(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    customerId?: string | null;
  },
): Promise<FactSnapshot> {
  const { tenantId, conversationId, customerId } = input;

  // 并行查询四个数据源
  const [invocationRows, taskRows, stateRows, taskEventRows] = await Promise.all([
    fetchRecentInvocations(db, tenantId, conversationId),
    fetchCaseTasks(db, tenantId, conversationId),
    customerId ? fetchActiveStates(db, tenantId, customerId) : Promise.resolve([]),
    fetchRecentTaskEvents(db, tenantId, conversationId),
  ]);

  return {
    verifiedFacts: invocationRows.map(mapInvocationToFact),
    taskFacts: taskRows.map(mapTaskRowToFact),
    taskEventFacts: taskEventRows,
    stateFacts: stateRows.map(mapStateRowToFact),
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * 从单个 tool 执行结果创建一条 VerifiedFact — 用于 orchestrator 每轮回填后即时更新。
 *
 * 不做 DB 查询，直接从内存中的执行结果构建。
 */
export function buildVerifiedFactFromToolResult(
  skillName: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  invokedAt?: string,
): VerifiedFact {
  return {
    skillName,
    invokedAt: invokedAt ?? new Date().toISOString(),
    args,
    result,
    summary: summarizeSkillResult(result),
    keyFacts: extractKeyFacts(result, args),
  };
}

/**
 * 将 FactSnapshot 格式化为 LLM system prompt 中的上下文段落。
 *
 * 输出格式：
 * ```
 * [Verified Facts — ground truth, overrides memory/profile]
 * 1. skill: xxx | invoked: xxx | facts: {...}
 *
 * [Active Tasks]
 * - title (status) — owner / creator
 *
 * [Customer Active States]
 * - stateType: summary
 * ```
 */
export function formatFactSnapshotForPrompt(snapshot: FactSnapshot): string | null {
  const sections: string[] = [];

  // ── Verified Facts ──
  if (snapshot.verifiedFacts.length > 0) {
    const lines = snapshot.verifiedFacts.map((f, i) => {
      const parts = [
        `${i + 1}. skill: ${f.skillName}`,
        `invoked: ${f.invokedAt}`,
      ];
      if (f.summary) parts.push(`summary: ${f.summary}`);
      if (f.keyFacts) parts.push(`facts: ${JSON.stringify(f.keyFacts)}`);
      return parts.join(" | ");
    });
    sections.push(
      `[Verified Facts — ground truth, overrides older memory/profile]\n${lines.join("\n")}`,
    );
  }

  // ── Task Facts ──
  if (snapshot.taskFacts.length > 0) {
    const lines = snapshot.taskFacts.map((t) => {
      const parts = [`- ${t.title} (${t.status})`];
      if (t.ownerName) parts.push(`assigned: ${t.ownerName}`);
      if (t.creatorType === "ai") parts.push("[AI created]");
      if (t.dueAt) parts.push(`due: ${t.dueAt}`);
      return parts.join(" — ");
    });
    sections.push(
      `[Active Tasks in current case]\n${lines.join("\n")}`,
    );
  }

  // ── Task Events ──
  if (snapshot.taskEventFacts.length > 0) {
    const lines = snapshot.taskEventFacts.map((e) => {
      const parts = [`- ${e.eventType}`];
      if (e.fromValue) parts.push(`from: ${e.fromValue}`);
      if (e.toValue) parts.push(`to: ${e.toValue}`);
      parts.push(`by: ${e.actorType}`);
      parts.push(`at: ${e.createdAt}`);
      return parts.join(" | ");
    });
    sections.push(
      `[Recent Task Changes (last 2h)]\n${lines.join("\n")}`,
    );
  }

  // ── State Facts ──
  if (snapshot.stateFacts.length > 0) {
    const lines = snapshot.stateFacts.map((s) => {
      const payload = Object.entries(s.payload)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");
      return `- ${s.stateType}: ${s.summary ?? (payload || "(active)")}`;
    });
    sections.push(
      `[Customer Active States]\n${lines.join("\n")}`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB queries
// ─────────────────────────────────────────────────────────────────────────────

async function fetchRecentInvocations(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
): Promise<SkillInvocationRow[]> {
  return db("skill_invocations")
    .select("skill_name", "args", "result", "invoked_at")
    .where({ tenant_id: tenantId, conversation_id: conversationId } as Record<string, unknown>)
    .andWhere("decision", "allowed")
    .andWhere("invoked_at", ">=", db.raw("now() - interval '30 minutes'"))
    .orderBy("invoked_at", "desc")
    .limit(5);
}

async function fetchCaseTasks(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
): Promise<CaseTaskRow[]> {
  // 先拿到当前 case_id
  const conv = await db("conversations")
    .select("current_case_id")
    .where({ conversation_id: conversationId, tenant_id: tenantId } as Record<string, unknown>)
    .first() as { current_case_id: string | null } | undefined;

  if (!conv?.current_case_id) return [];

  return db("case_tasks as ct")
    .select(
      "ct.task_id",
      "ct.title",
      "ct.status",
      "ct.priority",
      "ct.creator_type",
      "ct.due_at",
      "ct.created_at",
      db.raw("left(m.content->>'text', 80) as source_message_preview"),
      db.raw("coalesce(tm.display_name, ap.display_name) as owner_name"),
    )
    .leftJoin("messages as m", "m.message_id", "ct.source_message_id")
    .leftJoin("agent_profiles as ap", "ap.agent_id", "ct.owner_agent_id")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
    .where("ct.tenant_id", tenantId)
    .where("ct.case_id", conv.current_case_id)
    .whereIn("ct.status", ["open", "in_progress"])
    .orderBy("ct.created_at", "desc")
    .limit(10);
}

async function fetchRecentTaskEvents(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
): Promise<TaskEventFact[]> {
  // Get case_id first
  const conv = await db("conversations")
    .select("current_case_id")
    .where({ conversation_id: conversationId, tenant_id: tenantId } as Record<string, unknown>)
    .first() as { current_case_id: string | null } | undefined;

  if (!conv?.current_case_id) return [];

  const rows = await db("case_task_events as cte")
    .join("case_tasks as ct", "ct.task_id", "cte.task_id")
    .where("cte.tenant_id", tenantId)
    .where("ct.case_id", conv.current_case_id)
    .andWhere("cte.created_at", ">=", db.raw("now() - interval '2 hours'"))
    .orderBy("cte.created_at", "desc")
    .limit(10)
    .select(
      "cte.task_id",
      "cte.event_type",
      "cte.from_value",
      "cte.to_value",
      "cte.actor_type",
      "cte.created_at"
    );

  return rows.map((r) => ({
    taskId: r.task_id,
    eventType: r.event_type,
    fromValue: r.from_value,
    toValue: r.to_value,
    actorType: r.actor_type,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

async function fetchActiveStates(
  db: Knex | Knex.Transaction,
  tenantId: string,
  customerId: string,
): Promise<MemoryStateRow[]> {
  return db("customer_memory_states")
    .select("state_type", "summary", "state_payload", "updated_at")
    .where({ tenant_id: tenantId, customer_id: customerId, status: "active" } as Record<string, unknown>)
    .orderBy("updated_at", "desc")
    .limit(5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → Fact mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapInvocationToFact(row: SkillInvocationRow): VerifiedFact {
  const args = parseObject(row.args);
  const result = parseObject(row.result);
  return {
    skillName: row.skill_name,
    invokedAt: toISOString(row.invoked_at),
    args,
    result,
    summary: summarizeSkillResult(result),
    keyFacts: extractKeyFacts(result, args),
  };
}

function mapTaskRowToFact(row: CaseTaskRow): TaskFact {
  return {
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    ownerName: row.owner_name ?? null,
    creatorType: row.creator_type,
    sourceMessagePreview: row.source_message_preview ?? null,
    dueAt: row.due_at ? toISOString(row.due_at) : null,
    createdAt: toISOString(row.created_at),
  };
}

function mapStateRowToFact(row: MemoryStateRow): StateFact {
  return {
    stateType: row.state_type,
    summary: row.summary ?? null,
    payload: parseObject(row.state_payload),
    updatedAt: toISOString(row.updated_at),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fact-extraction helpers
// (Extracted from copilot.service.ts — now shared across all chains)
// ─────────────────────────────────────────────────────────────────────────────

/** 安全解析 object — 支持 JSONB raw string 和 object */
export function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** 从 skill result 中生成简洁的 KV 摘要 */
export function summarizeSkillResult(result: Record<string, unknown>): string {
  const data = parseObject(result.data);
  const response = parseObject(result.response);
  const topLevel = Object.fromEntries(
    Object.entries(result).filter(([key, value]) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      ![
        "code", "msg", "data", "response", "timeline", "details", "records",
        "events", "tracks", "history", "items", "raw_response_code", "raw_response_msg",
        "scriptKey", "scriptName", "runtime", "stderr", "_async", "customerReply"
      ].includes(key)
    )
  );
  const source = Object.keys(response).length > 0
    ? response
    : Object.keys(data).length > 0
      ? data
      : topLevel;
  if (Object.keys(source).length === 0) return "";
  return Object.entries(source)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !["code", "msg", "data"].includes(key),
    )
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${formatSummaryValue(value)}`)
    .join("; ");
}

/**
 * 从 skill result 中提取关键业务字段（行业无关）。
 * 通过通用字段名模式匹配，不假设特定行业的数据结构。
 */
export function extractKeyFacts(
  result: Record<string, unknown>,
  args: Record<string, unknown>,
): KeyFacts | null {
  const latestObject = extractLatestBusinessObject(result);

  // Extract the primary reference identifier from args or result
  const referenceId = firstNonEmptyString(
    // Common arg patterns for reference IDs
    args.id, args.orderId, args.order_id,
    args.ticketId, args.ticket_id,
    args.bookingId, args.booking_id,
    args.billCodes, args.trackingNumber, args.tracking_number,
    args.waybillNumber, args.waybill_number,
    args.referenceId, args.reference_id, args.ref,
    // Common result patterns
    result.id, result.reference_id, result.referenceId,
    result.tracking_no, result.trackingNumber, result.tracking_number,
    result.order_id, result.orderId,
  );

  return {
    referenceId,
    trackingNumber: referenceId, // backward compat alias
    status: firstNonEmptyString(
      result.latest_status,
      result.status,
      latestObject ? findRecordValue(latestObject, [/^status$/i, /状态/]) : null
    ),
    time: firstNonEmptyString(
      result.latest_time,
      result.time, result.updated_at, result.updatedAt,
      latestObject ? findRecordValue(latestObject, [/^time$/i, /时间/, /date/i, /updated/i]) : null
    ),
    location: firstNonEmptyString(
      latestObject ? findRecordValue(latestObject, [
        /location/i, /address/i, /branch/i, /outlet/i,
        /department/i, /地[址点]/, /网点/,
      ]) : null,
      result.latest_location,
      result.location, result.address
    ),
    description: firstNonEmptyString(
      result.latest_description,
      latestObject ? findRecordValue(latestObject, [
        /description/i, /说明/, /remark/i, /detail/i, /note/i, /summary/i,
      ]) : null
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractLatestBusinessObject(
  result: Record<string, unknown>,
): Record<string, unknown> | null {
  const data = parseObject(result.data);
  const response = parseObject(result.response);
  const source = Object.keys(response).length > 0 ? response : data;
  for (const key of [
    "timeline",
    "details",
    "records",
    "events",
    "tracks",
    "history",
    "items",
  ]) {
    const value = source[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const latest = pickMostRecentObjectRecord(value);
    if (latest) return latest as Record<string, unknown>;
  }
  return null;
}

function findRecordValue(
  record: Record<string, unknown>,
  patterns: RegExp[],
): string | null {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue;
    if (patterns.some((p) => p.test(key))) return String(value);
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatSummaryValue(value: unknown): string {
  if (Array.isArray(value)) {
    const latestObject = pickMostRecentObjectRecord(value);
    if (latestObject) return summarizeObjectRecord(latestObject);
    return `${value.length} items`;
  }
  if (value && typeof value === "object")
    return summarizeObjectRecord(value as Record<string, unknown>);
  return String(value);
}

function summarizeObjectRecord(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 5)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join("; ");
}

function pickMostRecentObjectRecord(
  value: unknown[],
): Record<string, unknown> | null {
  const records = value.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  ) as Record<string, unknown>[];
  if (records.length === 0) return null;

  let best: Record<string, unknown> | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const score = extractTemporalScore(record);
    if (score > bestScore) {
      best = record;
      bestScore = score;
    }
  }
  return best ?? records[0] ?? null;
}

function extractTemporalScore(record: Record<string, unknown>): number {
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(record)) {
    if (!/(time|date|updated|created|timestamp|ts|scan)/i.test(key)) continue;
    const score = parseDateScore(value);
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

function parseDateScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const normalized = value.trim().replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function toISOString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}
