import type { Knex } from "knex";

export class QueueAssignmentService {
  async upsertAssignment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      departmentId: string | null;
      teamId: string | null;
      assignedAgentId: string | null;
      assignedAiAgentId?: string | null;
      strategy: string;
      priority: number;
      status: string;
      reason?: string | null;
      serviceRequestMode?: "normal" | "human_requested";
      queueMode?: "none" | "assigned_waiting" | "pending_unavailable";
      queuePosition?: number | null;
      estimatedWaitSec?: number | null;
      aiFallbackAllowed?: boolean;
      lockedHumanSide?: boolean;
    }
  ) {
    const serviceRequestMode = input.serviceRequestMode ?? "normal";
    const queueMode = input.queueMode ?? "none";
    const aiFallbackAllowed = input.aiFallbackAllowed ?? false;
    const lockedHumanSide = input.lockedHumanSide ?? false;
    const derivedHandoffRequired = serviceRequestMode === "human_requested";
    const derivedHandoffReason = derivedHandoffRequired
      ? (input.reason ?? "human_service_requested")
      : null;

    const [assignment] = await db("queue_assignments")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        department_id: input.departmentId,
        team_id: input.teamId,
        assigned_agent_id: input.assignedAgentId,
        assigned_ai_agent_id: input.assignedAiAgentId ?? null,
        assignment_strategy: input.strategy,
        priority: input.priority,
        status: input.status,
        assignment_reason: input.reason ?? null,
        handoff_required: derivedHandoffRequired,
        handoff_reason: derivedHandoffReason,
        service_request_mode: serviceRequestMode,
        queue_mode: queueMode,
        queue_position: input.queuePosition ?? null,
        estimated_wait_sec: input.estimatedWaitSec ?? null,
        ai_fallback_allowed: aiFallbackAllowed,
        locked_human_side: lockedHumanSide
      })
      .onConflict(["conversation_id"])
      .merge({
        department_id: input.departmentId,
        team_id: input.teamId,
        assigned_agent_id: input.assignedAgentId,
        assigned_ai_agent_id: input.assignedAiAgentId ?? null,
        assignment_strategy: input.strategy,
        priority: input.priority,
        status: input.status,
        assignment_reason: input.reason ?? null,
        handoff_required: derivedHandoffRequired,
        handoff_reason: derivedHandoffReason,
        service_request_mode: serviceRequestMode,
        queue_mode: queueMode,
        queue_position: input.queuePosition ?? null,
        estimated_wait_sec: input.estimatedWaitSec ?? null,
        ai_fallback_allowed: aiFallbackAllowed,
        locked_human_side: lockedHumanSide,
        updated_at: db.fn.now()
      })
      .returning(["assignment_id"]);

    await db("conversation_events").insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      event_type: "queue.assignment",
      actor_type: "system",
      payload: {
        departmentId: input.departmentId,
        teamId: input.teamId,
        assignedAgentId: input.assignedAgentId,
        assignedAiAgentId: input.assignedAiAgentId ?? null,
        status: input.status,
        reason: input.reason ?? null,
        serviceRequestMode,
        queueMode,
        queuePosition: input.queuePosition ?? null,
        estimatedWaitSec: input.estimatedWaitSec ?? null,
        aiFallbackAllowed,
        lockedHumanSide
      }
    });

    return { assignmentId: assignment.assignment_id as string };
  }
}
