import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { slaQueue, type SlaJobPayload } from "../../infra/queue/queues.js";
import { trackEvent } from "../analytics/analytics.service.js";

// ─── SLA deadline helpers ─────────────────────────────────────────────────────

const SLA_HOURS: Record<string, number> = {
  urgent: 1,
  high: 4,
  normal: 8,
  low: 24
};

function computeSlaDeadline(priority: string): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.normal;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function computeSlaStatus(slaDeadlineAt: string | null, resolvedAt: string | null, status: string): string {
  if (!slaDeadlineAt) return "none";
  const deadline = new Date(slaDeadlineAt).getTime();

  if (resolvedAt || status === "resolved" || status === "closed") {
    const resolved = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
    return resolved <= deadline ? "met" : "breached";
  }

  const now = Date.now();
  if (now > deadline) return "breached";
  if (now > deadline - 60 * 60 * 1000) return "warning"; // < 1 hr left
  return "ok";
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

function requireAuth(app: FastifyInstance, req: { auth?: { sub: string; tenantId: string; agentId?: string | null } }) {
  if (!req.auth) throw app.httpErrors.unauthorized("Access token required");
  return req.auth;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function ticketRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    if (req.method === "OPTIONS") return;
    requireAuth(app, req);
  });

  // ── POST /api/conversations/:conversationId/tickets ───────────────────────────
  // Create a ticket linked to a conversation.
  app.post("/api/conversations/:conversationId/tickets", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };
    const body = (req.body as {
      title?: string;
      description?: string;
      priority?: string;
      assigneeId?: string;
    }) ?? {};

    if (!body.title?.trim()) throw app.httpErrors.badRequest("title is required");

    const priority = ["urgent", "high", "normal", "low"].includes(body.priority ?? "")
      ? (body.priority as string)
      : "normal";
    const slaDeadline = computeSlaDeadline(priority);

    const formatted = await withTenantTransaction(tenantId, async (trx) => {
      // Verify conversation belongs to this tenant
      const conv = await trx("conversations")
        .where({ tenant_id: tenantId, conversation_id: conversationId })
        .select("conversation_id", "current_case_id")
        .first<{ conversation_id: string; current_case_id: string | null } | undefined>();
      if (!conv) throw app.httpErrors.notFound("Conversation not found");

      const caseId = conv.current_case_id ?? await resolveLatestCaseId(trx, tenantId, conversationId);
      if (!caseId) throw app.httpErrors.badRequest("Conversation has no case to attach ticket");

      const [ticket] = await trx("tickets")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          case_id: caseId,
          title: body.title!.trim(),
          description: body.description?.trim() ?? null,
          status: "open",
          priority,
          assignee_id: body.assigneeId ?? null,
          sla_deadline_at: slaDeadline,
          created_by_type: auth.agentId ? "agent" : "system",
          created_by_id: auth.sub
        })
        .returning("*");

      // ── Audit event: created ───────────────────────────────────────────────
      await trx("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: (ticket as RawTicketRow).ticket_id,
        event_type: "created",
        to_value: "open",
        actor_type: auth.agentId ? "agent" : "system",
        actor_id: auth.sub,
        metadata: JSON.stringify({ priority, slaDeadlineAt: slaDeadline.toISOString() })
      });

      return formatTicket(ticket as RawTicketRow);
    });

    // ── Schedule SLA BullMQ jobs (outside transaction to avoid blocking) ────
    const slaDeadlineMs = new Date(formatted.slaDeadlineAt!).getTime();
    const nowMs = Date.now();
    const warningDelayMs = slaDeadlineMs - nowMs - 60 * 60 * 1000; // 1 h before breach
    const breachDelayMs  = slaDeadlineMs - nowMs;

    const basePayload: Omit<SlaJobPayload, "alertType"> = {
      tenantId,
      ticketId: formatted.ticketId,
      slaDeadlineAt: formatted.slaDeadlineAt!
    };

    if (warningDelayMs > 5 * 60 * 1000) {
      // Only schedule warning job if there's more than 5 min until the warning fires
      await slaQueue.add("sla.warning", { ...basePayload, alertType: "warning" }, {
        delay: warningDelayMs,
        jobId: `sla-warning-${formatted.ticketId}`,
        removeOnComplete: 50,
        removeOnFail: 20
      });
    }

    if (breachDelayMs > 0) {
      await slaQueue.add("sla.breach", { ...basePayload, alertType: "breach" }, {
        delay: breachDelayMs,
        jobId: `sla-breach-${formatted.ticketId}`,
        removeOnComplete: 50,
        removeOnFail: 20
      });
    }

    trackEvent({
      eventType: "ticket_created",
      tenantId,
      conversationId,
      caseId: formatted.caseId ?? null,
      payload: { ticketId: formatted.ticketId, priority }
    });

    return formatted;
  });

  // ── GET /api/conversations/:conversationId/tickets ────────────────────────────
  // List all tickets linked to a conversation.
  app.get("/api/conversations/:conversationId/tickets", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const caseId = await resolveConversationCaseScope(trx, tenantId, conversationId);
      if (!caseId) return { tickets: [] };

      const rows = await trx("tickets")
        .where({ tenant_id: tenantId, case_id: caseId })
        .orderBy("created_at", "desc")
        .select("*");

      return { tickets: (rows as RawTicketRow[]).map(formatTicket) };
    });
  });

  // ── PATCH /api/tickets/:ticketId ──────────────────────────────────────────────
  // Update ticket status, priority, or assignee.
  app.patch("/api/tickets/:ticketId", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { ticketId } = req.params as { ticketId: string };
    const body = (req.body as {
      status?: string;
      priority?: string;
      assigneeId?: string | null;
      note?: string; // optional internal note to record alongside the change
    }) ?? {};

    const validStatuses = ["open", "in_progress", "pending_customer", "resolved", "closed"];
    const validPriorities = ["urgent", "high", "normal", "low"];

    if (body.status && !validStatuses.includes(body.status)) {
      throw app.httpErrors.badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
    if (body.priority && !validPriorities.includes(body.priority)) {
      throw app.httpErrors.badRequest(`Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("tickets")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .select("*")
        .first<RawTicketRow>();

      if (!existing) throw app.httpErrors.notFound("Ticket not found");

      const patch: Record<string, unknown> = { updated_at: trx.fn.now() };

      if (body.status) {
        patch.status = body.status;
        if (body.status === "resolved" && !existing.resolved_at) {
          patch.resolved_at = trx.fn.now();
        }
        if (body.status === "closed" && !existing.closed_at) {
          patch.closed_at = trx.fn.now();
        }
      }

      if (body.priority) {
        patch.priority = body.priority;
        // Recalculate SLA deadline if priority changes and ticket isn't resolved yet
        if (!existing.resolved_at && !existing.closed_at) {
          patch.sla_deadline_at = computeSlaDeadline(body.priority);
        }
      }

      if ("assigneeId" in body) {
        patch.assignee_id = body.assigneeId ?? null;
      }

      const [updated] = await trx("tickets")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .update(patch)
        .returning("*");

      const actorType = auth.agentId ? "agent" : "system";
      const actorId = auth.sub;

      // ── Audit events for each changed dimension ────────────────────────────
      if (body.status && body.status !== existing.status) {
        await trx("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: "status_changed",
          from_value: existing.status,
          to_value: body.status,
          actor_type: actorType,
          actor_id: actorId,
          metadata: JSON.stringify({})
        });
      }

      if (body.priority && body.priority !== existing.priority) {
        await trx("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: "priority_changed",
          from_value: existing.priority,
          to_value: body.priority,
          actor_type: actorType,
          actor_id: actorId,
          metadata: JSON.stringify({})
        });
      }

      if ("assigneeId" in body) {
        const isAssign = body.assigneeId != null;
        await trx("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: isAssign ? "assigned" : "unassigned",
          from_value: existing.assignee_id ?? undefined,
          to_value: body.assigneeId ?? undefined,
          actor_type: actorType,
          actor_id: actorId,
          metadata: JSON.stringify({})
        });
      }

      // Optionally record a note with the change
      if (body.note?.trim()) {
        await trx("ticket_notes").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          body: body.note.trim(),
          is_internal: true,
          author_type: actorType,
          author_id: actorId
        });
        await trx("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: "note_added",
          actor_type: actorType,
          actor_id: actorId,
          metadata: JSON.stringify({ preview: body.note.trim().slice(0, 100) })
        });
      }

      const result = formatTicket(updated as RawTicketRow);

      // Analytics: fire-and-forget when ticket transitions to resolved
      if (body.status === "resolved" && existing.status !== "resolved") {
        trackEvent({
          eventType: "ticket_resolved",
          tenantId,
          conversationId: existing.conversation_id ?? undefined,
          caseId: existing.case_id ?? null,
          payload: { ticketId }
        });
      }

      return result;
    });
  });

  // ── POST /api/tickets/:ticketId/notes ─────────────────────────────────────────
  // Add a note to a ticket.
  app.post("/api/tickets/:ticketId/notes", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { ticketId } = req.params as { ticketId: string };
    const body = (req.body as { body?: string; isInternal?: boolean }) ?? {};

    if (!body.body?.trim()) throw app.httpErrors.badRequest("body is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const ticket = await trx("tickets")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .select("ticket_id")
        .first();
      if (!ticket) throw app.httpErrors.notFound("Ticket not found");

      const actorType = auth.agentId ? "agent" : "system";
      const actorId = auth.sub;

      const [note] = await trx("ticket_notes")
        .insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          body: body.body!.trim(),
          is_internal: body.isInternal !== false, // default true
          author_type: actorType,
          author_id: actorId
        })
        .returning("*");

      // Audit event for the note
      await trx("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: ticketId,
        event_type: "note_added",
        actor_type: actorType,
        actor_id: actorId,
        metadata: JSON.stringify({
          preview: body.body!.trim().slice(0, 100),
          isInternal: body.isInternal !== false
        })
      });

      return formatNote(note as RawNoteRow);
    });
  });

  // ── GET /api/tickets/:ticketId/notes ──────────────────────────────────────────
  // Get all notes for a ticket.
  app.get("/api/tickets/:ticketId/notes", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { ticketId } = req.params as { ticketId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const ticket = await trx("tickets")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .select("ticket_id")
        .first();
      if (!ticket) throw app.httpErrors.notFound("Ticket not found");

      const notes = await trx("ticket_notes")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .orderBy("created_at", "asc")
        .select("*");

      return { notes: (notes as RawNoteRow[]).map(formatNote) };
    });
  });

  // ── GET /api/tickets/:ticketId/events ─────────────────────────────────────────
  // Get the full audit-log event timeline for a ticket (newest first).
  app.get("/api/tickets/:ticketId/events", async (req) => {
    const auth = requireAuth(app, req);
    const tenantId = auth.tenantId;
    const { ticketId } = req.params as { ticketId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const ticket = await trx("tickets")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .select("ticket_id")
        .first();
      if (!ticket) throw app.httpErrors.notFound("Ticket not found");

      const events = await trx("ticket_events")
        .where({ tenant_id: tenantId, ticket_id: ticketId })
        .orderBy("created_at", "asc")
        .select("*");

      return {
        events: (events as RawTicketEventRow[]).map(formatTicketEvent)
      };
    });
  });
}

// ─── Row shape types ──────────────────────────────────────────────────────────

type RawTicketRow = {
  ticket_id: string;
  tenant_id: string;
  conversation_id: string | null;
  case_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  sla_deadline_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_by_type: string;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
};

type RawNoteRow = {
  note_id: string;
  tenant_id: string;
  ticket_id: string;
  body: string;
  is_internal: boolean;
  author_type: string;
  author_id: string | null;
  created_at: string;
};

function formatTicket(row: RawTicketRow) {
  return {
    ticketId: row.ticket_id,
    conversationId: row.conversation_id,
    caseId: row.case_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    slaDeadlineAt: row.sla_deadline_at ? new Date(row.sla_deadline_at).toISOString() : null,
    slaStatus: computeSlaStatus(row.sla_deadline_at, row.resolved_at, row.status),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    createdByType: row.created_by_type,
    createdById: row.created_by_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function resolveConversationCaseScope(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const conversation = await trx("conversations")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();

  if (!conversation) throw new Error("Conversation not found");
  return conversation.current_case_id ?? resolveLatestCaseId(trx, tenantId, conversationId);
}

async function resolveLatestCaseId(
  trx: Knex.Transaction,
  tenantId: string,
  conversationId: string
) {
  const row = await trx("conversation_cases")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .orderByRaw("CASE WHEN status IN ('open','in_progress','waiting_customer','waiting_internal') THEN 0 ELSE 1 END")
    .orderBy("last_activity_at", "desc")
    .orderBy("opened_at", "desc")
    .select("case_id")
    .first<{ case_id: string } | undefined>();

  return row?.case_id ?? null;
}

function formatNote(row: RawNoteRow) {
  return {
    noteId: row.note_id,
    ticketId: row.ticket_id,
    body: row.body,
    isInternal: row.is_internal,
    authorType: row.author_type,
    authorId: row.author_id,
    createdAt: new Date(row.created_at).toISOString()
  };
}

type RawTicketEventRow = {
  event_id: string;
  tenant_id: string;
  ticket_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  actor_type: string;
  actor_id: string | null;
  metadata: unknown;
  created_at: string;
};

function formatTicketEvent(row: RawTicketEventRow) {
  return {
    eventId: row.event_id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    fromValue: row.from_value ?? null,
    toValue: row.to_value ?? null,
    actorType: row.actor_type,
    actorId: row.actor_id ?? null,
    metadata: typeof row.metadata === "string"
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at).toISOString()
  };
}
