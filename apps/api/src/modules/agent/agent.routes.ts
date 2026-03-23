/**
 * Agent self-management routes.
 *
 * These endpoints are called by the agent workspace (not the admin UI).
 * Auth: any authenticated identity with an agentId in their token.
 *
 * POST /api/agent/heartbeat — called every 30 s to update connection liveness
 * POST /api/agent/activity  — called on real operator interaction
 * PATCH /api/agent/status   — manually set own availability intent
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import type { AccessPayload } from "../auth/auth-session.service.js";
import { PresenceService } from "./presence.service.js";

const VALID_STATUSES = ["online", "busy", "away", "offline"] as const;
type AgentStatus = (typeof VALID_STATUSES)[number];

export async function agentRoutes(app: FastifyInstance) {
  const presenceService = new PresenceService();

  // Require authenticated agent on all routes
  app.addHook("preHandler", async (req) => {
    if (req.method === "OPTIONS") return;
    if (!req.auth) {
      throw app.httpErrors.unauthorized("Access token required");
    }
  });

  /**
   * POST /api/agent/heartbeat
   * Updates connection liveness. Optionally accepts { status } to update the manual status.
   * Called every 30 seconds by the agent workspace.
   */
  app.post("/api/agent/heartbeat", async (req) => {
    const auth = req.auth as AccessPayload;
    const { agentId, tenantId } = auth;

    if (!agentId) {
      throw app.httpErrors.forbidden("No agent profile bound to this account");
    }
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const body = (req.body as { status?: string } | null) ?? {};
    const status = VALID_STATUSES.includes(body.status as AgentStatus) ? (body.status as AgentStatus) : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const nextState = await presenceService.recordHeartbeat(trx, { tenantId, agentId, status });
      return { ok: true, presenceState: nextState };
    });
  });

  app.post("/api/agent/activity", async (req) => {
    const auth = req.auth as AccessPayload;
    const { agentId, tenantId } = auth;

    if (!agentId) {
      throw app.httpErrors.forbidden("No agent profile bound to this account");
    }
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const nextState = await presenceService.recordActivity(trx, { tenantId, agentId });
      return { ok: true, presenceState: nextState };
    });
  });

  /**
   * GET /api/agent/colleagues
   * Returns all other active agents in the same tenant.
   * Used by the Transfer dialog to pick a target agent.
   */
  app.get("/api/agent/colleagues", async (req) => {
    const auth = req.auth as AccessPayload;
    const { agentId, tenantId } = auth;

    if (!agentId) throw app.httpErrors.forbidden("No agent profile bound to this account");
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      await presenceService.refreshTenantPresenceStates(trx, tenantId);

      const agents = await trx("agent_profiles as ap")
        .join("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
        .where("ap.tenant_id", tenantId)
        .whereNot("ap.agent_id", agentId)
        .select(
          "ap.agent_id",
          "ap.presence_state",
          "ap.last_heartbeat_at",
          "tm.display_name",
          "tm.employee_no"
        )
        .orderBy("tm.display_name", "asc");

      return {
        agents: agents.map((a) => ({
          agentId: a.agent_id as string,
          displayName: (a.display_name as string | null) ?? null,
          employeeNo: (a.employee_no as string | null) ?? null,
          status: (a.presence_state as string) ?? "offline",
          lastSeenAt: a.last_heartbeat_at ? new Date(a.last_heartbeat_at as string).toISOString() : null
        }))
      };
    });
  });

  /**
   * PATCH /api/agent/status
   * Explicitly set own availability intent and refresh presence_state.
   */
  app.patch("/api/agent/status", async (req) => {
    const auth = req.auth as AccessPayload;
    const { agentId, tenantId } = auth;

    if (!agentId) {
      throw app.httpErrors.forbidden("No agent profile bound to this account");
    }
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const body = req.body as { status?: string } | null;
    if (!body?.status || !VALID_STATUSES.includes(body.status as AgentStatus)) {
      throw app.httpErrors.badRequest(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const affected = await trx("agent_profiles")
        .where({ tenant_id: tenantId, agent_id: agentId })
        .update({
          status: body.status,
          updated_at: new Date()
        });

      if (affected === 0) {
        throw app.httpErrors.notFound("Agent profile not found");
      }

      const nextState = body.status === "offline"
        ? await presenceService.refreshAgentPresence(trx, tenantId, agentId)
        : await presenceService.recordActivity(trx, { tenantId, agentId });

      return { ok: true, status: body.status, presenceState: nextState };
    });
  });
}
