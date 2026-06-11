import type { Knex } from "knex";
import type { AIMessage } from "../../../../../packages/ai-sdk/src/index.js";

import { buildCallContext, trackedComplete } from "../ai/call-context.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { assertTenantAIBudgetAllowsUsage } from "../ai/usage-meter.service.js";
import { EXPLICIT_AI_OPT_IN_COMMAND } from "../service-mode/service-mode.constants.js";

// ── Template fallback ────────────────────────────────────────────────────────
// Used when AI settings are not configured, AI budget is exhausted, or the
// AI call fails. Ensures the customer always receives a routing notice even
// without a functioning AI provider.
const TEMPLATE_NOTICES: Record<
  "human_assigned" | "human_queue" | "fallback_ai",
  Record<"zh" | "en" | "id", (vars: { agentName?: string | null; queuePos?: number | null; waitMin?: number | null }) => string>
> = {
  human_assigned: {
    zh: ({ agentName }) =>
      agentName
        ? `您好，已为您转接人工客服 ${agentName}，稍等片刻即可为您服务。`
        : "您好，已为您转接人工客服，稍等片刻即可为您服务。",
    en: ({ agentName }) =>
      agentName
        ? `You've been connected to agent ${agentName}. They'll be with you shortly.`
        : "You've been connected to a support agent. They'll be with you shortly.",
    id: ({ agentName }) =>
      agentName
        ? `Anda telah dihubungkan dengan agen ${agentName}. Mereka akan segera melayani Anda.`
        : "Anda telah dihubungkan dengan agen dukungan. Mereka akan segera melayani Anda."
  },
  human_queue: {
    zh: ({ queuePos, waitMin }) => {
      const parts = ["您好，已为您转接人工客服，当前正在排队中，请稍候。"];
      if (queuePos != null && queuePos > 0) parts.push(`您当前排队位置：第 ${queuePos} 位。`);
      if (waitMin != null && waitMin > 0) parts.push(`预计等待时间约 ${waitMin} 分钟。`);
      return parts.join("");
    },
    en: ({ queuePos, waitMin }) => {
      const parts = ["You've been placed in the support queue. An agent will be with you soon."];
      if (queuePos != null && queuePos > 0) parts.push(` You are number ${queuePos} in the queue.`);
      if (waitMin != null && waitMin > 0) parts.push(` Estimated wait: ~${waitMin} min.`);
      return parts.join("");
    },
    id: ({ queuePos, waitMin }) => {
      const parts = ["Anda telah masuk dalam antrean dukungan. Agen akan segera melayani Anda."];
      if (queuePos != null && queuePos > 0) parts.push(` Anda berada di posisi ${queuePos} dalam antrean.`);
      if (waitMin != null && waitMin > 0) parts.push(` Perkiraan waktu tunggu: ~${waitMin} menit.`);
      return parts.join("");
    }
  },
  fallback_ai: {
    zh: () => "您好，当前人工客服暂时不可用，AI 助手将继续为您服务。如需人工客服，请稍后再试。",
    en: () => "No human agents are available right now. Our AI assistant will continue to help you. Please try again later if you need a human agent.",
    id: () => "Tidak ada agen yang tersedia saat ini. Asisten AI kami akan terus membantu Anda. Silakan coba lagi nanti jika Anda membutuhkan agen."
  }
};

// CJK detection: if the message contains Chinese/Japanese/Korean characters, it's CJK
const CJK_RE = /[一-鿿぀-ヿ가-힯]/;

/**
 * Detect the most likely reply language from the customer's actual message text.
 * This OVERRIDES the `customerLanguage` DB field when the text content is clear,
 * because the stored language preference may be stale or set by timezone/locale
 * rather than actual conversation language.
 */
function detectReplyLanguage(messageText: string | null, storedLanguage: string | null): "zh" | "en" | "id" {
  if (messageText) {
    if (CJK_RE.test(messageText)) return "zh";
    if (/\b(saya|anda|tidak|yang|dengan|untuk|ada|ini|itu|dari|sudah|belum|atau)\b/i.test(messageText)) return "id";
  }
  const lang = (storedLanguage ?? "").toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("id") || lang === "id") return "id";
  return "en";
}

function buildTemplateFallback(
  scenario: "human_assigned" | "human_queue" | "fallback_ai",
  vars: {
    messageText: string | null;
    language: string | null;
    agentName: string | null;
    queuePosition: number | null;
    estimatedWaitSec: number | null;
  }
): string {
  const lang = detectReplyLanguage(vars.messageText, vars.language);
  const template = TEMPLATE_NOTICES[scenario][lang];
  const waitMin = vars.estimatedWaitSec != null ? Math.ceil(vars.estimatedWaitSec / 60) : null;
  return template({ agentName: vars.agentName, queuePos: vars.queuePosition, waitMin });
}

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
- LANGUAGE DETECTION (critical): look at the actual text of latestCustomerMessage to determine language.
  If it contains Chinese characters → reply in Chinese (Simplified).
  If it looks like Indonesian/Malay → reply in Indonesian.
  Otherwise → reply in English.
  NEVER use the customerLanguage field to override what you detect from the message text.
- Be concise, clear, and natural. One or two sentences maximum.
- Only use the facts provided below. Do not invent availability, times, or queue data.
- For human_assigned: say the transfer succeeded and mention the agent name when provided.
- For human_queue: say the customer is in queue and mention position/wait time when provided.
  Do NOT mention schedules, dates, or when agents will be next available — the customer is already queued.
- For fallback_ai: explain that no human is available right now. Only mention the nextScheduleSummary
  if it is provided and non-null.
- When the facts include a switchBackCommand for a fallback_ai scenario, mention that command.
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
    // Resolve AI settings (optional — if not available we fall back to templates)
    const [settings, budgetGate] = await Promise.all([
      resolveTenantAISettingsForScene(db, input.tenantId, "ai_seat"),
      assertTenantAIBudgetAllowsUsage(db, input.tenantId)
    ]);
    const aiAvailable = Boolean(settings && budgetGate.allowed);

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

    // Only load schedule facts for fallback_ai scenario — for human_queue/human_assigned,
    // the customer is already in queue and should NOT be told about future schedules.
    // Passing schedule info to human_queue causes the LLM to fabricate "next available" dates.
    const nextSchedules = input.scenario === "fallback_ai"
      ? await loadUpcomingScheduleFacts(db, {
          tenantId: input.tenantId,
          departmentId: assignment.department_id,
          teamId: assignment.team_id
        })
      : { summary: null, items: [] };

    const messageText = lastCustomerMessage?.content?.text ?? null;

    const facts = {
      scenario: input.scenario,
      // detectedLanguage is derived from the actual message text server-side and should
      // be trusted over customerLanguage which may be based on timezone/profile settings.
      detectedLanguage: detectReplyLanguage(messageText, customer?.language ?? null),
      customerLanguage: customer?.language ?? null,
      latestCustomerMessage: messageText,
      assignedAgentName: assignedAgent?.display_name ?? null,
      queuePosition: assignment.queue_position ?? null,
      estimatedWaitSec: assignment.estimated_wait_sec ?? null,
      serviceRequestMode: assignment.service_request_mode,
      humanProgress: assignment.human_progress,
      queueMode: assignment.queue_mode,
      aiFallbackAllowed: Boolean(assignment.ai_fallback_allowed),
      // nextScheduleSummary only populated for fallback_ai scenario (see above)
      nextScheduleSummary: nextSchedules.summary,
      switchBackCommand: input.scenario === "fallback_ai" ? EXPLICIT_AI_OPT_IN_COMMAND : null
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

    // ── Try AI-generated notice first ────────────────────────────────────────
    let noticeText: string | null = null;

    if (aiAvailable && settings) {
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
        const candidate = typeof parsed.text === "string" ? parsed.text.trim() : "";
        if (candidate) {
          noticeText = candidate;
        }
      } catch {
        // AI call failed — fall through to template below
      }
    }

    // ── Fallback to template if AI produced nothing ───────────────────────────
    if (!noticeText) {
      noticeText = buildTemplateFallback(input.scenario, {
        messageText,
        language: customer?.language ?? null,
        agentName: assignedAgent?.display_name ?? null,
        queuePosition: assignment.queue_position ?? null,
        estimatedWaitSec: assignment.estimated_wait_sec ?? null
      });
    }

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
      text: noticeText,
      aiAgentName: input.aiAgentName?.trim() || "AI"
    };
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
