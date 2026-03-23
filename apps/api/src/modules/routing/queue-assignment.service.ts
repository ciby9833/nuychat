import type { Knex } from "knex";

export class QueueAssignmentService {
  async upsertAssignment(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      moduleId: string | null;
      skillGroupId: string | null;
      departmentId: string | null;
      teamId: string | null;
      assignedAgentId: string | null;
      assignedAiAgentId?: string | null;
      strategy: string;
      priority: number;
      status: string;
      reason?: string | null;
    }
  ) {
    const [assignment] = await db("queue_assignments")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        module_id: input.moduleId,
        skill_group_id: input.skillGroupId,
        department_id: input.departmentId,
        team_id: input.teamId,
        assigned_agent_id: input.assignedAgentId,
        assigned_ai_agent_id: input.assignedAiAgentId ?? null,
        assignment_strategy: input.strategy,
        priority: input.priority,
        status: input.status,
        assignment_reason: input.reason ?? null
      })
      .onConflict(["conversation_id"])
      .merge({
        module_id: input.moduleId,
        skill_group_id: input.skillGroupId,
        department_id: input.departmentId,
        team_id: input.teamId,
        assigned_agent_id: input.assignedAgentId,
        assigned_ai_agent_id: input.assignedAiAgentId ?? null,
        assignment_strategy: input.strategy,
        priority: input.priority,
        status: input.status,
        assignment_reason: input.reason ?? null,
        updated_at: db.fn.now()
      })
      .returning(["assignment_id"]);

    await db("conversation_events").insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      event_type: "queue.assignment",
      actor_type: "system",
      payload: {
        moduleId: input.moduleId,
        skillGroupId: input.skillGroupId,
        departmentId: input.departmentId,
        teamId: input.teamId,
        assignedAgentId: input.assignedAgentId,
        assignedAiAgentId: input.assignedAiAgentId ?? null,
        status: input.status,
        reason: input.reason ?? null
      }
    });

    return { assignmentId: assignment.assignment_id as string };
  }
}
