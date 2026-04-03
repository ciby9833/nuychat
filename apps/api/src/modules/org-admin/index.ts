import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import { PresenceService } from "../agent/presence.service.js";
import { hashPassword } from "../auth/auth.routes.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { isUniqueViolation } from "../tenant/tenant-admin.shared.js";

const VALID_ROLES = ["tenant_admin", "admin", "supervisor", "senior_agent", "agent", "readonly"];
const VALID_STATUSES = ["active", "inactive", "suspended"];
const SEAT_LIMIT_MESSAGE = "Licensed seat limit reached";

export async function orgAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);
  const presenceService = new PresenceService();

  app.get("/api/admin/members", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("tenant_memberships as tm")
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .leftJoin("agent_profiles as ap", (join) => {
          join.on("ap.membership_id", "=", "tm.membership_id").andOn("ap.tenant_id", "=", trx.raw("?", [tenantId]));
        })
        .select(
          "tm.membership_id",
          "tm.identity_id",
          "tm.role",
          "tm.status",
          "tm.is_default",
          "tm.created_at",
          "tm.display_name",
          "tm.employee_no",
          "tm.phone",
          "tm.id_number",
          "tm.resigned_at",
          "i.email",
          "ap.agent_id",
          "ap.display_name as agent_display_name"
        )
        .where({ "tm.tenant_id": tenantId })
        .orderBy("tm.created_at", "asc");

      return rows.map((r) => ({
        membershipId: r.membership_id as string,
        identityId: r.identity_id as string,
        email: r.email as string,
        role: r.role as string,
        status: r.status as string,
        isDefault: r.is_default as boolean,
        createdAt: r.created_at as string,
        displayName: (r.display_name as string | null) ?? (r.agent_display_name as string | null) ?? null,
        employeeNo: (r.employee_no as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        idNumber: (r.id_number as string | null) ?? null,
        resignedAt: (r.resigned_at as string | null) ?? null,
        agentId: (r.agent_id as string | null) ?? null,
        agentDisplayName: (r.agent_display_name as string | null) ?? null
      }));
    });
  });

  app.post("/api/admin/members", async (req, reply) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
      employeeNo?: string | null;
      phone?: string | null;
      idNumber?: string | null;
      role?: string;
      status?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const displayName = body.displayName?.trim();
    const employeeNo = body.employeeNo?.trim() || null;
    const phone = body.phone?.trim() || null;
    const idNumber = body.idNumber?.trim() || null;
    const role = VALID_ROLES.includes(body.role ?? "") ? body.role! : "readonly";
    const status = VALID_STATUSES.includes(body.status ?? "") ? body.status! : "active";

    if (!email || !email.includes("@")) throw app.httpErrors.badRequest("Valid email is required");
    if (!password || password.length < 6) throw app.httpErrors.badRequest("Password must be at least 6 characters");
    if (!displayName) throw app.httpErrors.badRequest("Display name is required");

    const passwordHash = await hashPassword(password);

    try {
      const result = await db.transaction(async (trx) => {
        await trx.raw("SELECT set_config('app.current_tenant_id', ?, true)", [tenantId]);

        let identity = await trx("identities")
          .select("identity_id", "email")
          .where({ email })
          .first<{ identity_id: string; email: string } | undefined>();

        if (!identity) {
          const [created] = await trx("identities")
            .insert({ email, password_hash: passwordHash, status: "active" })
            .returning(["identity_id", "email"]);
          identity = created as { identity_id: string; email: string };
        } else {
          await trx("identities").where({ identity_id: identity.identity_id }).update({ password_hash: passwordHash, updated_at: trx.fn.now() });
        }

        const existingMembership = await trx("tenant_memberships")
          .where({ tenant_id: tenantId, identity_id: identity.identity_id })
          .first<{ membership_id: string } | undefined>();

        if (existingMembership) {
          throw Object.assign(new Error("Email already belongs to a member of this tenant"), { code: "23505" });
        }

        if (isSeatCounted({ role, status })) {
          await assertSeatAvailable(app, trx, tenantId, {});
        }

        const [membership] = await trx("tenant_memberships")
          .insert({
            tenant_id: tenantId,
            identity_id: identity.identity_id,
            role,
            status,
            is_default: true,
            display_name: displayName,
            employee_no: employeeNo,
            phone,
            id_number: idNumber
          })
          .returning(["membership_id"]);

        return { membershipId: membership.membership_id as string, email: identity.email };
      });

      return { membershipId: result.membershipId, email: result.email, created: true };
    } catch (err) {
      if (isSeatLimitExceededError(err)) {
        return reply.status(409).send({ error: "seat_limit_exceeded", message: SEAT_LIMIT_MESSAGE });
      }
      if (isUniqueViolation(err) || (err instanceof Error && err.message.includes("already belongs"))) {
        throw app.httpErrors.conflict("Email already belongs to a member of this tenant");
      }
      throw err;
    }
  });

  app.patch("/api/admin/members/:membershipId", async (req, reply) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { membershipId } = req.params as { membershipId: string };
    const body = req.body as {
      role?: string;
      status?: string;
      displayName?: string;
      employeeNo?: string | null;
      phone?: string | null;
      idNumber?: string | null;
    };

    try {
      return await withTenantTransaction(tenantId, async (trx) => {
        const existing = await trx("tenant_memberships")
          .where({ membership_id: membershipId, tenant_id: tenantId })
          .select("membership_id", "role", "status")
          .first<{ membership_id: string; role: string; status: string } | undefined>();

        if (!existing) throw app.httpErrors.notFound("Member not found");

        const nextRole = body.role && VALID_ROLES.includes(body.role) ? body.role : existing.role;
        const nextStatus = body.status && VALID_STATUSES.includes(body.status) ? body.status : existing.status;

        if (!isSeatCounted(existing) && isSeatCounted({ role: nextRole, status: nextStatus })) {
          await assertSeatAvailable(app, trx, tenantId, {});
        }

        const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
        if (body.role && VALID_ROLES.includes(body.role)) updates.role = body.role;
        if (body.status && VALID_STATUSES.includes(body.status)) updates.status = body.status;
        if (body.displayName !== undefined) updates.display_name = body.displayName.trim();
        if (body.employeeNo !== undefined) updates.employee_no = body.employeeNo?.trim() || null;
        if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
        if (body.idNumber !== undefined) updates.id_number = body.idNumber?.trim() || null;

        await trx("tenant_memberships").where({ membership_id: membershipId, tenant_id: tenantId }).update(updates);
        return { updated: true, membershipId };
      });
    } catch (err) {
      if (isSeatLimitExceededError(err)) {
        return reply.status(409).send({ error: "seat_limit_exceeded", message: SEAT_LIMIT_MESSAGE });
      }
      throw err;
    }
  });

  app.post("/api/admin/members/:membershipId/reset-password", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { membershipId } = req.params as { membershipId: string };
    const body = req.body as { password?: string };
    const password = body.password;
    if (!password || password.length < 6) throw app.httpErrors.badRequest("Password must be at least 6 characters");

    const passwordHash = await hashPassword(password);

    return withTenantTransaction(tenantId, async (trx) => {
      const member = await trx("tenant_memberships")
        .where({ tenant_id: tenantId, membership_id: membershipId })
        .select("identity_id")
        .first<{ identity_id: string }>();

      if (!member) throw app.httpErrors.notFound("Member not found");

      await trx("identities").where({ identity_id: member.identity_id }).update({ password_hash: passwordHash, updated_at: trx.fn.now() });
      return { reset: true, membershipId };
    });
  });

  app.post("/api/admin/members/:membershipId/resign", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { membershipId } = req.params as { membershipId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const member = await trx("tenant_memberships")
        .where({ tenant_id: tenantId, membership_id: membershipId })
        .select("membership_id")
        .first<{ membership_id: string }>();

      if (!member) throw app.httpErrors.notFound("Member not found");

      await trx("tenant_memberships").where({ tenant_id: tenantId, membership_id: membershipId }).update({
        status: "inactive",
        resigned_at: trx.fn.now(),
        updated_at: trx.fn.now()
      });

      await trx("agent_profiles").where({ tenant_id: tenantId, membership_id: membershipId }).update({ status: "offline", updated_at: trx.fn.now() });
      return { resigned: true, membershipId };
    });
  });

  app.post("/api/admin/agents", async (req, reply) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      membershipId?: string;
      email?: string;
      password?: string;
      displayName?: string;
      role?: string;
      seniorityLevel?: string;
      maxConcurrency?: number;
      allowAiAssist?: boolean;
    };

    const membershipId = body.membershipId?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const displayName = body.displayName?.trim();
    const role = ["agent", "senior_agent", "supervisor", "admin"].includes(body.role ?? "") ? body.role : "agent";

    try {
      const result = await db.transaction(async (trx) => {
        await trx.raw("SELECT set_config('app.current_tenant_id', ?, true)", [tenantId]);

        let resolvedMembershipId = membershipId;
        let memberEmail = email ?? "";
        let memberDisplayName = displayName ?? "";

        if (resolvedMembershipId) {
          const existingMember = await trx("tenant_memberships as tm")
            .join("identities as i", "i.identity_id", "tm.identity_id")
            .where({ "tm.tenant_id": tenantId, "tm.membership_id": resolvedMembershipId })
            .select("tm.membership_id", "tm.display_name", "tm.role", "tm.status", "i.email")
            .first<{ membership_id: string; display_name: string | null; role: string; status: string; email: string }>();

          if (!existingMember) throw app.httpErrors.notFound("Member not found");

          const existingProfile = await trx("agent_profiles").where({ tenant_id: tenantId, membership_id: resolvedMembershipId }).first<{ agent_id: string }>();
          if (existingProfile) throw app.httpErrors.conflict("This member already has an agent profile");

          memberEmail = existingMember.email;
          memberDisplayName = displayName ?? existingMember.display_name ?? existingMember.email;

          const nextRole = body.role && ["agent", "senior_agent", "supervisor", "admin"].includes(body.role)
            ? body.role
            : existingMember.role === "readonly"
              ? "agent"
              : existingMember.role;

          if (!isSeatCounted({ role: existingMember.role, status: existingMember.status }) &&
            isSeatCounted({ role: nextRole, status: existingMember.status })) {
            await assertSeatAvailable(app, trx, tenantId, {});
          }

          if (nextRole !== existingMember.role) {
            await trx("tenant_memberships").where({ tenant_id: tenantId, membership_id: resolvedMembershipId }).update({ role: nextRole, updated_at: trx.fn.now() });
          }
        } else {
          if (!email || !email.includes("@")) throw app.httpErrors.badRequest("Valid email is required");
          if (!password || password.length < 6) throw app.httpErrors.badRequest("Password must be at least 6 characters");
          if (!displayName) throw app.httpErrors.badRequest("Display name is required");

          const passwordHash = await hashPassword(password);
          let identity = await trx("identities").select("identity_id", "email").where({ email }).first<{ identity_id: string; email: string } | undefined>();

          if (!identity) {
            const [created] = await trx("identities").insert({ email, password_hash: passwordHash, status: "active" }).returning(["identity_id", "email"]);
            identity = created as { identity_id: string; email: string };
          }

          const existingMembership = await trx("tenant_memberships").where({ tenant_id: tenantId, identity_id: identity.identity_id }).first<{ membership_id: string } | undefined>();
          if (existingMembership) {
            throw Object.assign(new Error("Email already belongs to a member of this tenant"), { code: "23505" });
          }

          await assertSeatAvailable(app, trx, tenantId, {});

          const [membership] = await trx("tenant_memberships")
            .insert({
              tenant_id: tenantId,
              identity_id: identity.identity_id,
              role,
              status: "active",
              is_default: true,
              display_name: displayName
            })
            .returning(["membership_id"]);
          resolvedMembershipId = membership.membership_id as string;
          memberEmail = identity.email;
          memberDisplayName = displayName;
        }

        const [profile] = await trx("agent_profiles")
          .insert({
            tenant_id: tenantId,
            membership_id: resolvedMembershipId,
            display_name: memberDisplayName,
            status: "offline",
            seniority_level: body.seniorityLevel ?? "junior",
            max_concurrency: Math.max(1, Math.min(20, body.maxConcurrency ?? 6)),
            allow_ai_assist: body.allowAiAssist ?? true
          })
          .returning(["agent_id"]);

        const presetTeams = await trx("member_team_presets").where({ tenant_id: tenantId, membership_id: resolvedMembershipId }).select("team_id", "is_primary", "joined_at");
        if (presetTeams.length > 0) {
          await trx("agent_team_map")
            .insert(presetTeams.map((preset) => ({
              tenant_id: tenantId,
              team_id: preset.team_id,
              agent_id: profile.agent_id,
              is_primary: preset.is_primary,
              joined_at: preset.joined_at
            })))
            .onConflict(["team_id", "agent_id"])
            .ignore();
        }

        const supervisorPresets = await trx("member_supervisor_team_presets").where({ tenant_id: tenantId, membership_id: resolvedMembershipId }).select("team_id");
        if (supervisorPresets.length > 0) {
          await trx("teams")
            .where({ tenant_id: tenantId })
            .whereIn("team_id", supervisorPresets.map((preset) => preset.team_id as string))
            .whereNull("supervisor_agent_id")
            .update({ supervisor_agent_id: profile.agent_id, updated_at: trx.fn.now() });
        }

        return { agentId: profile.agent_id as string, email: memberEmail };
      });

      return { agentId: result.agentId, email: result.email, created: true };
    } catch (err) {
      if (isSeatLimitExceededError(err)) {
        return reply.status(409).send({ error: "seat_limit_exceeded", message: SEAT_LIMIT_MESSAGE });
      }
      if (isUniqueViolation(err) || (err instanceof Error && err.message.includes("already belongs"))) {
        throw app.httpErrors.conflict("Email already belongs to a member of this tenant");
      }
      throw err;
    }
  });

  app.get("/api/admin/agents", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      await presenceService.refreshTenantPresenceStates(trx, tenantId);
      const agents = await trx("agent_profiles as ap")
        .join("tenant_memberships as tm", "tm.membership_id", "ap.membership_id")
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .select(
          "ap.agent_id",
          "ap.display_name",
          "ap.status",
          "ap.presence_state",
          "ap.seniority_level",
          "ap.max_concurrency",
          "ap.allow_ai_assist",
          "ap.last_heartbeat_at",
          "tm.employee_no",
          "i.email",
          "tm.role"
        )
        .where({ "ap.tenant_id": tenantId })
        .orderBy("ap.created_at", "asc");

      if (agents.length === 0) return [];

      return agents.map((a) => ({
        email: a.email,
        role: a.role,
        agentId: a.agent_id as string,
        displayName: a.display_name as string,
        seniorityLevel: a.seniority_level as string,
        maxConcurrency: a.max_concurrency as number,
        allowAiAssist: a.allow_ai_assist as boolean,
        employeeNo: (a.employee_no as string | null) ?? null,
        status: (a.presence_state as string | null) ?? "offline",
        lastSeenAt: (a.last_heartbeat_at as string | null) ?? null
      }));
    });
  });

  app.patch("/api/admin/agents/:agentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { agentId } = req.params as { agentId: string };
    const body = req.body as { status?: string; maxConcurrency?: number; seniorityLevel?: string; displayName?: string; allowAiAssist?: boolean };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.maxConcurrency !== undefined) updates.max_concurrency = Math.max(1, Math.min(20, body.maxConcurrency));
      if (body.seniorityLevel !== undefined) updates.seniority_level = body.seniorityLevel;
      if (body.displayName !== undefined) updates.display_name = body.displayName.trim();
      if (body.allowAiAssist !== undefined) updates.allow_ai_assist = body.allowAiAssist;

      const affected = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).update(updates);
      if (affected === 0) throw app.httpErrors.notFound("Agent not found");
      await presenceService.refreshAgentPresence(trx, tenantId, agentId);
      return { updated: true };
    });
  });

  app.delete("/api/admin/agents/:agentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { agentId } = req.params as { agentId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).select("agent_id", "membership_id").first<{ agent_id: string; membership_id: string }>();
      if (!agent) throw app.httpErrors.notFound("Agent not found");

      await trx("member_team_presets").where({ tenant_id: tenantId, membership_id: agent.membership_id }).del();

      const currentTeams = await trx("agent_team_map").where({ tenant_id: tenantId, agent_id: agentId }).select("team_id", "is_primary", "joined_at");
      if (currentTeams.length > 0) {
        await trx("member_team_presets").insert(currentTeams.map((team) => ({
          tenant_id: tenantId,
          membership_id: agent.membership_id,
          team_id: team.team_id,
          is_primary: team.is_primary,
          joined_at: team.joined_at
        })));
      }

      await trx("member_supervisor_team_presets").where({ tenant_id: tenantId, membership_id: agent.membership_id }).del();
      const supervisedTeams = await trx("teams").where({ tenant_id: tenantId, supervisor_agent_id: agentId }).select("team_id");
      if (supervisedTeams.length > 0) {
        await trx("member_supervisor_team_presets").insert(supervisedTeams.map((team) => ({
          tenant_id: tenantId,
          membership_id: agent.membership_id,
          team_id: team.team_id
        })));
      }

      await trx("queue_assignments")
        .where({ tenant_id: tenantId, assigned_agent_id: agentId })
        .whereIn("status", ["assigned", "pending"])
        .update({ assigned_agent_id: null, status: "pending", assignment_reason: "agent-profile-removed", updated_at: trx.fn.now() });

      await trx("conversations")
        .where({ tenant_id: tenantId, assigned_agent_id: agentId, status: "human_active" })
        .update({ assigned_agent_id: null, status: "queued", updated_at: trx.fn.now() });

      await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).del();
      return { removed: true, agentId };
    });
  });

  app.post("/api/admin/departments", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { code?: string; name?: string; parentDepartmentId?: string | null; isActive?: boolean; metadata?: Record<string, unknown> };
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!code || !name) throw app.httpErrors.badRequest("code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      if (body.parentDepartmentId) {
        const parent = await trx("departments").where({ tenant_id: tenantId, department_id: body.parentDepartmentId }).first();
        if (!parent) throw app.httpErrors.notFound("Parent department not found");
      }

      try {
        const [row] = await trx("departments")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            parent_department_id: body.parentDepartmentId ?? null,
            is_active: body.isActive ?? true,
            metadata: body.metadata ?? {}
          })
          .returning(["department_id", "code", "name", "parent_department_id", "is_active", "created_at", "updated_at"]);

        return {
          departmentId: row.department_id,
          code: row.code,
          name: row.name,
          parentDepartmentId: row.parent_department_id,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      } catch (err) {
        if (isUniqueViolation(err)) throw app.httpErrors.conflict("Department code already exists");
        throw err;
      }
    });
  });

  app.get("/api/admin/departments", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("departments as d")
        .leftJoin("teams as t", function joinTeams() {
          this.on("t.department_id", "=", "d.department_id").andOn("t.tenant_id", "=", "d.tenant_id");
        })
        .where("d.tenant_id", tenantId)
        .groupBy("d.department_id")
        .select("d.department_id", "d.code", "d.name", "d.parent_department_id", "d.is_active", "d.created_at", "d.updated_at")
        .count<{ team_count: string }[]>("t.team_id as team_count")
        .orderBy("d.name", "asc") as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        departmentId: row.department_id,
        code: row.code,
        name: row.name,
        parentDepartmentId: row.parent_department_id,
        isActive: row.is_active,
        teamCount: Number((row as { team_count?: string }).team_count ?? 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    });
  });

  app.patch("/api/admin/departments/:departmentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { departmentId } = req.params as { departmentId: string };
    const body = req.body as {
      code?: string;
      name?: string;
      parentDepartmentId?: string | null;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const current = await trx("departments").where({ tenant_id: tenantId, department_id: departmentId }).first();
      if (!current) throw app.httpErrors.notFound("Department not found");

      const updates: Record<string, unknown> = {};
      if (typeof body.code === "string") {
        const code = body.code.trim().toLowerCase();
        if (!code) throw app.httpErrors.badRequest("code cannot be empty");
        updates.code = code;
      }
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) throw app.httpErrors.badRequest("name cannot be empty");
        updates.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
        updates.is_active = Boolean(body.isActive);
      }
      if (Object.prototype.hasOwnProperty.call(body, "parentDepartmentId")) {
        const parentDepartmentId = body.parentDepartmentId?.trim() || null;
        if (parentDepartmentId === departmentId) {
          throw app.httpErrors.badRequest("Department cannot be its own parent");
        }
        if (parentDepartmentId) {
          const parent = await trx("departments").where({ tenant_id: tenantId, department_id: parentDepartmentId }).first();
          if (!parent) throw app.httpErrors.notFound("Parent department not found");

          const descendants = await trx
            .withRecursive("department_tree", ["department_id"], (qb) => {
              qb.select("department_id").from("departments").where({ tenant_id: tenantId, parent_department_id: departmentId })
                .unionAll((recursive) => {
                  recursive
                    .select("d.department_id")
                    .from("departments as d")
                    .join("department_tree as dt", "d.parent_department_id", "dt.department_id")
                    .where("d.tenant_id", tenantId);
                });
            })
            .from("department_tree")
            .select("department_id");

          if (descendants.some((row) => row.department_id === parentDepartmentId)) {
            throw app.httpErrors.badRequest("Department cannot be moved under its descendant");
          }
        }

        updates.parent_department_id = parentDepartmentId;
      }

      if (Object.keys(updates).length === 0) {
        return { updated: true, departmentId };
      }

      try {
        await trx("departments")
          .where({ tenant_id: tenantId, department_id: departmentId })
          .update({ ...updates, updated_at: trx.fn.now() });
      } catch (err) {
        if (isUniqueViolation(err)) throw app.httpErrors.conflict("Department code already exists");
        throw err;
      }

      return { updated: true, departmentId };
    });
  });

  app.delete("/api/admin/departments/:departmentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { departmentId } = req.params as { departmentId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const department = await trx("departments").where({ tenant_id: tenantId, department_id: departmentId }).first();
      if (!department) throw app.httpErrors.notFound("Department not found");

      const teamCountRow = await trx("teams")
        .where({ tenant_id: tenantId, department_id: departmentId })
        .count<{ count: string }>("team_id as count")
        .first();

      if (Number(teamCountRow?.count ?? 0) > 0) {
        throw app.httpErrors.conflict("Department still has teams");
      }

      await trx("departments").where({ tenant_id: tenantId, department_id: departmentId }).del();
      return { deleted: true, departmentId };
    });
  });

  app.post("/api/admin/teams", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { departmentId?: string; code?: string; name?: string; supervisorAgentId?: string | null; isActive?: boolean; metadata?: Record<string, unknown> };

    const departmentId = body.departmentId?.trim();
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!departmentId || !code || !name) throw app.httpErrors.badRequest("departmentId, code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      const department = await trx("departments").where({ tenant_id: tenantId, department_id: departmentId }).first();
      if (!department) throw app.httpErrors.notFound("Department not found");
      if (body.supervisorAgentId) {
        const supervisor = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: body.supervisorAgentId }).first();
        if (!supervisor) throw app.httpErrors.notFound("Supervisor agent not found");
      }

      try {
        const [row] = await trx("teams")
          .insert({
            tenant_id: tenantId,
            department_id: departmentId,
            code,
            name,
            supervisor_agent_id: body.supervisorAgentId ?? null,
            is_active: body.isActive ?? true,
            metadata: body.metadata ?? {}
          })
          .returning(["team_id", "department_id", "code", "name", "supervisor_agent_id", "is_active", "created_at", "updated_at"]);

        return {
          teamId: row.team_id,
          departmentId: row.department_id,
          code: row.code,
          name: row.name,
          supervisorAgentId: row.supervisor_agent_id,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      } catch (err) {
        if (isUniqueViolation(err)) throw app.httpErrors.conflict("Team code already exists");
        throw err;
      }
    });
  });

  app.get("/api/admin/teams", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { departmentId?: string };
    const departmentId = query.departmentId?.trim();

    return withTenantTransaction(tenantId, async (trx) => {
      const teams = await trx("teams as t")
        .leftJoin("departments as d", function joinDepartments() {
          this.on("d.department_id", "=", "t.department_id").andOn("d.tenant_id", "=", "t.tenant_id");
        })
        .leftJoin("agent_profiles as sap", function joinSupervisor() {
          this.on("sap.agent_id", "=", "t.supervisor_agent_id").andOn("sap.tenant_id", "=", "t.tenant_id");
        })
        .where("t.tenant_id", tenantId)
        .modify((qb) => {
          if (departmentId) qb.andWhere("t.department_id", departmentId);
        })
        .select("t.team_id", "t.department_id", "t.code", "t.name", "t.supervisor_agent_id", "t.is_active", "t.created_at", "t.updated_at", "d.name as department_name", "sap.display_name as supervisor_name")
        .orderBy("d.name", "asc")
        .orderBy("t.name", "asc") as Array<Record<string, unknown>>;

      const teamIds = teams.map((team) => team.team_id as string);
      if (teamIds.length === 0) return [];

      const memberships = await trx("agent_team_map as atm")
        .join("agent_profiles as ap", function joinAgentProfiles() {
          this.on("ap.agent_id", "=", "atm.agent_id").andOn("ap.tenant_id", "=", "atm.tenant_id");
        })
        .join("tenant_memberships as tm", function joinMemberships() {
          this.on("tm.membership_id", "=", "ap.membership_id").andOn("tm.tenant_id", "=", "ap.tenant_id");
        })
        .join("identities as i", "i.identity_id", "tm.identity_id")
        .where("atm.tenant_id", tenantId)
        .whereIn("atm.team_id", teamIds)
        .select("atm.team_id", "atm.agent_id", "atm.is_primary", "atm.joined_at", "ap.display_name", "ap.status", "i.email")
        .orderBy("atm.joined_at", "asc");

      const membersByTeam = memberships.reduce<Record<string, Array<Record<string, unknown>>>>((acc, row) => {
        const key = row.team_id as string;
        if (!acc[key]) acc[key] = [];
        acc[key]!.push({
          agentId: row.agent_id,
          displayName: row.display_name,
          email: row.email,
          status: row.status,
          isPrimary: row.is_primary,
          joinedAt: row.joined_at
        });
        return acc;
      }, {});

      return teams.map((team: Record<string, unknown>) => ({
        teamId: team.team_id,
        departmentId: team.department_id,
        departmentName: team.department_name,
        code: team.code,
        name: team.name,
        supervisorAgentId: team.supervisor_agent_id,
        supervisorName: team.supervisor_name,
        isActive: team.is_active,
        memberCount: (membersByTeam[team.team_id as string] ?? []).length,
        members: membersByTeam[team.team_id as string] ?? [],
        createdAt: team.created_at,
        updatedAt: team.updated_at
      }));
    });
  });

  app.patch("/api/admin/teams/:teamId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { teamId } = req.params as { teamId: string };
    const body = req.body as {
      departmentId?: string;
      code?: string;
      name?: string;
      supervisorAgentId?: string | null;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const current = await trx("teams").where({ tenant_id: tenantId, team_id: teamId }).first();
      if (!current) throw app.httpErrors.notFound("Team not found");

      const updates: Record<string, unknown> = {};
      if (typeof body.departmentId === "string") {
        const departmentId = body.departmentId.trim();
        if (!departmentId) throw app.httpErrors.badRequest("departmentId cannot be empty");
        const department = await trx("departments").where({ tenant_id: tenantId, department_id: departmentId }).first();
        if (!department) throw app.httpErrors.notFound("Department not found");
        updates.department_id = departmentId;
      }
      if (typeof body.code === "string") {
        const code = body.code.trim().toLowerCase();
        if (!code) throw app.httpErrors.badRequest("code cannot be empty");
        updates.code = code;
      }
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) throw app.httpErrors.badRequest("name cannot be empty");
        updates.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, "supervisorAgentId")) {
        const supervisorAgentId = body.supervisorAgentId?.trim() || null;
        if (supervisorAgentId) {
          const supervisor = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: supervisorAgentId }).first();
          if (!supervisor) throw app.httpErrors.notFound("Supervisor agent not found");
        }
        updates.supervisor_agent_id = supervisorAgentId;
      }
      if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
        updates.is_active = Boolean(body.isActive);
      }

      if (Object.keys(updates).length === 0) {
        return { updated: true, teamId };
      }

      try {
        await trx("teams")
          .where({ tenant_id: tenantId, team_id: teamId })
          .update({ ...updates, updated_at: trx.fn.now() });
      } catch (err) {
        if (isUniqueViolation(err)) throw app.httpErrors.conflict("Team code already exists");
        throw err;
      }

      return { updated: true, teamId };
    });
  });

  app.delete("/api/admin/teams/:teamId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { teamId } = req.params as { teamId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const team = await trx("teams").where({ tenant_id: tenantId, team_id: teamId }).first();
      if (!team) throw app.httpErrors.notFound("Team not found");

      await trx("teams").where({ tenant_id: tenantId, team_id: teamId }).del();
      return { deleted: true, teamId };
    });
  });

  app.post("/api/admin/teams/:teamId/members", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { teamId } = req.params as { teamId: string };
    const body = req.body as { agentId?: string; isPrimary?: boolean };
    const agentId = body.agentId?.trim();
    if (!agentId) throw app.httpErrors.badRequest("agentId is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const team = await trx("teams").where({ tenant_id: tenantId, team_id: teamId }).first();
      if (!team) throw app.httpErrors.notFound("Team not found");
      const agent = await trx("agent_profiles").where({ tenant_id: tenantId, agent_id: agentId }).first();
      if (!agent) throw app.httpErrors.notFound("Agent not found");

      await trx("agent_team_map")
        .insert({ tenant_id: tenantId, team_id: teamId, agent_id: agentId, is_primary: body.isPrimary ?? true })
        .onConflict(["team_id", "agent_id"])
        .merge({ is_primary: body.isPrimary ?? true, updated_at: trx.fn.now() });

      return { assigned: true, teamId, agentId };
    });
  });

  app.delete("/api/admin/teams/:teamId/members/:agentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { teamId, agentId } = req.params as { teamId: string; agentId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await trx("agent_team_map").where({ tenant_id: tenantId, team_id: teamId, agent_id: agentId }).del();
      return { removed: true, teamId, agentId };
    });
  });
}

function roleConsumesSeat(role: string): boolean {
  return role !== "readonly";
}

function isSeatCounted(input: { role: string; status: string }): boolean {
  return input.status === "active" && roleConsumesSeat(input.role);
}

function isSeatLimitExceededError(error: unknown): boolean {
  return error instanceof Error && error.message === SEAT_LIMIT_MESSAGE;
}

async function assertSeatAvailable(
  app: FastifyInstance,
  trx: Knex.Transaction,
  tenantId: string,
  input: { ignoreMembershipId?: string }
): Promise<void> {
  const tenant = await trx("tenants").where({ tenant_id: tenantId }).select("licensed_seats").first<{ licensed_seats: number | null } | undefined>();
  if (!tenant) throw app.httpErrors.notFound("Tenant not found");
  if (tenant.licensed_seats === null) return;

  const usageRow = await trx("tenant_memberships")
    .where({ tenant_id: tenantId, status: "active" })
    .whereNot({ role: "readonly" })
    .modify((query) => {
      if (input.ignoreMembershipId) query.whereNot({ membership_id: input.ignoreMembershipId });
    })
    .count<{ count: string }>("membership_id as count")
    .first();

  const activeSeatCount = Number(usageRow?.count ?? 0);
  if (activeSeatCount >= tenant.licensed_seats) {
    throw new Error(SEAT_LIMIT_MESSAGE);
  }
}
