/**
 * Analytics Service — event tracking + daily report generation via ClickHouse.
 *
 * All writes are fire-and-forget (async_insert) so they never slow the hot path.
 * All functions silently no-op when ClickHouse is unavailable.
 */

import { getClickhouseClient } from "../../infra/clickhouse/client.js";

// ─── Event types ──────────────────────────────────────────────────────────────

export type AnalyticsEventType =
  | "conversation_started"
  | "message_received"
  | "message_sent"
  | "skill_executed"
  | "conversation_resolved";

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  tenantId: string;
  conversationId?: string;
  caseId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: inserts a single analytics event into ClickHouse.
 * Returns immediately without waiting for the insert to complete.
 */
export function trackEvent(event: AnalyticsEvent): void {
  void (async () => {
    try {
      const client = await getClickhouseClient();
      if (!client) return;

      await client.insert({
        table: "conversation_events",
        values: [
          {
            tenant_id: event.tenantId,
            conversation_id: event.conversationId ?? "",
            event_type: event.eventType,
            payload: JSON.stringify(
              event.caseId !== undefined
                ? { ...(event.payload ?? {}), caseId: event.caseId }
                : (event.payload ?? {})
            ),
            occurred_at: (event.occurredAt ?? new Date()).toISOString().replace("T", " ").replace("Z", "")
          }
        ],
        format: "JSONEachRow"
      });
    } catch {
      // non-fatal — analytics loss is acceptable
    }
  })();
}

// ─── Daily report ─────────────────────────────────────────────────────────────

export interface DailyReportRow {
  date: string;
  eventType: string;
  count: number;
}

export interface DailyReport {
  tenantId: string;
  date: string;
  events: DailyReportRow[];
  summary: {
    distinctCasesTouched: number;
    conversationsStarted: number;
    messagesReceived: number;
    messagesSent: number;
    skillsExecuted: number;
    conversationsResolved: number;
    totalEvents: number;
  };
}

/**
 * Queries ClickHouse for a daily activity breakdown.
 * Returns an empty report when ClickHouse is unavailable.
 */
export async function getDailyReport(tenantId: string, date: string): Promise<DailyReport> {
  const empty: DailyReport = {
    tenantId,
    date,
    events: [],
    summary: {
      distinctCasesTouched: 0,
      conversationsStarted: 0,
      messagesReceived: 0,
      messagesSent: 0,
      skillsExecuted: 0,
      conversationsResolved: 0,
      totalEvents: 0
    }
  };

  try {
    const client = await getClickhouseClient();
    if (!client) return empty;

    const [result, caseSummaryResult] = await Promise.all([
      client.query({
        query: `
          SELECT
            toDate(occurred_at) AS date,
            event_type          AS eventType,
            count()             AS count
          FROM conversation_events
          WHERE tenant_id = {tenantId:String}
            AND toDate(occurred_at) = {date:Date}
          GROUP BY date, event_type
          ORDER BY event_type
        `,
        query_params: { tenantId, date },
        format: "JSONEachRow"
      }),
      client.query({
        query: `
          SELECT
            uniqExactIf(JSONExtractString(payload, 'caseId'), JSONExtractString(payload, 'caseId') != '') AS distinctCasesTouched
          FROM conversation_events
          WHERE tenant_id = {tenantId:String}
            AND toDate(occurred_at) = {date:Date}
        `,
        query_params: { tenantId, date },
        format: "JSONEachRow"
      })
    ]);

    const rows = (await result.json()) as DailyReportRow[];
    const caseSummaryRows = (await caseSummaryResult.json()) as Array<{
      distinctCasesTouched?: number | string;
    }>;
    const caseSummary = caseSummaryRows[0] ?? {};

    const get = (type: AnalyticsEventType) => rows.find((r) => r.eventType === type)?.count ?? 0;

    return {
      tenantId,
      date,
      events: rows,
      summary: {
        distinctCasesTouched: Number(caseSummary.distinctCasesTouched ?? 0),
        conversationsStarted: Number(get("conversation_started")),
        messagesReceived: Number(get("message_received")),
        messagesSent: Number(get("message_sent")),
        skillsExecuted: Number(get("skill_executed")),
        conversationsResolved: Number(get("conversation_resolved")),
        totalEvents: rows.reduce((s, r) => s + Number(r.count), 0)
      }
    };
  } catch (err) {
    console.warn("[Analytics] getDailyReport failed:", (err as Error).message);
    return empty;
  }
}
