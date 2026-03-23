/**
 * SLA Worker
 *
 * Processes delayed jobs from the `sla` queue.  Two job types:
 *
 *   • "warning" — fires ~1 h before a ticket's SLA deadline.
 *     If the ticket is still open / in_progress, inserts a sla_warning
 *     ticket_event and emits ticket.sla_warning via the realtime bus.
 *
 *   • "breach" — fires at the SLA deadline.
 *     If the ticket is still open / in_progress / pending_customer,
 *     inserts a sla_breached ticket_event and emits ticket.sla_breached.
 *
 * Jobs are scheduled by ticket.routes.ts when a ticket is created.
 * Both job types are idempotent: if the ticket has already been resolved
 * or closed, the job becomes a no-op.
 */

import { Worker } from "bullmq";

import { withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { slaQueue, type SlaJobPayload } from "../infra/queue/queues.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";

const OPEN_STATUSES = new Set(["open", "in_progress", "pending_customer"]);

export function createSlaWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<SlaJobPayload>(
    slaQueue.name,
    async (job) => {
      const { tenantId, ticketId, alertType, slaDeadlineAt } = job.data;

      const result = await withTenantTransaction(tenantId, async (trx) => {
        // Re-read the ticket inside the transaction to get the latest state
        const ticket = await trx("tickets")
          .where({ tenant_id: tenantId, ticket_id: ticketId })
          .select("ticket_id", "conversation_id", "case_id", "title", "priority", "status", "resolved_at", "closed_at")
          .first<{
            ticket_id: string;
            conversation_id: string | null;
            case_id: string | null;
            title: string;
            priority: string;
            status: string;
            resolved_at: string | null;
            closed_at: string | null;
          }>();

        if (!ticket) {
          // Ticket deleted — nothing to do
          return { skipped: true, reason: "ticket_not_found" };
        }

        if (!OPEN_STATUSES.has(ticket.status)) {
          // Already resolved or closed — no SLA action needed
          return { skipped: true, reason: `already_${ticket.status}` };
        }

        const eventType = alertType === "warning" ? "sla_warning" : "sla_breached";

        // Insert the audit event (idempotency: unique index not enforced here,
        // but the job is only scheduled once at ticket creation so duplicates
        // are unlikely in practice)
        await trx("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: eventType,
          actor_type: "system",
          actor_id: null,
          metadata: JSON.stringify({ slaDeadlineAt, alertType })
        });

        return {
          skipped: false,
          eventType,
          ticket: {
            ticketId: ticket.ticket_id,
            conversationId: ticket.conversation_id,
            caseId: ticket.case_id,
            title: ticket.title,
            priority: ticket.priority
          }
        };
      });

      if (result.skipped) {
        return result;
      }

      // Emit realtime event so the agent workspace can show a live SLA alert
      const occurredAt = new Date().toISOString();
      const payload = {
        tenantId,
        ticketId,
        conversationId: result.ticket!.conversationId,
        caseId: result.ticket!.caseId,
        title: result.ticket!.title,
        priority: result.ticket!.priority,
        slaDeadlineAt,
        occurredAt
      };

      if (alertType === "warning") {
        realtimeEventBus.emitEvent("ticket.sla_warning", payload);
      } else {
        realtimeEventBus.emitEvent("ticket.sla_breached", payload);
      }

      return result;
    },
    {
      connection: workerConnection,
      concurrency: 5
    }
  );
}
