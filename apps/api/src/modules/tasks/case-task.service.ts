import type { Knex } from "knex";
import { recordCaseTaskEvent, recordCaseTaskEvents, type CaseTaskEventInput } from "./case-task-event.service.js";

type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
type TaskPriority = "low" | "normal" | "high" | "urgent";

type BaseTaskRow = {
  task_id: string;
  case_id: string;
  conversation_id: string | null;
  customer_id: string | null;
  source_message_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  owner_agent_id: string | null;
  due_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  creator_type: string;
  creator_identity_id: string | null;
  creator_agent_id: string | null;
  last_commented_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  owner_name?: string | null;
  owner_employee_no?: string | null;
  creator_name?: string | null;
  creator_employee_no?: string | null;
  source_message_preview?: string | null;
  source_message_author_name?: string | null;
};

type CommentRow = {
  comment_id: string;
  task_id: string;
  body: string;
  is_internal: boolean;
  author_type: string;
  author_identity_id: string | null;
  author_agent_id: string | null;
  created_at: Date | string;
  author_name?: string | null;
  author_employee_no?: string | null;
};

type TaskListFilters = {
  status?: string | null;
  ownerAgentId?: string | null;
  from?: Date | null;
  to?: Date | null;
  search?: string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === "open" || value === "in_progress" || value === "done" || value === "cancelled") return value;
  return "open";
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") return value;
  return "normal";
}

export class CaseTaskService {
  async resolveCurrentOrLatestCaseId(
    trx: Knex.Transaction,
    tenantId: string,
    conversationId: string
  ): Promise<string | null> {
    const conversation = await trx("conversations")
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .select("current_case_id")
      .first<{ current_case_id: string | null } | undefined>();
    if (conversation?.current_case_id) return conversation.current_case_id;

    const latest = await trx("conversation_cases")
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .orderBy("opened_at", "desc")
      .orderBy("created_at", "desc")
      .select("case_id")
      .first<{ case_id: string } | undefined>();
    return latest?.case_id ?? null;
  }

  private baseTaskQuery(trx: Knex.Transaction, tenantId: string) {
    return trx("case_tasks as ct")
      .leftJoin("agent_profiles as oap", function joinOwnerAgent() {
        this.on("oap.agent_id", "=", "ct.owner_agent_id").andOn("oap.tenant_id", "=", "ct.tenant_id");
      })
      .leftJoin("tenant_memberships as otm", "otm.membership_id", "oap.membership_id")
      .leftJoin("agent_profiles as cap", function joinCreatorAgent() {
        this.on("cap.agent_id", "=", "ct.creator_agent_id").andOn("cap.tenant_id", "=", "ct.tenant_id");
      })
      .leftJoin("tenant_memberships as ctm", "ctm.membership_id", "cap.membership_id")
      .leftJoin("messages as sm", function joinSourceMessage() {
        this.on("sm.message_id", "=", "ct.source_message_id").andOn("sm.tenant_id", "=", "ct.tenant_id");
      })
      .leftJoin("agent_profiles as sap", function joinSourceAgentProfile() {
        this.on("sap.agent_id", "=", "sm.sender_id").andOn("sap.tenant_id", "=", "sm.tenant_id");
      })
      .leftJoin("tenant_memberships as stm", "stm.membership_id", "sap.membership_id")
      .leftJoin("tenant_ai_agents as sai", function joinSourceAiAgent() {
        this.on("sai.ai_agent_id", "=", "sm.sender_id").andOn("sai.tenant_id", "=", "sm.tenant_id");
      })
      .where("ct.tenant_id", tenantId)
      .select(
        "ct.task_id",
        "ct.case_id",
        "ct.conversation_id",
        "ct.customer_id",
        "ct.source_message_id",
        "ct.task_type",
        "ct.title",
        "ct.description",
        "ct.status",
        "ct.priority",
        "ct.owner_agent_id",
        "ct.due_at",
        "ct.started_at",
        "ct.completed_at",
        "ct.cancelled_at",
        "ct.creator_type",
        "ct.creator_identity_id",
        "ct.creator_agent_id",
        "ct.last_commented_at",
        "ct.created_at",
        "ct.updated_at",
        "otm.display_name as owner_name",
        "otm.employee_no as owner_employee_no",
        "ctm.display_name as creator_name",
        "ctm.employee_no as creator_employee_no",
        trx.raw("coalesce(sm.content->>'text', '') as source_message_preview"),
        trx.raw("coalesce(stm.display_name, sai.name, null) as source_message_author_name")
      );
  }

  mapTask(row: BaseTaskRow) {
    return {
      taskId: row.task_id,
      caseId: row.case_id,
      conversationId: row.conversation_id,
      customerId: row.customer_id,
      sourceMessageId: row.source_message_id,
      taskType: row.task_type,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      ownerAgentId: row.owner_agent_id,
      ownerName: row.owner_name ?? null,
      ownerEmployeeNo: row.owner_employee_no ?? null,
      dueAt: toIso(row.due_at),
      startedAt: toIso(row.started_at),
      completedAt: toIso(row.completed_at),
      cancelledAt: toIso(row.cancelled_at),
      creatorType: row.creator_type,
      creatorIdentityId: row.creator_identity_id,
      creatorAgentId: row.creator_agent_id,
      creatorName: row.creator_name ?? null,
      creatorEmployeeNo: row.creator_employee_no ?? null,
      sourceMessagePreview: row.source_message_preview ?? null,
      sourceMessageAuthorName: row.source_message_author_name ?? null,
      lastCommentedAt: toIso(row.last_commented_at),
      createdAt: toIso(row.created_at)!,
      updatedAt: toIso(row.updated_at)!
    };
  }

  mapComment(row: CommentRow) {
    return {
      commentId: row.comment_id,
      taskId: row.task_id,
      body: row.body,
      isInternal: row.is_internal,
      authorType: row.author_type,
      authorIdentityId: row.author_identity_id,
      authorAgentId: row.author_agent_id,
      authorName: row.author_name ?? null,
      authorEmployeeNo: row.author_employee_no ?? null,
      createdAt: toIso(row.created_at)!
    };
  }

  async listConversationTasks(
    trx: Knex.Transaction,
    tenantId: string,
    conversationId: string
  ) {
    const caseId = await this.resolveCurrentOrLatestCaseId(trx, tenantId, conversationId);
    if (!caseId) return { caseId: null, tasks: [] as ReturnType<CaseTaskService["mapTask"]>[] };

    const rows = await this.baseTaskQuery(trx, tenantId)
      .where("ct.case_id", caseId)
      .orderByRaw(`
        case
          when ct.status = 'open' then 0
          when ct.status = 'in_progress' then 1
          when ct.status = 'done' then 2
          else 3
        end
      `)
      .orderBy("ct.created_at", "desc");

    return { caseId, tasks: rows.map((row) => this.mapTask(row as BaseTaskRow)) };
  }

  async getConversationTaskDetail(
    trx: Knex.Transaction,
    tenantId: string,
    conversationId: string,
    taskId: string
  ) {
    const task = await this.baseTaskQuery(trx, tenantId)
      .where("ct.conversation_id", conversationId)
      .where("ct.task_id", taskId)
      .first<BaseTaskRow | undefined>();
    if (!task) return null;

    const comments = await trx("case_task_comments as ctc")
      .leftJoin("agent_profiles as ap", function joinAuthorAgent() {
        this.on("ap.agent_id", "=", "ctc.author_agent_id").andOn("ap.tenant_id", "=", "ctc.tenant_id");
      })
      .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
      .where({ "ctc.tenant_id": tenantId, "ctc.task_id": taskId })
      .orderBy("ctc.created_at", "asc")
      .select(
        "ctc.comment_id",
        "ctc.task_id",
        "ctc.body",
        "ctc.is_internal",
        "ctc.author_type",
        "ctc.author_identity_id",
        "ctc.author_agent_id",
        "ctc.created_at",
        "tm.display_name as author_name",
        "tm.employee_no as author_employee_no"
      );

    return {
      task: this.mapTask(task),
      comments: comments.map((row) => this.mapComment(row as CommentRow))
    };
  }

  async getAdminTaskDetail(
    trx: Knex.Transaction,
    tenantId: string,
    taskId: string
  ) {
    const task = await this.baseTaskQuery(trx, tenantId)
      .leftJoin("conversation_cases as cc", function joinCase() {
        this.on("cc.case_id", "=", "ct.case_id").andOn("cc.tenant_id", "=", "ct.tenant_id");
      })
      .leftJoin("customers as cu", function joinCustomer() {
        this.on("cu.customer_id", "=", "ct.customer_id").andOn("cu.tenant_id", "=", "ct.tenant_id");
      })
      .where("ct.task_id", taskId)
      .select(
        "cc.title as case_title",
        "cc.status as case_status",
        "cu.display_name as customer_name",
        "cu.external_ref as customer_ref"
      )
      .first<BaseTaskRow | undefined>();
    if (!task) return null;

    const comments = await trx("case_task_comments as ctc")
      .leftJoin("agent_profiles as ap", function joinAuthorAgent() {
        this.on("ap.agent_id", "=", "ctc.author_agent_id").andOn("ap.tenant_id", "=", "ctc.tenant_id");
      })
      .leftJoin("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
      .where({ "ctc.tenant_id": tenantId, "ctc.task_id": taskId })
      .orderBy("ctc.created_at", "asc")
      .select(
        "ctc.comment_id",
        "ctc.task_id",
        "ctc.body",
        "ctc.is_internal",
        "ctc.author_type",
        "ctc.author_identity_id",
        "ctc.author_agent_id",
        "ctc.created_at",
        "tm.display_name as author_name",
        "tm.employee_no as author_employee_no"
      );

    return {
      task: {
        ...this.mapTask(task),
        caseTitle: (task as { case_title?: string | null }).case_title ?? null,
        caseStatus: (task as { case_status?: string | null }).case_status ?? null,
        customerName: (task as { customer_name?: string | null }).customer_name ?? null,
        customerRef: (task as { customer_ref?: string | null }).customer_ref ?? null
      },
      comments: comments.map((row) => this.mapComment(row as CommentRow))
    };
  }

  async createConversationTask(
    trx: Knex.Transaction,
    input: {
      tenantId: string;
      conversationId: string;
      caseId: string;
      customerId: string | null;
      title: string;
      description?: string | null;
      priority?: string | null;
      assigneeAgentId?: string | null;
      dueAt?: string | null;
      sourceMessageId?: string | null;
      creatorType: string;
      creatorIdentityId: string | null;
      creatorAgentId: string | null;
    }
  ) {
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    const now = new Date();
    const [created] = await trx("case_tasks")
      .insert({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        conversation_id: input.conversationId,
        customer_id: input.customerId,
        source_message_id: input.sourceMessageId ?? null,
        title: input.title,
        description: input.description?.trim() || null,
        status: "open",
        priority: normalizeTaskPriority(input.priority),
        owner_agent_id: input.assigneeAgentId ?? null,
        due_at: dueAt,
        creator_type: input.creatorType,
        creator_identity_id: input.creatorIdentityId,
        creator_agent_id: input.creatorAgentId
      })
      .returning(["task_id"]);

    const taskId = (created as { task_id: string }).task_id;

    await trx("case_task_comments").insert({
      tenant_id: input.tenantId,
      task_id: taskId,
      body: "任务已创建",
      is_internal: true,
      author_type: input.creatorType,
      author_identity_id: input.creatorIdentityId,
      author_agent_id: input.creatorAgentId
    });

    await trx("case_tasks")
      .where({ tenant_id: input.tenantId, task_id: taskId })
      .update({ last_commented_at: now, updated_at: now });

    // ── Audit event ──
    await recordCaseTaskEvent(trx, {
      tenantId: input.tenantId,
      taskId,
      eventType: "created",
      toValue: "open",
      actorType: input.creatorType as "agent" | "admin" | "ai" | "system",
      actorId: input.creatorAgentId ?? input.creatorIdentityId ?? null,
      metadata: {
        title: input.title,
        priority: normalizeTaskPriority(input.priority),
        assigneeAgentId: input.assigneeAgentId ?? null
      }
    });

    return taskId;
  }

  async patchTask(
    trx: Knex.Transaction,
    input: {
      tenantId: string;
      taskId: string;
      status?: string | null;
      priority?: string | null;
      assigneeAgentId?: string | null;
      dueAt?: string | null;
      actorType?: "agent" | "admin" | "ai" | "system";
      actorId?: string | null;
    }
  ) {
    // Read current state for audit events
    const current = await trx("case_tasks")
      .where({ tenant_id: input.tenantId, task_id: input.taskId })
      .select("status", "priority", "owner_agent_id")
      .first<{ status: string; priority: string; owner_agent_id: string | null } | undefined>();

    const patch: Record<string, unknown> = {};
    const events: CaseTaskEventInput[] = [];
    const actor = input.actorType ?? "system";
    const actorId = input.actorId ?? null;

    if (input.status !== undefined) {
      const status = normalizeTaskStatus(input.status);
      patch.status = status;
      if (status === "in_progress") {
        patch.started_at = trx.fn.now();
        patch.cancelled_at = null;
      }
      if (status === "done") {
        patch.completed_at = trx.fn.now();
        patch.cancelled_at = null;
      }
      if (status === "cancelled") {
        patch.cancelled_at = trx.fn.now();
      }
      if (current && current.status !== status) {
        events.push({
          tenantId: input.tenantId, taskId: input.taskId,
          eventType: "status_changed",
          fromValue: current.status, toValue: status,
          actorType: actor, actorId
        });
      }
    }
    if (input.priority !== undefined) {
      const priority = normalizeTaskPriority(input.priority);
      patch.priority = priority;
      if (current && current.priority !== priority) {
        events.push({
          tenantId: input.tenantId, taskId: input.taskId,
          eventType: "priority_changed",
          fromValue: current.priority, toValue: priority,
          actorType: actor, actorId
        });
      }
    }
    if (input.assigneeAgentId !== undefined) {
      patch.owner_agent_id = input.assigneeAgentId;
      const oldOwner = current?.owner_agent_id ?? null;
      if (oldOwner !== input.assigneeAgentId) {
        if (oldOwner) {
          events.push({
            tenantId: input.tenantId, taskId: input.taskId,
            eventType: "unassigned",
            fromValue: oldOwner,
            actorType: actor, actorId
          });
        }
        if (input.assigneeAgentId) {
          events.push({
            tenantId: input.tenantId, taskId: input.taskId,
            eventType: "assigned",
            toValue: input.assigneeAgentId,
            actorType: actor, actorId
          });
        }
      }
    }
    if (input.dueAt !== undefined) patch.due_at = input.dueAt ? new Date(input.dueAt) : null;
    if (Object.keys(patch).length === 0) return;
    patch.updated_at = trx.fn.now();

    await trx("case_tasks")
      .where({ tenant_id: input.tenantId, task_id: input.taskId })
      .update(patch);

    // ── Audit events ──
    await recordCaseTaskEvents(trx, events);
  }

  async addComment(
    trx: Knex.Transaction,
    input: {
      tenantId: string;
      taskId: string;
      body: string;
      authorType: string;
      authorIdentityId: string | null;
      authorAgentId: string | null;
    }
  ) {
    const now = new Date();
    await trx("case_task_comments").insert({
      tenant_id: input.tenantId,
      task_id: input.taskId,
      body: input.body,
      is_internal: true,
      author_type: input.authorType,
      author_identity_id: input.authorIdentityId,
      author_agent_id: input.authorAgentId
    });

    await trx("case_tasks")
      .where({ tenant_id: input.tenantId, task_id: input.taskId })
      .update({ last_commented_at: now, updated_at: now });

    // ── Audit event ──
    await recordCaseTaskEvent(trx, {
      tenantId: input.tenantId,
      taskId: input.taskId,
      eventType: "comment_added",
      actorType: input.authorType as "agent" | "admin" | "ai" | "system",
      actorId: input.authorAgentId ?? input.authorIdentityId ?? null,
      metadata: { bodyPreview: input.body.slice(0, 100) }
    });
  }

  async listAdminTasks(
    trx: Knex.Transaction,
    tenantId: string,
    filters: TaskListFilters
  ) {
    const query = this.baseTaskQuery(trx, tenantId)
      .leftJoin("conversation_cases as cc", function joinCase() {
        this.on("cc.case_id", "=", "ct.case_id").andOn("cc.tenant_id", "=", "ct.tenant_id");
      })
      .leftJoin("customers as cu", function joinCustomer() {
        this.on("cu.customer_id", "=", "ct.customer_id").andOn("cu.tenant_id", "=", "ct.tenant_id");
      })
      .select(
        "cc.title as case_title",
        "cc.status as case_status",
        "cu.display_name as customer_name",
        "cu.external_ref as customer_ref"
      );

    if (filters.status) query.where("ct.status", filters.status);
    if (filters.ownerAgentId) query.where("ct.owner_agent_id", filters.ownerAgentId);
    if (filters.from) query.where("ct.created_at", ">=", filters.from);
    if (filters.to) query.where("ct.created_at", "<=", filters.to);
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`;
      query.where((builder) => {
        builder
          .whereILike("ct.title", q)
          .orWhereILike("ct.description", q)
          .orWhereILike("cc.title", q)
          .orWhereILike("cu.display_name", q)
          .orWhereILike("cu.external_ref", q);
      });
    }

    const rows = await query
      .orderByRaw(`
        case
          when ct.status = 'open' then 0
          when ct.status = 'in_progress' then 1
          when ct.status = 'done' then 2
          else 3
        end
      `)
      .orderBy("ct.due_at", "asc")
      .orderBy("ct.created_at", "desc");

    return rows.map((row) => ({
      ...this.mapTask(row as BaseTaskRow),
      caseTitle: (row as { case_title?: string | null }).case_title ?? null,
      caseStatus: (row as { case_status?: string | null }).case_status ?? null,
      customerName: (row as { customer_name?: string | null }).customer_name ?? null,
      customerRef: (row as { customer_ref?: string | null }).customer_ref ?? null
    }));
  }
}
