export type OwnershipTransition =
  | {
      type: "preserve_existing_owner";
      tenantId: string;
      conversationId: string;
      caseId: string | null;
      segmentId: string | null;
      agentId: string;
    }
  | {
      type: "assign_human_queue";
      tenantId: string;
      conversationId: string;
      caseId: string | null;
      assignedAgentId: string | null;
      conversationStatus: "queued" | "open" | "human_active";
    }
  | {
      type: "assign_ai_pending";
      tenantId: string;
      conversationId: string;
      caseId: string | null;
      conversationStatus: "open" | "queued";
    }
  | {
      type: "activate_human_owner";
      tenantId: string;
      conversationId: string;
      customerId: string;
      caseId: string;
      agentId: string;
      reason: string;
      caseStatus: "in_progress" | "waiting_customer";
      conversationStatus?: "human_active";
    }
  | {
      type: "activate_ai_owner";
      tenantId: string;
      conversationId: string;
      customerId: string;
      caseId: string;
      aiAgentId: string;
      reason: string;
      caseStatus: "in_progress" | "waiting_customer";
      conversationStatus?: "bot_active" | "open";
    }
  | {
      type: "release_to_queue";
      tenantId: string;
      conversationId: string;
      customerId: string;
      caseId: string | null;
      reason: string;
      assignedAgentId?: string | null;
      conversationStatus: "queued" | "open";
    }
  | {
      type: "resolve_conversation";
      tenantId: string;
      conversationId: string;
      status: "resolved" | "closed";
      finalOwnerType?: "system" | "ai" | "agent" | null;
      finalOwnerId?: string | null;
      resolvedByAgentId?: string | null;
    };
