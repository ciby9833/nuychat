import type { Knex } from "knex";

import type { RoutingContext } from "./types.js";

export class RoutingContextService {
  async build(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      channelType: string;
      channelId: string;
    }
  ): Promise<RoutingContext> {
    const [tenant, customer, conversation, assignment, intelligence] = await Promise.all([
      db("tenants").where({ tenant_id: input.tenantId }).select("operating_mode").first<{ operating_mode: string | null } | undefined>(),
      db("customers")
        .where({ tenant_id: input.tenantId, customer_id: input.customerId })
        .select("language", "tier", "tags")
        .first<{ language: string | null; tier: string | null; tags: unknown } | undefined>(),
      db("conversations")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .select("status", "assigned_agent_id", "current_handler_type", "current_handler_id", "current_segment_id", "current_case_id", "last_message_preview")
        .first<{
          status: string;
          assigned_agent_id: string | null;
          current_handler_type: string | null;
          current_handler_id: string | null;
          current_segment_id: string | null;
          current_case_id: string | null;
          last_message_preview: string | null;
        } | undefined>(),
      db("queue_assignments")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .select("module_id", "skill_group_id", "department_id", "team_id", "assigned_agent_id", "assignment_strategy", "priority", "status")
        .first<{
          module_id: string | null;
          skill_group_id: string | null;
          department_id: string | null;
          team_id: string | null;
          assigned_agent_id: string | null;
          assignment_strategy: "round_robin" | "least_busy" | "sticky" | null;
          priority: number | null;
          status: string | null;
        } | undefined>(),
      db("conversation_memory_snapshots")
        .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
        .select("summary", "intent", "sentiment")
        .first<{
          summary: string | null;
          intent: string | null;
          sentiment: string | null;
        } | undefined>()
    ]);

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.conversationId}`);
    }
    if (!conversation.current_case_id) {
      throw new Error(`Conversation has no current case: ${input.conversationId}`);
    }
    const currentCase = await db("conversation_cases")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        case_id: conversation.current_case_id
      })
      .select("case_id", "status", "case_type", "title", "summary", "current_owner_type", "current_owner_id")
      .first<{
        case_id: string;
        status: string;
        case_type: string | null;
        title: string | null;
        summary: string | null;
        current_owner_type: string | null;
        current_owner_id: string | null;
      } | undefined>();
    if (!currentCase || currentCase.case_id !== conversation.current_case_id) {
      throw new Error(`Current case not found for conversation: ${input.conversationId}`);
    }

    return {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      caseId: currentCase.case_id,
      segmentId: conversation.current_segment_id ?? null,
      channelType: input.channelType,
      channelId: input.channelId,
      operatingMode: tenant?.operating_mode ?? "human_first",
      customerLanguage: customer?.language ?? null,
      customerTier: customer?.tier ?? null,
      issueSummary: {
        caseType: currentCase.case_type ?? null,
        caseStatus: currentCase.status,
        caseTitle: currentCase.title ?? null,
        lastMessagePreview: conversation.last_message_preview ?? null,
        latestSummary: currentCase.summary ?? intelligence?.summary ?? null,
        lastIntent: intelligence?.intent ?? null,
        lastSentiment: intelligence?.sentiment ?? null,
        customerTags: parseStringArray(customer?.tags)
      },
      conversationStatus: conversation.status,
      caseStatus: currentCase.status,
      currentHandlerType: mapCaseOwnerType(currentCase.current_owner_type) ?? conversation.current_handler_type ?? null,
      currentHandlerId: currentCase.current_owner_id ?? conversation.current_handler_id ?? null,
      assignedAgentId: conversation.assigned_agent_id ?? null,
      preserveHumanOwner: currentCase.current_owner_type === "agent" && conversation.status === "human_active" && Boolean(conversation.assigned_agent_id),
      existingAssignment: assignment
        ? {
            moduleId: assignment.module_id ?? null,
            skillGroupId: assignment.skill_group_id ?? null,
            departmentId: assignment.department_id ?? null,
            teamId: assignment.team_id ?? null,
            assignedAgentId: assignment.assigned_agent_id ?? null,
            assignmentStrategy: assignment.assignment_strategy ?? null,
            priority: assignment.priority ?? null,
            status: assignment.status ?? null
          }
        : null
    };
  }
}

function mapCaseOwnerType(value: string | null): "system" | "ai" | "human" | null {
  if (value === "system" || value === "ai") return value;
  if (value === "agent") return "human";
  return null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}
