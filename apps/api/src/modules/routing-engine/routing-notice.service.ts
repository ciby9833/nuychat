import type { Knex } from "knex";
import type { AIMessage } from "../../../../../packages/ai-sdk/src/index.js";

import { buildCallContext, trackedComplete } from "../ai/call-context.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage } from "../ai/usage-meter.service.js";
import { EXPLICIT_AI_OPT_IN_COMMAND } from "../service-mode/service-mode.constants.js";

type RoutingNoticeScenario = "human_assigned" | "human_queue" | "fallback_ai";

type QueueAssignmentRow = {
  assignment_strategy: string | null;
  department_id: string | null;
  team_id: string | null;
  assigned_agent_id: string | null;
  assigned_ai_agent_id: string | null;
  human_progress: "none" | "assigned_waiting" | "queued_waiting" | "human_active" | "unavailable_fallback_ai";
  queue_position: number | null;
  estimated_wait_sec: number | null;
  service_request_mode: "normal" | "human_requested" | "ai_opt_in";
  queue_mode: "none" | "assigned_waiting" | "pending_unavailable";
  ai_fallback_allowed: boolean | null;
};

type ConversationRow = {
  updated_at: string | Date | null;
  channel_id: string | null;
  channel_type: string | null;
};

type CustomerRow = {
  language: string | null;
};

type AgentRow = {
  display_name: string | null;
};

type LastCustomerMessageRow = {
  content: { text?: string | null } | null;
  created_at: string | Date | null;
};

const NOTICE_SYSTEM_PROMPT = `You write short customer-facing service-routing notices for support conversations.

Return JSON only:
{"text":"..."}

Rules:
- Use the customer's latest language when possible.
- Be concise, clear, and natural.
- Only use the facts provided below. Do not invent availability, times, or queue data.
- If a human agent has been assigned, clearly say the transfer succeeded and mention the agent name when provided.
- If the customer is waiting in a human queue, mention the queue position and estimated wait when provided.
- If no human is currently serviceable and AI fallback is active, explain that no human is available right now and mention the next schedule summary only if provided.
- When the facts include a switchBackCommand for a queue or fallback scenario, mention that exact command as the explicit way to continue with AI now.
- Do not mention internal field names or system implementation details.`;

export class RoutingNoticeService {
  async buildNotice(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      scenario: RoutingNoticeScenario;
      aiAgentName?: string | null;
    }
  ): Promise<{ text: string; aiAgentName: string } | null> {
    const settings = await resolveTenantAISettingsForScene(db, input.tenantId, "ai_seat");
    if (!settings) return null;

    const budgetGate = await assertTenantAIBudgetAllowsUsage(db, input.tenantId);
    if (!budgetGate.allowed) return null;

    const [assignment, conversation, customer] = await Promise.all([
      db("queue_assignments")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .select(
          "assignment_strategy",
          "department_id",
          "team_id",
          "assigned_agent_id",
          "assigned_ai_agent_id",
          "human_progress",
          "queue_position",
          "estimated_wait_sec",
          "service_request_mode",
          "queue_mode",
          "ai_fallback_allowed"
        )
        .first<QueueAssignmentRow | undefined>(),
      db("conversations")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .select("updated_at", "channel_id", "channel_type", "customer_id")
        .first<(ConversationRow & { customer_id: string | null }) | undefined>(),
      db("conversations as c")
        .join("customers as cu", function joinCustomers() {
          this.on("cu.customer_id", "=", "c.customer_id").andOn("cu.tenant_id", "=", "c.tenant_id");
        })
        .where({ "c.tenant_id": input.tenantId, "c.conversation_id": input.conversationId })
        .select("cu.language")
        .first<CustomerRow | undefined>()
    ]);

    if (!assignment || !conversation) return null;

    const lastCustomerMessage = await db("messages")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        direction: "inbound",
        sender_type: "customer"
      })
      .whereNotNull("content")
      .select("content", "created_at")
      .orderBy("created_at", "desc")
      .first<LastCustomerMessageRow | undefined>();

    const assignedAgent = assignment.assigned_agent_id
      ? await db("agent_profiles")
          .where({ tenant_id: input.tenantId, agent_id: assignment.assigned_agent_id })
          .select("display_name")
          .first<AgentRow | undefined>()
      : null;

    const availability = await resolveScopedHumanAvailability(db, {
      tenantId: input.tenantId,
      departmentId: assignment.department_id,
      teamId: assignment.team_id
    });

    const nextSchedules = await loadUpcomingScheduleFacts(db, {
      tenantId: input.tenantId,
      departmentId: assignment.department_id,
      teamId: assignment.team_id
    });

    const facts = {
      scenario: input.scenario,
      customerLanguage: customer?.language ?? null,
      latestCustomerMessage: lastCustomerMessage?.content?.text ?? null,
      assignedAgentName: assignedAgent?.display_name ?? null,
      queuePosition: assignment.queue_position ?? null,
      estimatedWaitSec: assignment.estimated_wait_sec ?? null,
      serviceRequestMode: assignment.service_request_mode,
      humanProgress: assignment.human_progress,
      queueMode: assignment.queue_mode,
      aiFallbackAllowed: Boolean(assignment.ai_fallback_allowed),
      humanAvailability: availability,
      nextScheduleSummary: nextSchedules.summary,
      nextScheduleItems: nextSchedules.items,
      switchBackCommand:
        input.scenario === "human_queue" || input.scenario === "fallback_ai"
          ? EXPLICIT_AI_OPT_IN_COMMAND
          : null
    };

    const dedupeState = buildDedupeState({
      scenario: input.scenario,
      assignedAgentId: assignment.assigned_agent_id,
      queueMode: assignment.queue_mode,
      queuePosition: assignment.queue_position,
      estimatedWaitSec: assignment.estimated_wait_sec,
      aiFallbackAllowed: Boolean(assignment.ai_fallback_allowed)
    });
    const alreadySent = await hasMatchingRecentNotice(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      state: dedupeState
    });
    if (alreadySent) return null;

    const ctx = buildCallContext(
      db,
      settings,
      { tenantId: input.tenantId, conversationId: input.conversationId },
      "routing_notice"
    );

    try {
      const completion = await trackedComplete(
        ctx,
        {
          messages: buildPromptMessages(facts),
          responseFormat: "json_object",
          temperature: 0.2,
          maxTokens: Math.min(220, settings.maxTokens)
        },
        { conversationId: input.conversationId, scenario: input.scenario }
      );

      const parsed = safeParseJson(completion.content);
      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (!text) return null;
      await db("conversation_events").insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        event_type: "routing_notice_sent",
        actor_type: "system",
        payload: {
          scenario: input.scenario,
          state: dedupeState
        }
      });
      return {
        text,
        aiAgentName: input.aiAgentName?.trim() || "AI"
      };
    } catch {
      return null;
    }
  }
}

function buildPromptMessages(facts: Record<string, unknown>): AIMessage[] {
  return [
    { role: "system", content: NOTICE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Write one routing notice for the customer using these facts.",
        JSON.stringify(facts, null, 2)
      ].join("\n\n")
    }
  ];
}

async function resolveScopedHumanAvailability(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    departmentId: string | null;
    teamId: string | null;
  }
) {
  const query = db("agent_profiles as ap")
    .join("agent_team_map as atm", function joinTeamMap() {
      this.on("atm.agent_id", "=", "ap.agent_id").andOn("atm.tenant_id", "=", "ap.tenant_id");
    })
    .join("teams as t", function joinTeams() {
      this.on("t.team_id", "=", "atm.team_id").andOn("t.tenant_id", "=", "atm.tenant_id");
    })
    .where({ "ap.tenant_id": input.tenantId, "t.is_active": true })
    .whereIn("ap.presence_state", ["online", "busy"]);

  if (input.departmentId) query.andWhere("t.department_id", input.departmentId);
  if (input.teamId) query.andWhere("t.team_id", input.teamId);

  const rows = await query
    .groupBy("ap.agent_id")
    .select("ap.agent_id", "ap.presence_state", "ap.display_name");

  return {
    serviceableAgents: rows.length,
    onlineAgentNames: rows.map((row) => row.display_name ?? row.agent_id)
  };
}

async function loadUpcomingScheduleFacts(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    departmentId: string | null;
    teamId: string | null;
  }
): Promise<{ summary: string | null; items: Array<Record<string, unknown>> }> {
  const rows = await db("agent_profiles as ap")
    .join("agent_team_map as atm", function joinTeamMap() {
      this.on("atm.agent_id", "=", "ap.agent_id").andOn("atm.tenant_id", "=", "ap.tenant_id");
    })
    .join("teams as t", function joinTeams() {
      this.on("t.team_id", "=", "atm.team_id").andOn("t.tenant_id", "=", "atm.tenant_id");
    })
    .join("agent_shifts as ash", function joinShifts() {
      this.on("ash.agent_id", "=", "ap.agent_id").andOn("ash.tenant_id", "=", "ap.tenant_id");
    })
    .leftJoin("shift_schedules as ss", function joinSchedules() {
      this.on("ss.shift_id", "=", "ash.shift_id").andOn("ss.tenant_id", "=", "ash.tenant_id");
    })
    .where({
      "ap.tenant_id": input.tenantId,
      "t.is_active": true,
      "ash.status": "scheduled"
    })
    .modify((builder) => {
      if (input.departmentId) builder.andWhere("t.department_id", input.departmentId);
      if (input.teamId) builder.andWhere("t.team_id", input.teamId);
    })
    .andWhere("ash.shift_date", ">=", db.raw("CURRENT_DATE"))
    .orderBy("ash.shift_date", "asc")
    .limit(5)
    .select(
      "ash.shift_date",
      "ss.start_time",
      "ss.end_time",
      "ss.timezone",
      "ss.name as shift_name"
    ) as Array<{
      shift_date: string;
      start_time: string | null;
      end_time: string | null;
      timezone: string | null;
      shift_name: string | null;
    }>;

  if (rows.length === 0) {
    return { summary: null, items: [] };
  }

  const items = rows.map((row) => ({
    date: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone ?? "Asia/Jakarta",
    shiftName: row.shift_name
  }));

  const summary = rows
    .map((row) => {
      const date = formatDateLabel(row.shift_date);
      if (row.start_time && row.end_time) {
        return `${date} ${row.start_time}-${row.end_time}`;
      }
      return `${date} scheduled`;
    })
    .join("; ");

  return { summary, items };
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildDedupeState(input: {
  scenario: RoutingNoticeScenario;
  assignedAgentId: string | null;
  queueMode: string;
  queuePosition: number | null;
  estimatedWaitSec: number | null;
  aiFallbackAllowed: boolean;
}) {
  return {
    scenario: input.scenario,
    assignedAgentId: input.assignedAgentId,
    queueMode: input.queueMode,
    queuePosition: input.queuePosition,
    estimatedWaitSecBucket: bucketWaitSec(input.estimatedWaitSec),
    aiFallbackAllowed: input.aiFallbackAllowed
  };
}

function bucketWaitSec(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  if (value <= 60) return 60;
  if (value <= 300) return 300;
  if (value <= 900) return 900;
  if (value <= 1800) return 1800;
  return 3600;
}

async function hasMatchingRecentNotice(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    conversationId: string;
    state: Record<string, unknown>;
  }
) {
  const row = await db("conversation_events")
    .where({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      event_type: "routing_notice_sent"
    })
    .select("payload")
    .orderBy("created_at", "desc")
    .first<{ payload: { state?: Record<string, unknown> } | null } | undefined>();

  const previousState = row?.payload?.state;
  return JSON.stringify(previousState ?? null) === JSON.stringify(input.state);
}
