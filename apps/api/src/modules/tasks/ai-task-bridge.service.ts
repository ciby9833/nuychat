/**
 * AI ↔ Task Bridge Service
 *
 * Phase D: 打通 AI 与 case_task 体系。
 *
 * 当 AI 座席成功执行 capability script 后，自动生成一条
 * case_task（status="done"），让座席工作台看到"AI 做了什么"。
 *
 * 同样，当 skills/assist（人工触发）执行完毕后也可调用此桥接。
 */

import type { Knex } from "knex";
import { recordCaseTaskEvent } from "./case-task-event.service.js";

export interface AutoTaskInput {
  tenantId: string;
  conversationId: string;
  caseId: string | null;
  customerId: string | null;
  /** The script/tool name that was executed */
  skillName: string;
  /** Execution arguments */
  args: Record<string, unknown>;
  /** Summarized result for the task title */
  resultSummary: string;
  /** Creator type — "ai" for orchestrator, "agent" for skills/assist */
  creatorType: "ai" | "agent";
  /** Creator ID — ai_agent_id or agent_id */
  creatorId: string | null;
}

/**
 * Create a completed case_task recording an AI or agent skill execution.
 * Returns the task_id, or null if no case context is available.
 */
export async function recordSkillExecutionAsTask(
  trx: Knex | Knex.Transaction,
  input: AutoTaskInput
): Promise<string | null> {
  // No case → no task (tasks must belong to a case)
  if (!input.caseId) return null;

  const title = `[${input.creatorType === "ai" ? "AI" : "Agent"}] ${input.skillName}: ${input.resultSummary}`.slice(0, 200);

  const [created] = await trx("case_tasks")
    .insert({
      tenant_id: input.tenantId,
      case_id: input.caseId,
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      task_type: "skill_execution",
      title,
      description: Object.keys(input.args).length > 0
        ? `Args: ${JSON.stringify(input.args)}`.slice(0, 500)
        : null,
      status: "done",
      priority: "normal",
      completed_at: trx.fn.now(),
      creator_type: input.creatorType,
      creator_identity_id: input.creatorType === "ai" ? input.creatorId : null,
      creator_agent_id: input.creatorType === "agent" ? input.creatorId : null
    })
    .returning(["task_id"]);

  const taskId = (created as { task_id: string }).task_id;

  // Record audit events: created + ai_completed
  await recordCaseTaskEvent(trx, {
    tenantId: input.tenantId,
    taskId,
    eventType: "created",
    toValue: "done",
    actorType: input.creatorType,
    actorId: input.creatorId,
    metadata: { skillName: input.skillName, autoCompleted: true }
  });

  await recordCaseTaskEvent(trx, {
    tenantId: input.tenantId,
    taskId,
    eventType: "ai_completed",
    toValue: input.resultSummary.slice(0, 200),
    actorType: input.creatorType,
    actorId: input.creatorId,
    metadata: { skillName: input.skillName, args: input.args }
  });

  return taskId;
}
