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
        service_request_mode: input.serviceRequestMode ?? "normal",
        queue_mode: input.queueMode ?? "none",
        queue_position: input.queuePosition ?? null,
        estimated_wait_sec: input.estimatedWaitSec ?? null,
        ai_fallback_allowed: input.aiFallbackAllowed ?? false,
        locked_human_side: input.lockedHumanSide ?? false
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
        service_request_mode: input.serviceRequestMode ?? "normal",
        queue_mode: input.queueMode ?? "none",
        queue_position: input.queuePosition ?? null,
        estimated_wait_sec: input.estimatedWaitSec ?? null,
        ai_fallback_allowed: input.aiFallbackAllowed ?? false,
        locked_human_side: input.lockedHumanSide ?? false,
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
        serviceRequestMode: input.serviceRequestMode ?? "normal",
        queueMode: input.queueMode ?? "none",
        queuePosition: input.queuePosition ?? null,
        estimatedWaitSec: input.estimatedWaitSec ?? null,
        aiFallbackAllowed: input.aiFallbackAllowed ?? false,
        lockedHumanSide: input.lockedHumanSide ?? false
      }
    });

    return { assignmentId: assignment.assignment_id as string };
  }
}
