import type { Knex } from "knex";

import { PresenceService } from "../agent/presence.service.js";
import type { HumanRoutingAssignmentStrategy } from "./types.js";

type AgentCandidateRow = {
  agentId: string;
  agentLabel: string;
  maxConcurrency: number;
  createdAt: string;
  teamId: string;
  teamCode: string;
  teamName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  isPrimary: boolean;
  joinedAt: string;
  timezone: string;
  shiftDate: string;
  shiftStatus: string;
  shiftStartTime: string;
  shiftEndTime: string;
  activeBreak: boolean;
  activeAssignments: number;
  reservedAssignments: number;
  todayNewCaseCount: number;
  lastAssignedAt: string | null;
};

type AgentCandidateEvaluation = AgentCandidateRow & {
  eligible: boolean;
  rejectReason: string | null;
};

export type HumanDispatchDecision = {
  departmentId: string | null;
  teamId: string | null;
  assignedAgentId: string | null;
  strategy: HumanRoutingAssignmentStrategy;
  priority: number;
  status: "pending" | "assigned";
  reason: string;
  audit: {
    routingRuleId: string | null;
    routingRuleName: string | null;
    matchedConditions: Record<string, unknown>;
    candidates: Array<{
      candidateType: "agent" | "team";
      candidateId: string;
      candidateLabel: string;
      stage: string;
      accepted: boolean;
      rejectReason: string | null;
      details: Record<string, unknown>;
    }>;
  };
};

export type HumanCapacitySnapshot = {
  departmentId: string | null;
  teamId: string | null;
  strategy: HumanRoutingAssignmentStrategy;
  eligibleAgents: number;
  totalAgents: number;
  totalActiveAssignments: number;
  totalMaxConcurrency: number;
  loadPct: number | null;
  candidates: AgentCandidateEvaluation[];
};

type ResolvedScope = {
  departmentId: string | null;
  teamId: string | null;
};

type TeamContext = {
  departmentId: string | null;
  teamId: string | null;
};

export type HumanDispatchTarget = {
  departmentId: string | null;
  departmentCode: string | null;
  teamId: string | null;
  teamCode: string | null;
  assignmentStrategy: HumanRoutingAssignmentStrategy | null;
};

const presenceService = new PresenceService();

export class HumanDispatchService {
  async inspectAgentAvailability(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      agentId: string;
    }
  ): Promise<AgentCandidateEvaluation | null> {
    const evaluations = await loadCandidateEvaluations(db, input.tenantId);
    return evaluations.find((candidate) => candidate.agentId === input.agentId) ?? null;
  }

  async inspectTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      target: HumanDispatchTarget;
      priority?: number;
    }
  ): Promise<HumanCapacitySnapshot> {
    const scope = await resolveScope(db, input.tenantId, input.target);
    const strategy = input.target.assignmentStrategy ?? "least_busy";
    const evaluations = await loadCandidateEvaluations(db, input.tenantId);
    const scopedCandidates = evaluations.filter((candidate) => {
      if (scope.teamId && candidate.teamId !== scope.teamId) return false;
      if (scope.departmentId && candidate.departmentId !== scope.departmentId) return false;
      return true;
    });

    const totalActiveAssignments = scopedCandidates.reduce((sum, candidate) => sum + candidate.activeAssignments, 0);
    const totalMaxConcurrency = scopedCandidates.reduce((sum, candidate) => sum + Math.max(candidate.maxConcurrency, 0), 0);

    return {
      departmentId: scope.departmentId,
      teamId: scope.teamId,
      strategy,
      eligibleAgents: scopedCandidates.filter((candidate) => candidate.eligible).length,
      totalAgents: scopedCandidates.length,
      totalActiveAssignments,
      totalMaxConcurrency,
      loadPct: totalMaxConcurrency > 0 ? Math.min(100, Math.round((totalActiveAssignments / totalMaxConcurrency) * 100)) : null,
      candidates: scopedCandidates
    };
  }

  async decideForTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      target: HumanDispatchTarget;
      priority?: number;
      reason?: string;
      auditSource?: {
        ruleId: string | null;
        ruleName: string | null;
        matchedConditions: Record<string, unknown>;
      };
      excludeAgentIds?: string[];
    }
  ): Promise<HumanDispatchDecision> {
    const scope = await resolveScope(db, input.tenantId, input.target);
    const strategy = input.target.assignmentStrategy ?? "least_busy";

    return assignWithinScope(db, {
      tenantId: input.tenantId,
      departmentId: scope.departmentId,
      teamId: scope.teamId,
      strategy,
      priority: input.priority ?? 100,
      fallbackReason: input.reason ?? "explicit_target",
      auditSource: input.auditSource ?? {
        ruleId: null,
        ruleName: "explicit_target",
        matchedConditions: {}
      },
      excludeAgentIds: input.excludeAgentIds ?? []
    });
  }

  async decideForAnyAvailableTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      departmentId?: string | null;
      teamId?: string | null;
      strategy?: HumanRoutingAssignmentStrategy | null;
      priority?: number;
      reason?: string;
      auditSource?: {
        ruleId: string | null;
        ruleName: string | null;
        matchedConditions: Record<string, unknown>;
      };
      excludeAgentIds?: string[];
    }
  ): Promise<HumanDispatchDecision | null> {
    const capacity = await this.inspectTarget(db, {
      tenantId: input.tenantId,
      target: {
        departmentId: input.departmentId ?? null,
        departmentCode: null,
        teamId: input.teamId ?? null,
        teamCode: null,
        assignmentStrategy: input.strategy ?? "least_busy"
      },
      priority: input.priority
    });

    if (capacity.totalAgents === 0 || capacity.eligibleAgents === 0) return null;

    return assignWithinScope(db, {
      tenantId: input.tenantId,
      departmentId: capacity.departmentId,
      teamId: capacity.teamId,
      strategy: capacity.strategy,
      priority: input.priority ?? 100,
      fallbackReason: input.reason ?? "fallback_any_human_target",
      auditSource: input.auditSource ?? {
        ruleId: null,
        ruleName: "fallback_any_human_target",
        matchedConditions: {}
      },
      excludeAgentIds: input.excludeAgentIds ?? []
    });
  }
}

export async function getPrimaryTeamContext(
  db: Knex | Knex.Transaction,
  tenantId: string,
  agentId: string
): Promise<TeamContext> {
  const row = await db("agent_team_map as atm")
    .join("teams as t", function joinTeams() {
      this.on("t.team_id", "=", "atm.team_id").andOn("t.tenant_id", "=", "atm.tenant_id");
    })
    .where({
      "atm.tenant_id": tenantId,
      "atm.agent_id": agentId,
      "t.is_active": true
    })
    .select("t.department_id", "t.team_id", "atm.is_primary", "atm.joined_at")
    .orderBy("atm.is_primary", "desc")
    .orderBy("atm.joined_at", "asc")
    .first<{ department_id: string | null; team_id: string | null }>();

  return {
    departmentId: row?.department_id ?? null,
    teamId: row?.team_id ?? null
  };
}

async function resolveScope(
  db: Knex | Knex.Transaction,
  tenantId: string,
  target: HumanDispatchTarget
): Promise<ResolvedScope> {
  const departmentId = target.departmentId;
  const departmentCode = target.departmentCode;
  const teamId = target.teamId;
  const teamCode = target.teamCode;

  const resolvedDepartmentId = departmentId
    ? await resolveDepartmentId(db, tenantId, { departmentId })
    : departmentCode
      ? await resolveDepartmentId(db, tenantId, { departmentCode })
      : null;

  const resolvedTeam = teamId
    ? await resolveTeam(db, tenantId, { teamId })
    : teamCode
      ? await resolveTeam(db, tenantId, { teamCode })
      : null;

  return {
    departmentId: resolvedTeam?.departmentId ?? resolvedDepartmentId,
    teamId: resolvedTeam?.teamId ?? null
  };
}

async function resolveDepartmentId(
  db: Knex | Knex.Transaction,
  tenantId: string,
  input: { departmentId?: string; departmentCode?: string }
): Promise<string | null> {
  const query = db("departments")
    .where({ tenant_id: tenantId, is_active: true })
    .select("department_id")
    .first<{ department_id: string }>();

  if (input.departmentId) query.andWhere({ department_id: input.departmentId });
  if (input.departmentCode) query.andWhere({ code: input.departmentCode });

  const row = await query;
  return row?.department_id ?? null;
}

async function resolveTeam(
  db: Knex | Knex.Transaction,
  tenantId: string,
  input: { teamId?: string; teamCode?: string }
): Promise<{ departmentId: string; teamId: string } | null> {
  const query = db("teams")
    .where({ tenant_id: tenantId, is_active: true })
    .select("team_id", "department_id")
    .first<{ team_id: string; department_id: string }>();

  if (input.teamId) query.andWhere({ team_id: input.teamId });
  if (input.teamCode) query.andWhere({ code: input.teamCode });

  const row = await query;
  if (!row) return null;
  return { departmentId: row.department_id, teamId: row.team_id };
}

async function assignWithinScope(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    departmentId: string | null;
    teamId: string | null;
    strategy: HumanDispatchDecision["strategy"];
    priority: number;
    fallbackReason: string;
    excludeAgentIds: string[];
    auditSource: {
      ruleId: string | null;
      ruleName: string | null;
      matchedConditions: Record<string, unknown>;
    };
  }
): Promise<HumanDispatchDecision> {
  const evaluations = await loadCandidateEvaluations(db, input.tenantId);
  const scopedEvaluations = evaluations.filter((candidate) => {
    if (input.teamId && candidate.teamId !== input.teamId) return false;
    if (input.departmentId && candidate.departmentId !== input.departmentId) return false;
    return true;
  });
  const scopedCandidates = scopedEvaluations.filter((candidate) => candidate.eligible);
  const filteredCandidates = scopedCandidates.filter((candidate) => !input.excludeAgentIds.includes(candidate.agentId));
  const effectiveCandidates = filteredCandidates.length > 0 ? filteredCandidates : scopedCandidates;
  const chosenTeamId = input.teamId ?? chooseBestTeam(effectiveCandidates);
  const teamAuditCandidates = buildTeamAuditCandidates(scopedEvaluations, chosenTeamId);

  if (effectiveCandidates.length === 0) {
    return {
      departmentId: input.departmentId,
      teamId: input.teamId,
      assignedAgentId: null,
      strategy: input.strategy,
      priority: input.priority,
      status: "pending",
      reason: "no-eligible-agent",
      audit: {
        routingRuleId: input.auditSource.ruleId,
        routingRuleName: input.auditSource.ruleName,
        matchedConditions: input.auditSource.matchedConditions,
        candidates: teamAuditCandidates
      }
    };
  }

  const effectiveTeamId = chosenTeamId;
  const teamCandidates = effectiveCandidates.filter((candidate) => candidate.teamId === effectiveTeamId);
  const selected = await chooseAgent(db, input.tenantId, input.strategy, teamCandidates);
  const teamScope = teamCandidates.find((candidate) => candidate.agentId === selected?.agentId) ?? teamCandidates[0];

  return {
    departmentId: teamScope?.departmentId ?? input.departmentId,
    teamId: teamScope?.teamId ?? effectiveTeamId ?? input.teamId,
    assignedAgentId: selected?.agentId ?? null,
    strategy: input.strategy,
    priority: input.priority,
    status: selected ? "assigned" : "pending",
    reason: selected ? input.fallbackReason : "no-eligible-agent",
    audit: {
      routingRuleId: input.auditSource.ruleId,
      routingRuleName: input.auditSource.ruleName,
      matchedConditions: input.auditSource.matchedConditions,
      candidates: [
        ...teamAuditCandidates,
        ...scopedEvaluations.map((candidate) => ({
          candidateType: "agent" as const,
          candidateId: candidate.agentId,
          candidateLabel: `${candidate.teamName} / ${candidate.agentLabel}`,
          stage: candidate.teamId === effectiveTeamId ? "team_scope" : "eligible",
          accepted: candidate.agentId === selected?.agentId,
          rejectReason: candidate.agentId === selected?.agentId
            ? null
            : input.excludeAgentIds.includes(candidate.agentId) && filteredCandidates.length > 0
              ? "excluded_for_reroute"
              : !candidate.eligible
                ? candidate.rejectReason
            : candidate.teamId !== effectiveTeamId
              ? "team_not_selected"
              : "not_selected_by_strategy",
          details: {
            teamId: candidate.teamId,
            teamName: candidate.teamName,
            departmentId: candidate.departmentId,
            departmentName: candidate.departmentName,
            activeAssignments: candidate.activeAssignments,
            reservedAssignments: candidate.reservedAssignments,
            todayNewCaseCount: candidate.todayNewCaseCount,
            maxConcurrency: candidate.maxConcurrency,
            lastAssignedAt: candidate.lastAssignedAt
          }
        }))
      ]
    }
  };
}

async function loadCandidateEvaluations(
  db: Knex | Knex.Transaction,
  tenantId: string
): Promise<AgentCandidateEvaluation[]> {
  const now = new Date();
  if (typeof (db as Knex.Transaction).commit === "function") {
    await presenceService.refreshTenantPresenceStates(db as Knex.Transaction, tenantId);
  }
  const baseRows = await db("agent_profiles as ap")
    .join("agent_team_map as atm", function joinTeamMap() {
      this.on("atm.agent_id", "=", "ap.agent_id").andOn("atm.tenant_id", "=", "ap.tenant_id");
    })
    .join("teams as t", function joinTeams() {
      this.on("t.team_id", "=", "atm.team_id").andOn("t.tenant_id", "=", "atm.tenant_id");
    })
    .join("departments as d", function joinDepartments() {
      this.on("d.department_id", "=", "t.department_id").andOn("d.tenant_id", "=", "t.tenant_id");
    })
    .join("agent_shifts as ash", function joinShifts() {
      this.on("ash.agent_id", "=", "ap.agent_id").andOn("ash.tenant_id", "=", "ap.tenant_id");
    })
    .leftJoin("shift_schedules as ss", function joinSchedules() {
      this.on("ss.shift_id", "=", "ash.shift_id").andOn("ss.tenant_id", "=", "ash.tenant_id");
    })
    .leftJoin("agent_breaks as ab", function joinBreaks() {
      this.on("ab.agent_id", "=", "ap.agent_id")
        .andOn("ab.tenant_id", "=", "ap.tenant_id")
        .andOn("ab.status", "=", db.raw("?", ["active"]));
    })
    .where({
      "ap.tenant_id": tenantId,
      "t.is_active": true,
      "d.is_active": true
    })
    .whereIn("ap.presence_state", PresenceService.ASSIGNABLE_STATES)
    .select(
      "ap.agent_id",
      "ap.display_name",
      "ap.max_concurrency",
      "ap.created_at",
      "atm.team_id",
      "atm.is_primary",
      "atm.joined_at",
      "t.code as team_code",
      "t.name as team_name",
      "t.department_id",
      "d.code as department_code",
      "d.name as department_name",
      "ash.shift_date",
      "ash.status as shift_status",
      "ss.start_time",
      "ss.end_time",
      "ss.timezone",
      "ab.break_id"
    ) as Array<Record<string, unknown>>;

  if (baseRows.length === 0) return [];

  const currentDayRows = baseRows.filter((row) =>
    normalizeShiftDate(row.shift_date, String(row.timezone ?? "Asia/Jakarta")) === formatLocalDate(now, String(row.timezone ?? "Asia/Jakarta"))
  );

  if (currentDayRows.length === 0) return [];

  const agentIds = [...new Set(currentDayRows.map((row) => String(row.agent_id)))];
  const jakartaDate = formatLocalDate(now, "Asia/Jakarta");
  const [loadRows, reservedRows, lastAssignedRows, todayNewCaseRows] = await Promise.all([
    db("conversations")
      .where({ tenant_id: tenantId, status: "human_active", current_handler_type: "human" })
      .whereIn("current_handler_id", agentIds)
      .groupBy("current_handler_id")
      .select("current_handler_id")
      .count<{ current_handler_id: string; active_count: string }[]>("conversation_id as active_count"),
    db("queue_assignments")
      .where({ tenant_id: tenantId })
      .whereIn("status", ["assigned", "pending"])
      .whereIn("assigned_agent_id", agentIds)
      .groupBy("assigned_agent_id")
      .select("assigned_agent_id")
      .count<{ assigned_agent_id: string; reserved_count: string }[]>("assignment_id as reserved_count"),
    db("queue_assignments")
      .where({ tenant_id: tenantId })
      .whereIn("assigned_agent_id", agentIds)
      .whereNotNull("assigned_agent_id")
      .groupBy("assigned_agent_id")
      .select("assigned_agent_id")
      .max<{ assigned_agent_id: string; last_assigned_at: string | null }[]>("updated_at as last_assigned_at"),
    db("routing_plans")
      .where({ tenant_id: tenantId, trigger_type: "inbound_message" })
      .whereNotNull("case_id")
      .whereRaw("(created_at AT TIME ZONE 'Asia/Jakarta')::date = ?", [jakartaDate])
      .whereRaw("status_plan->>'selectedOwnerType' = 'human'")
      .whereIn(db.raw("target_snapshot->>'agentId'") as unknown as string, agentIds)
      .groupByRaw("target_snapshot->>'agentId'")
      .select(db.raw("target_snapshot->>'agentId' as agent_id"))
      .countDistinct<{ agent_id: string; today_new_case_count: string }[]>("case_id as today_new_case_count")
  ]);

  const loadByAgent = new Map(loadRows.map((row) => [row.current_handler_id, Number(row.active_count ?? 0)]));
  const reservedByAgent = new Map(reservedRows.map((row) => [row.assigned_agent_id, Number(row.reserved_count ?? 0)]));
  const lastAssignedByAgent = new Map(lastAssignedRows.map((row) => [row.assigned_agent_id, row.last_assigned_at ?? null]));
  const todayNewCasesByAgent = new Map(todayNewCaseRows.map((row) => [row.agent_id, Number(row.today_new_case_count ?? 0)]));

  return dedupeCandidateRows(
    currentDayRows
    .map((row) => ({
      agentId: String(row.agent_id),
      agentLabel: String(row.display_name ?? row.agent_id),
      maxConcurrency: Number(row.max_concurrency ?? 0),
      createdAt: String(row.created_at),
      teamId: String(row.team_id),
      teamCode: String(row.team_code),
      teamName: String(row.team_name),
      departmentId: String(row.department_id),
      departmentCode: String(row.department_code),
      departmentName: String(row.department_name),
      isPrimary: Boolean(row.is_primary),
      joinedAt: String(row.joined_at),
      timezone: String(row.timezone ?? "Asia/Jakarta"),
      shiftDate: normalizeShiftDate(row.shift_date, String(row.timezone ?? "Asia/Jakarta")),
      shiftStatus: String(row.shift_status ?? "off"),
      shiftStartTime: typeof row.start_time === "string" ? row.start_time : "",
      shiftEndTime: typeof row.end_time === "string" ? row.end_time : "",
      activeBreak: row.break_id !== null && row.break_id !== undefined,
      activeAssignments: loadByAgent.get(String(row.agent_id)) ?? 0,
      reservedAssignments: reservedByAgent.get(String(row.agent_id)) ?? 0,
      todayNewCaseCount: todayNewCasesByAgent.get(String(row.agent_id)) ?? 0,
      lastAssignedAt: lastAssignedByAgent.get(String(row.agent_id)) ?? null
    }))
    .map((candidate) => ({
      ...candidate,
      eligible: isCandidateEligible(candidate, now),
      rejectReason: explainCandidateIneligibleReason(candidate, now)
    }))
  );
}

function isCandidateEligible(candidate: AgentCandidateRow, now: Date): boolean {
  if (candidate.activeBreak) return false;
  if (candidate.shiftStatus !== "scheduled") return false;
  if (candidate.maxConcurrency <= 0) return false;
  if (!hasShiftWindow(candidate)) return true;
  return isWithinShift(now, candidate.timezone, candidate.shiftDate, candidate.shiftStartTime, candidate.shiftEndTime);
}

function explainCandidateIneligibleReason(candidate: AgentCandidateRow, now: Date): string | null {
  if (candidate.activeBreak) return "agent_on_break";
  if (candidate.shiftStatus !== "scheduled") return "agent_not_scheduled";
  if (!hasShiftWindow(candidate)) return null;
  if (!isWithinShift(now, candidate.timezone, candidate.shiftDate, candidate.shiftStartTime, candidate.shiftEndTime)) {
    return "outside_shift_window";
  }
  if (candidate.maxConcurrency <= 0) return "agent_concurrency_disabled";
  return null;
}

function hasShiftWindow(candidate: Pick<AgentCandidateRow, "shiftStartTime" | "shiftEndTime">): boolean {
  return Boolean(candidate.shiftStartTime && candidate.shiftEndTime);
}

function isWithinShift(now: Date, timezone: string, shiftDate: string, startTime: string, endTime: string): boolean {
  const localDate = formatLocalDate(now, timezone);
  if (localDate !== shiftDate) return false;

  const currentMinutes = toMinutes(formatLocalTime(now, timezone));
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  if (Number.isNaN(currentMinutes) || Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    return false;
  }

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function chooseBestTeam(candidates: AgentCandidateRow[]): string | null {
  const teamStats = new Map<string, { loadRatio: number; available: number; primaryCount: number }>();

  for (const candidate of candidates) {
    const stat = teamStats.get(candidate.teamId) ?? { loadRatio: 0, available: 0, primaryCount: 0 };
    stat.loadRatio += candidate.activeAssignments / Math.max(candidate.maxConcurrency, 1);
    stat.available += 1;
    stat.primaryCount += candidate.isPrimary ? 1 : 0;
    teamStats.set(candidate.teamId, stat);
  }

  const sorted = [...teamStats.entries()].sort((a, b) => {
    if (a[1].loadRatio !== b[1].loadRatio) return a[1].loadRatio - b[1].loadRatio;
    if (a[1].available !== b[1].available) return b[1].available - a[1].available;
    if (a[1].primaryCount !== b[1].primaryCount) return b[1].primaryCount - a[1].primaryCount;
    return a[0].localeCompare(b[0]);
  });

  return sorted[0]?.[0] ?? null;
}

function buildTeamAuditCandidates(
  scopedEvaluations: AgentCandidateEvaluation[],
  chosenTeamId: string | null
): HumanDispatchDecision["audit"]["candidates"] {
  const grouped = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      departmentId: string;
      departmentName: string;
      totalAgents: number;
      eligibleAgents: number;
      rejectBreakdown: Record<string, number>;
    }
  >();

  for (const candidate of scopedEvaluations) {
    const stat = grouped.get(candidate.teamId) ?? {
      teamId: candidate.teamId,
      teamName: candidate.teamName,
      departmentId: candidate.departmentId,
      departmentName: candidate.departmentName,
      totalAgents: 0,
      eligibleAgents: 0,
      rejectBreakdown: {}
    };
    stat.totalAgents += 1;
    if (candidate.eligible) {
      stat.eligibleAgents += 1;
    } else if (candidate.rejectReason) {
      stat.rejectBreakdown[candidate.rejectReason] = (stat.rejectBreakdown[candidate.rejectReason] ?? 0) + 1;
    }
    grouped.set(candidate.teamId, stat);
  }

  return [...grouped.values()]
    .sort((a, b) => a.teamName.localeCompare(b.teamName))
    .map((team) => {
      const dominantRejectReason = Object.entries(team.rejectBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const accepted = team.teamId === chosenTeamId && team.eligibleAgents > 0;
      const rejectReason = accepted
        ? null
        : team.eligibleAgents === 0
          ? dominantRejectReason ?? "team_has_no_eligible_agent"
          : "team_not_selected";

      return {
        candidateType: "team" as const,
        candidateId: team.teamId,
        candidateLabel: team.teamName,
        stage: "team_scope",
        accepted,
        rejectReason,
        details: {
          teamId: team.teamId,
          teamName: team.teamName,
          departmentId: team.departmentId,
          departmentName: team.departmentName,
          totalAgents: team.totalAgents,
          eligibleAgents: team.eligibleAgents,
          rejectBreakdown: team.rejectBreakdown
        }
      };
    });
}

async function chooseAgent(
  db: Knex | Knex.Transaction,
  tenantId: string,
  strategy: HumanDispatchDecision["strategy"],
  candidates: AgentCandidateRow[]
): Promise<AgentCandidateRow | null> {
  if (candidates.length === 0) return null;

  if (strategy === "sticky") {
    const stickyAgent = await db("queue_assignments")
      .where({ tenant_id: tenantId })
      .whereIn("assigned_agent_id", candidates.map((candidate) => candidate.agentId))
      .whereNotNull("assigned_agent_id")
      .orderBy("updated_at", "desc")
      .select("assigned_agent_id")
      .first<{ assigned_agent_id: string }>();

    if (stickyAgent?.assigned_agent_id) {
      const selected = candidates.find((candidate) => candidate.agentId === stickyAgent.assigned_agent_id);
      if (selected) return selected;
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    const aLoadRatio = a.activeAssignments / Math.max(a.maxConcurrency, 1);
    const bLoadRatio = b.activeAssignments / Math.max(b.maxConcurrency, 1);

    if (strategy === "round_robin") {
      const aLast = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bLast = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      if (aLast !== bLast) return aLast - bLast;
    } else if (strategy === "balanced_new_case") {
      const aScore = computeBalancedNewCaseScore(a);
      const bScore = computeBalancedNewCaseScore(b);
      if (aScore !== bScore) return aScore - bScore;
      if (a.todayNewCaseCount !== b.todayNewCaseCount) return a.todayNewCaseCount - b.todayNewCaseCount;
      if (a.activeAssignments !== b.activeAssignments) return a.activeAssignments - b.activeAssignments;
      if (a.reservedAssignments !== b.reservedAssignments) return a.reservedAssignments - b.reservedAssignments;
    } else {
      if (aLoadRatio !== bLoadRatio) return aLoadRatio - bLoadRatio;
      if (a.activeAssignments !== b.activeAssignments) return a.activeAssignments - b.activeAssignments;
      if (a.reservedAssignments !== b.reservedAssignments) return a.reservedAssignments - b.reservedAssignments;
    }

    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const joinedDiff = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    if (joinedDiff !== 0) return joinedDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return sorted[0] ?? null;
}

function dedupeCandidateRows(candidates: AgentCandidateEvaluation[]): AgentCandidateEvaluation[] {
  const grouped = new Map<string, AgentCandidateEvaluation>();

  for (const candidate of candidates) {
    const key = `${candidate.agentId}:${candidate.teamId}`;
    const existing = grouped.get(key);
    if (!existing || compareCandidatePreference(candidate, existing) < 0) {
      grouped.set(key, candidate);
    }
  }

  return [...grouped.values()];
}

function compareCandidatePreference(a: AgentCandidateEvaluation, b: AgentCandidateEvaluation): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.activeBreak !== b.activeBreak) return a.activeBreak ? 1 : -1;
  if (a.shiftStatus !== b.shiftStatus) return a.shiftStatus === "scheduled" ? -1 : 1;

  const aInsideShift = a.rejectReason !== "outside_shift_window";
  const bInsideShift = b.rejectReason !== "outside_shift_window";
  if (aInsideShift !== bInsideShift) return aInsideShift ? -1 : 1;

  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
}

function computeBalancedNewCaseScore(candidate: AgentCandidateRow): number {
  return (4 * candidate.todayNewCaseCount) + (2 * candidate.activeAssignments) + candidate.reservedAssignments;
}

function formatLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  return `${hour}:${minute}`;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function normalizeShiftDate(value: unknown, timezone: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return formatLocalDate(date, timezone);
}
