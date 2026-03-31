import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { resolveTenantAISettingsForScene } from "../ai/provider-config.service.js";
import { normalizeNonEmptyString } from "../tenant/tenant-admin.shared.js";
import { assertAISeatAvailable, serializeAiAgentRow } from "./ai-admin.shared.js";

const AI_SEAT_LIMIT_MESSAGE = "Licensed AI seat limit reached";

export async function registerAIAgentAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/ai-agents", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const [tenant, aiSeatSettings, rows, activeRow] = await Promise.all([
        trx("tenants")
          .select("licensed_ai_seats", "ai_model_access_mode")
          .where({ tenant_id: tenantId })
          .first<{ licensed_ai_seats: number | null; ai_model_access_mode: string | null } | undefined>(),
        resolveTenantAISettingsForScene(trx, tenantId, "ai_seat"),
        trx("tenant_ai_agents")
          .select("ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt", "description", "status", "created_at", "updated_at")
          .where({ tenant_id: tenantId })
          .orderBy("created_at", "asc"),
        trx("tenant_ai_agents")
          .where({ tenant_id: tenantId, status: "active" })
          .count<{ cnt: string }>("ai_agent_id as cnt")
          .first()
      ]);

      const licensedAiSeats = Number(tenant?.licensed_ai_seats ?? 0);
      const usedAiSeats = Number(activeRow?.cnt ?? 0);

      return {
        summary: {
          licensedAiSeats,
          usedAiSeats,
          remainingAiSeats: Math.max(0, licensedAiSeats - usedAiSeats),
          aiModelAccessMode: tenant?.ai_model_access_mode === "tenant_managed" ? "tenant_managed" : "platform_managed",
          aiProvider: aiSeatSettings?.providerName ?? null,
          aiModel: aiSeatSettings?.model ?? null
        },
        items: rows.map((row) => serializeAiAgentRow(row as Record<string, unknown>))
      };
    });
  });

  app.post("/api/admin/ai-agents", async (req, reply) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      name?: string;
      roleLabel?: string | null;
      personality?: string | null;
      scenePrompt?: string | null;
      systemPrompt?: string | null;
      description?: string | null;
      status?: "draft" | "active" | "inactive";
    };

    const name = normalizeNonEmptyString(body.name);
    if (!name) throw app.httpErrors.badRequest("AI agent name is required");

    try {
      return await withTenantTransaction(tenantId, async (trx) => {
        if (body.status === "active") {
          await assertAISeatAvailable(app, trx, tenantId);
        }
        const [created] = await trx("tenant_ai_agents")
          .insert({
            tenant_id: tenantId,
            name,
            role_label: normalizeNonEmptyString(body.roleLabel) ?? null,
            personality: normalizeNonEmptyString(body.personality) ?? null,
            scene_prompt: normalizeNonEmptyString(body.scenePrompt) ?? null,
            system_prompt: normalizeNonEmptyString(body.systemPrompt) ?? null,
            description: normalizeNonEmptyString(body.description) ?? null,
            status: body.status === "active" || body.status === "inactive" || body.status === "draft" ? body.status : "draft"
          })
          .returning(["ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt", "description", "status", "created_at", "updated_at"]);

        return serializeAiAgentRow(created as Record<string, unknown>);
      });
    } catch (error) {
      if ((error as Error).message === AI_SEAT_LIMIT_MESSAGE) {
        return reply.status(409).send({ error: "ai_seat_limit_exceeded", message: AI_SEAT_LIMIT_MESSAGE });
      }
      throw error;
    }
  });

  app.patch("/api/admin/ai-agents/:aiAgentId", async (req, reply) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { aiAgentId } = req.params as { aiAgentId: string };

    const body = req.body as {
      name?: string;
      roleLabel?: string | null;
      personality?: string | null;
      scenePrompt?: string | null;
      systemPrompt?: string | null;
      description?: string | null;
      status?: "draft" | "active" | "inactive";
    };

    try {
      return await withTenantTransaction(tenantId, async (trx) => {
        const current = await trx("tenant_ai_agents")
          .where({ tenant_id: tenantId, ai_agent_id: aiAgentId })
          .select("ai_agent_id", "status")
          .first<{ ai_agent_id: string; status: string } | undefined>();
        if (!current) throw app.httpErrors.notFound("AI agent not found");

        const nextStatus = body.status === "active" || body.status === "inactive" || body.status === "draft" ? body.status : current.status;
        if (current.status !== "active" && nextStatus === "active") {
          await assertAISeatAvailable(app, trx, tenantId, aiAgentId);
        }

        const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
        if (body.name !== undefined) updates.name = normalizeNonEmptyString(body.name) ?? "AI Agent";
        if (body.roleLabel !== undefined) updates.role_label = normalizeNonEmptyString(body.roleLabel) ?? null;
        if (body.personality !== undefined) updates.personality = normalizeNonEmptyString(body.personality) ?? null;
        if (body.scenePrompt !== undefined) updates.scene_prompt = normalizeNonEmptyString(body.scenePrompt) ?? null;
        if (body.systemPrompt !== undefined) updates.system_prompt = normalizeNonEmptyString(body.systemPrompt) ?? null;
        if (body.description !== undefined) updates.description = normalizeNonEmptyString(body.description) ?? null;
        if (body.status !== undefined) updates.status = nextStatus;

        const [updated] = await trx("tenant_ai_agents")
          .where({ tenant_id: tenantId, ai_agent_id: aiAgentId })
          .update(updates)
          .returning(["ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt", "description", "status", "created_at", "updated_at"]);

        return serializeAiAgentRow(updated as Record<string, unknown>);
      });
    } catch (error) {
      if ((error as Error).message === AI_SEAT_LIMIT_MESSAGE) {
        return reply.status(409).send({ error: "ai_seat_limit_exceeded", message: AI_SEAT_LIMIT_MESSAGE });
      }
      throw error;
    }
  });

  app.delete("/api/admin/ai-agents/:aiAgentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { aiAgentId } = req.params as { aiAgentId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const deleted = await trx("tenant_ai_agents")
        .where({ tenant_id: tenantId, ai_agent_id: aiAgentId })
        .delete();
      if (!deleted) throw app.httpErrors.notFound("AI agent not found");
      return { deleted: true, aiAgentId };
    });
  });
}
