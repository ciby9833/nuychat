import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { PresenceService } from "../agent/presence.service.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { isDateString, isTimeString, isUniqueViolation, toIsoString } from "../tenant/tenant-admin.shared.js";

export async function opsWorkforceRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);
  const presenceService = new PresenceService();

  app.get("/api/admin/overview", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const [convStats, kbStats, agentStats] = await Promise.all([
        trx("conversations").select("status").count("conversation_id as cnt").groupBy("status"),
        trx("knowledge_base_entries").where({ is_active: true }).count("entry_id as cnt").first(),
        trx("agent_profiles").count("agent_id as cnt").first()
      ]);

      const byStatus = Object.fromEntries(
        (convStats as Array<{ status: string; cnt: string }>).map((r) => [r.status, Number(r.cnt)])
      );

      return {
        conversations: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
        knowledgeBase: { activeEntries: Number((kbStats as { cnt: string })?.cnt ?? 0) },
        agents: { total: Number((agentStats as { cnt: string })?.cnt ?? 0) }
      };
    });
  });

  app.get("/api/admin/agent-presence", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      await presenceService.refreshTenantPresenceStates(trx, tenantId);

      const activeConversations = trx("conversations")
        .where({ tenant_id: tenantId, status: "human_active", current_handler_type: "human" })
        .whereNotNull("current_handler_id")
        .groupBy("current_handler_id")
        .select("current_handler_id")
        .count<{ current_handler_id: string; active_count: string }[]>("conversation_id as active_count")
        .as("ac");

      const rows = await trx("agent_profiles as ap")
        .join("tenant_memberships as tm", function joinMemberships() {
          this.on("tm.membership_id", "=", "ap.membership_id").andOn("tm.tenant_id", "=", "ap.tenant_id");
        })
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .leftJoin(activeConversations, function joinActiveConversations() {
          this.on(trx.raw("ac.current_handler_id::uuid") as unknown as string, "=", trx.ref("ap.agent_id"));
        })
        .where("ap.tenant_id", tenantId)
        .groupBy("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email", "ac.active_count")
        .select("ap.agent_id", "ap.display_name", "ap.presence_state", "ap.last_heartbeat_at", "i.email")
        .select("ac.active_count")
        .orderBy("ap.display_name", "asc") as Array<Record<string, unknown>>;

      const byStatus = { online: 0, busy: 0, away: 0, offline: 0 };
      const items = rows.map((row) => {
        const effectiveStatus = String(row.presence_state ?? "offline");
        if (effectiveStatus === "online") byStatus.online += 1;
        else if (effectiveStatus === "busy") byStatus.busy += 1;
        else if (effectiveStatus === "away") byStatus.away += 1;
        else byStatus.offline += 1;
        return {
          agentId: row.agent_id,
          displayName: row.display_name,
          email: row.email,
          status: effectiveStatus,
          lastSeenAt: row.last_heartbeat_at,
          activeConversations: Number((row as { active_count?: string }).active_count ?? 0)
        };
      });

      return { summary: { total: items.length, ...byStatus }, items };
    });
  });

  app.get("/api/admin/shift-schedules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("shift_schedules")
        .where({ tenant_id: tenantId })
        .select("shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "created_at", "updated_at")
        .orderBy("created_at", "asc");
      return rows.map((row) => ({
        shiftId: row.shift_id,
        code: row.code,
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    });
  });

  app.post("/api/admin/shift-schedules", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { code?: string; name?: string; startTime?: string; endTime?: string; timezone?: string; isActive?: boolean };
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!code || !name || !isTimeString(body.startTime) || !isTimeString(body.endTime)) {
      throw app.httpErrors.badRequest("code, name, startTime, endTime are required (HH:mm)");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("shift_schedules")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            start_time: body.startTime,
            end_time: body.endTime,
            timezone: body.timezone?.trim() || "Asia/Jakarta",
            is_active: body.isActive ?? true
          })
          .returning(["shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "created_at", "updated_at"]);
        return {
          shiftId: row.shift_id,
          code: row.code,
          name: row.name,
          startTime: row.start_time,
          endTime: row.end_time,
          timezone: row.timezone,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Shift code already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/shift-schedules/:shiftId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { shiftId } = req.params as { shiftId: string };
    const body = req.body as { name?: string; startTime?: string; endTime?: string; timezone?: string; isActive?: boolean };

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: shiftId }).first();
      if (!existing) throw app.httpErrors.notFound("Shift schedule not found");

      const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name?.trim()) patch.name = body.name.trim();
      if (isTimeString(body.startTime)) patch.start_time = body.startTime;
      if (isTimeString(body.endTime)) patch.end_time = body.endTime;
      if (body.timezone?.trim()) patch.timezone = body.timezone.trim();
      if (typeof body.isActive === "boolean") patch.is_active = body.isActive;

      const [row] = await trx("shift_schedules")
        .where({ tenant_id: tenantId, shift_id: shiftId })
        .update(patch)
        .returning(["shift_id", "code", "name", "start_time", "end_time", "timezone", "is_active", "updated_at"]);

      return {
        shiftId: row.shift_id,
        code: row.code,
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone,
        isActive: row.is_active,
        updatedAt: row.updated_at
      };
    });
  });

  app.delete("/api/admin/shift-schedules/:shiftId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { shiftId } = req.params as { shiftId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const existing = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: shiftId }).first();
      if (!existing) throw app.httpErrors.notFound("Shift schedule not found");
      await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: shiftId }).update({ is_active: false, updated_at: trx.fn.now() });
      return { deleted: true };
    });
  });

  app.get("/api/admin/agent-shifts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { from?: string; to?: string };
    const from = isDateString(query.from) ? query.from : new Date().toISOString().slice(0, 10);
    const to = isDateString(query.to) ? query.to : from;
    if (from > to) throw app.httpErrors.badRequest("from must be <= to");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("agent_shifts as s")
        .join("agent_profiles as ap", function joinAgent() {
          this.on("ap.agent_id", "=", "s.agent_id").andOn("ap.tenant_id", "=", "s.tenant_id");
        })
        .leftJoin("shift_schedules as ss", function joinSchedule() {
          this.on("ss.shift_id", "=", "s.shift_id").andOn("ss.tenant_id", "=", "s.tenant_id");
        })
        .where("s.tenant_id", tenantId)
        .andWhere("s.shift_date", ">=", from)
        .andWhere("s.shift_date", "<=", to)
        .select("s.id", "s.agent_id", "s.shift_id", trx.raw("to_char(s.shift_date, 'YYYY-MM-DD') as shift_date"), "s.status", "s.note", "ap.display_name", "ss.code as shift_code", "ss.name as shift_name")
        .orderBy("s.shift_date", "asc");

      return rows.map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        agentName: row.display_name,
        shiftId: row.shift_id,
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        shiftDate: String(row.shift_date),
        status: row.status,
        note: row.note
      }));
    });
  });

  app.post("/api/admin/agent-shifts", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { agentId?: string; shiftId?: string | null; shiftDate?: string; status?: "scheduled" | "off" | "leave"; note?: string };
    const agentId = body.agentId?.trim();
    if (!agentId || !isDateString(body.shiftDate)) throw app.httpErrors.badRequest("agentId and shiftDate are required");
    const status = body.status && ["scheduled", "off", "leave"].includes(body.status) ? body.status : "scheduled";

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).first();
      if (!agent) throw app.httpErrors.notFound("Agent not found");
      if (body.shiftId) {
        const shift = await trx("shift_schedules").where({ tenant_id: tenantId, shift_id: body.shiftId }).first();
        if (!shift) throw app.httpErrors.notFound("Shift schedule not found");
      }

      const [row] = await trx("agent_shifts")
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          shift_id: body.shiftId ?? null,
          shift_date: body.shiftDate,
          status,
          note: body.note?.trim() || null
        })
        .onConflict(["agent_id", "shift_date"])
        .merge({ shift_id: body.shiftId ?? null, status, note: body.note?.trim() || null, updated_at: trx.fn.now() })
        .returning(["id", "agent_id", "shift_id", "shift_date", "status", "note"]);

      return { id: row.id, agentId: row.agent_id, shiftId: row.shift_id, shiftDate: row.shift_date, status: row.status, note: row.note };
    });
  });

  app.post("/api/admin/agent-shifts/bulk", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { items?: Array<{ agentId?: string; shiftId?: string | null; shiftDate?: string; status?: "scheduled" | "off" | "leave"; note?: string }> };
    if (!Array.isArray(body.items) || body.items.length === 0) throw app.httpErrors.badRequest("items array is required");
    const validStatuses = new Set(["scheduled", "off", "leave"]);

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = (body.items ?? [])
        .filter((item) => item.agentId?.trim() && isDateString(item.shiftDate))
        .map((item) => ({
          tenant_id: tenantId,
          agent_id: item.agentId!.trim(),
          shift_id: item.shiftId ?? null,
          shift_date: item.shiftDate!,
          status: validStatuses.has(item.status ?? "") ? item.status! : "scheduled",
          note: item.note?.trim() || null
        }));

      if (rows.length === 0) throw app.httpErrors.badRequest("No valid items");

      await trx("agent_shifts")
        .insert(rows)
        .onConflict(["agent_id", "shift_date"])
        .merge({ shift_id: trx.raw("EXCLUDED.shift_id"), status: trx.raw("EXCLUDED.status"), note: trx.raw("EXCLUDED.note"), updated_at: trx.fn.now() });

      return { saved: rows.length };
    });
  });

  app.post("/api/admin/agent-breaks", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { agentId?: string; breakType?: "break" | "lunch" | "training"; note?: string; endCurrent?: boolean };
    const agentId = body.agentId?.trim();
    if (!agentId) throw app.httpErrors.badRequest("agentId is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).first();
      if (!agent) throw app.httpErrors.notFound("Agent not found");

      if (body.endCurrent) {
        await trx("agent_breaks").where({ tenant_id: tenantId, agent_id: agentId, status: "active" }).update({ status: "ended", ended_at: trx.fn.now(), updated_at: trx.fn.now() });
        await presenceService.refreshAgentPresence(trx, tenantId, agentId);
        return { ended: true };
      }

      await trx("agent_breaks").where({ tenant_id: tenantId, agent_id: agentId, status: "active" }).update({ status: "ended", ended_at: trx.fn.now(), updated_at: trx.fn.now() });

      const [row] = await trx("agent_breaks")
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          break_type: body.breakType && ["break", "lunch", "training"].includes(body.breakType) ? body.breakType : "break",
          status: "active",
          note: body.note?.trim() || null
        })
        .returning(["break_id", "agent_id", "break_type", "status", "started_at"]);

      await presenceService.refreshAgentPresence(trx, tenantId, agentId);
      return { breakId: row.break_id, agentId: row.agent_id, breakType: row.break_type, status: row.status, startedAt: row.started_at };
    });
  });
}
