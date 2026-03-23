import type { Knex } from "knex";

const HEARTBEAT_TIMEOUT_MS = 90_000;
const IDLE_AWAY_MS = 5 * 60_000;
const RECOVERY_COOLDOWN_MS = 10_000;

const ASSIGNABLE_PRESENCE_STATES = ["online", "busy"] as const;
const MANUAL_STATUSES = ["online", "busy", "away", "offline"] as const;

type ManualStatus = (typeof MANUAL_STATUSES)[number];
type PresenceState = "offline" | "away" | "online" | "busy";

type PresenceRow = {
  agent_id: string;
  status: string | null;
  presence_state: string | null;
  last_heartbeat_at: string | Date | null;
  last_activity_at: string | Date | null;
  presence_recovery_due_at: string | Date | null;
  break_count: string | number | null;
  active_count: string | number | null;
};

export class PresenceService {
  static readonly HEARTBEAT_TIMEOUT_MS = HEARTBEAT_TIMEOUT_MS;
  static readonly IDLE_AWAY_MS = IDLE_AWAY_MS;
  static readonly RECOVERY_COOLDOWN_MS = RECOVERY_COOLDOWN_MS;
  static readonly ASSIGNABLE_STATES = [...ASSIGNABLE_PRESENCE_STATES];

  async recordHeartbeat(
    trx: Knex.Transaction,
    input: { tenantId: string; agentId: string; status?: string }
  ): Promise<PresenceState> {
    const now = new Date();
    const normalizedStatus = normalizeManualStatus(input.status);

    const current = await trx("agent_profiles")
      .where({ tenant_id: input.tenantId, agent_id: input.agentId })
      .select("presence_state")
      .first<{ presence_state: string | null } | undefined>();

    if (!current) {
      throw new Error("Agent profile not found");
    }

    const updates: Record<string, unknown> = {
      last_heartbeat_at: now,
      last_seen_at: now,
      updated_at: now
    };

    if (normalizedStatus) {
      updates.status = normalizedStatus;
    }

    if (
      normalizedStatus &&
      normalizedStatus !== "offline" &&
      (current.presence_state === "away" || current.presence_state === "offline")
    ) {
      updates.presence_recovery_due_at = new Date(now.getTime() + RECOVERY_COOLDOWN_MS);
    }

    await trx("agent_profiles")
      .where({ tenant_id: input.tenantId, agent_id: input.agentId })
      .update(updates);

    return this.refreshAgentPresence(trx, input.tenantId, input.agentId, now);
  }

  async recordActivity(
    trx: Knex.Transaction,
    input: { tenantId: string; agentId: string }
  ): Promise<PresenceState> {
    const now = new Date();
    const current = await trx("agent_profiles")
      .where({ tenant_id: input.tenantId, agent_id: input.agentId })
      .select("presence_state", "presence_recovery_due_at")
      .first<{ presence_state: string | null; presence_recovery_due_at: string | Date | null } | undefined>();

    if (!current) {
      throw new Error("Agent profile not found");
    }

    const updates: Record<string, unknown> = {
      last_activity_at: now,
      updated_at: now
    };

    const dueAt = toDate(current.presence_recovery_due_at);
    if (
      (current.presence_state === "away" || current.presence_state === "offline") &&
      (!dueAt || dueAt.getTime() <= now.getTime())
    ) {
      updates.presence_recovery_due_at = new Date(now.getTime() + RECOVERY_COOLDOWN_MS);
    }

    await trx("agent_profiles")
      .where({ tenant_id: input.tenantId, agent_id: input.agentId })
      .update(updates);

    return this.refreshAgentPresence(trx, input.tenantId, input.agentId, now);
  }

  async refreshAgentPresence(
    trx: Knex.Transaction,
    tenantId: string,
    agentId: string,
    now: Date = new Date()
  ): Promise<PresenceState> {
    const rows = await this.fetchPresenceRows(trx, tenantId, [agentId]);
    const row = rows[0];
    if (!row) {
      throw new Error("Agent profile not found");
    }

    const nextState = derivePresenceState(row, now);
    await this.persistPresenceState(trx, tenantId, row.agent_id, row.presence_state, nextState, now);
    return nextState;
  }

  async refreshTenantPresenceStates(
    trx: Knex.Transaction,
    tenantId: string
  ): Promise<Map<string, PresenceState>> {
    const rows = await this.fetchPresenceRows(trx, tenantId);
    const nextStates = new Map<string, PresenceState>();
    const now = new Date();

    for (const row of rows) {
      const nextState = derivePresenceState(row, now);
      await this.persistPresenceState(trx, tenantId, row.agent_id, row.presence_state, nextState, now);
      nextStates.set(row.agent_id, nextState);
    }

    return nextStates;
  }

  private async fetchPresenceRows(
    trx: Knex.Transaction,
    tenantId: string,
    agentIds?: string[]
  ): Promise<PresenceRow[]> {
    const activeBreaks = trx("agent_breaks")
      .where({ tenant_id: tenantId, status: "active" })
      .modify((query) => {
        if (agentIds && agentIds.length > 0) {
          query.whereIn("agent_id", agentIds);
        }
      })
      .groupBy("agent_id")
      .select("agent_id")
      .count<{ agent_id: string; break_count: string }[]>("break_id as break_count")
      .as("ab");

    const activeAssignments = trx("conversations")
      .where({ tenant_id: tenantId, status: "human_active", current_handler_type: "human" })
      .whereNotNull("current_handler_id")
      .modify((query) => {
        if (agentIds && agentIds.length > 0) {
          query.whereIn("current_handler_id", agentIds);
        }
      })
      .groupBy("current_handler_id")
      .select("current_handler_id")
      .count<{ current_handler_id: string; active_count: string }[]>("conversation_id as active_count")
      .as("qa");

    const query = trx("agent_profiles as ap")
      .leftJoin(activeBreaks, "ab.agent_id", "ap.agent_id")
      .leftJoin(activeAssignments, function joinActiveAssignments() {
        this.on(trx.raw("qa.current_handler_id::uuid"), "=", trx.ref("ap.agent_id"));
      })
      .where("ap.tenant_id", tenantId)
      .select(
        "ap.agent_id",
        "ap.status",
        "ap.presence_state",
        "ap.last_heartbeat_at",
        "ap.last_activity_at",
        "ap.presence_recovery_due_at",
        "ab.break_count",
        "qa.active_count"
      );

    if (agentIds && agentIds.length > 0) {
      query.whereIn("ap.agent_id", agentIds);
    }

    return query as Promise<PresenceRow[]>;
  }

  private async persistPresenceState(
    trx: Knex.Transaction,
    tenantId: string,
    agentId: string,
    previousState: string | null,
    nextState: PresenceState,
    now: Date
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      presence_state: nextState,
      updated_at: now
    };

    if (previousState !== nextState) {
      patch.presence_state_changed_at = now;
    }

    if (nextState === "online" || nextState === "busy" || nextState === "offline") {
      patch.presence_recovery_due_at = null;
    }

    await trx("agent_profiles")
      .where({ tenant_id: tenantId, agent_id: agentId })
      .update(patch);
  }
}

function derivePresenceState(row: PresenceRow, now: Date): PresenceState {
  const manualStatus = normalizeManualStatus(row.status) ?? "offline";
  const heartbeatAt = toDate(row.last_heartbeat_at);
  const activityAt = toDate(row.last_activity_at);
  const recoveryDueAt = toDate(row.presence_recovery_due_at);
  const previousState = normalizePresenceState(row.presence_state);
  const activeBreaks = Number(row.break_count ?? 0);
  const activeAssignments = Number(row.active_count ?? 0);

  if (manualStatus === "offline") return "offline";
  if (!heartbeatAt || now.getTime() - heartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS) return "offline";
  if (activeBreaks > 0 || manualStatus === "away") return "away";
  if (!activityAt || now.getTime() - activityAt.getTime() > IDLE_AWAY_MS) return "away";

  if ((previousState === "away" || previousState === "offline") && recoveryDueAt && recoveryDueAt.getTime() > now.getTime()) {
    return "away";
  }

  if (manualStatus === "busy" || activeAssignments > 0) {
    return "busy";
  }

  return "online";
}

function normalizeManualStatus(value: string | null | undefined): ManualStatus | null {
  return MANUAL_STATUSES.includes(value as ManualStatus) ? (value as ManualStatus) : null;
}

function normalizePresenceState(value: string | null | undefined): PresenceState {
  if (value === "away" || value === "online" || value === "busy") {
    return value;
  }
  return "offline";
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}
