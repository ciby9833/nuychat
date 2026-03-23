import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";
import { attachTenantAdminGuard } from "./tenant-admin.auth.js";
import {
  defaultModelForProvider,
  normalizeNonEmptyString,
  normalizeProvider,
  parseJsonObject,
  pickTenantAIConfig,
  parseAIConfigKeyBag,
  readAIProviderApiKey,
  readAIProviderBaseUrl,
  serializeAIConfigRow,
  setAIProviderApiKey,
  setAIProviderBaseUrl,
  toNumber
} from "./tenant-admin.shared.js";
import { requiresAIProviderApiKeyOnCreate } from "../../../../../packages/shared-types/src/ai-model-config.js";

export async function tenantCustomerIntelligenceRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);
  const aiSeatLimitMessage = "Licensed AI seat limit reached";

  async function assertTenantCanManageAIConfig(tenantId: string) {
    return withTenantTransaction(tenantId, async (trx) => {
      const tenant = await trx("tenants")
        .select("ai_model_access_mode")
        .where({ tenant_id: tenantId })
        .first<{ ai_model_access_mode: string } | undefined>();

      if (!tenant) throw app.httpErrors.notFound("Tenant not found");
      if (tenant.ai_model_access_mode !== "tenant_managed") {
        throw app.httpErrors.forbidden("AI model configuration is managed by platform");
      }
    });
  }

  async function assertAISeatAvailable(trx: Knex.Transaction, tenantId: string, ignoreAiAgentId?: string) {
    const tenant = await trx("tenants")
      .select("licensed_ai_seats")
      .where({ tenant_id: tenantId })
      .first<{ licensed_ai_seats: number | null } | undefined>();

    if (!tenant) throw app.httpErrors.notFound("Tenant not found");

    const licensed = Number(tenant.licensed_ai_seats ?? 0);
    const row = await trx("tenant_ai_agents")
      .where({ tenant_id: tenantId, status: "active" })
      .modify((query) => {
        if (ignoreAiAgentId) query.whereNot({ ai_agent_id: ignoreAiAgentId });
      })
      .count<{ cnt: string }>("ai_agent_id as cnt")
      .first();

    const used = Number(row?.cnt ?? 0);
    if (used >= licensed) {
      throw app.httpErrors.conflict(aiSeatLimitMessage);
    }
  }

  app.get("/api/admin/ai-agents", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const [tenant, aiConfig, rows, activeRow] = await Promise.all([
        trx("tenants")
          .select("licensed_ai_seats", "ai_model_access_mode")
          .where({ tenant_id: tenantId })
          .first<{ licensed_ai_seats: number | null; ai_model_access_mode: string | null } | undefined>(),
        pickTenantAIConfig(trx, tenantId),
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
          aiProvider: aiConfig ? String(aiConfig.provider ?? "openai") : null,
          aiModel: aiConfig ? String(aiConfig.model ?? "gpt-4o-mini") : null
        },
        items: rows.map((row) => ({
          aiAgentId: row.ai_agent_id,
          name: row.name,
          roleLabel: row.role_label ?? null,
          personality: row.personality ?? null,
          scenePrompt: row.scene_prompt ?? null,
          systemPrompt: row.system_prompt ?? null,
          description: row.description ?? null,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      };
    });
  });

  app.post("/api/admin/customer-intelligence/reindex/customers/:customerId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { customerId } = req.params as { customerId: string };

    const exists = await withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("customers")
        .where({ tenant_id: tenantId, customer_id: customerId })
        .select("customer_id")
        .first();
      return Boolean(row);
    });
    if (!exists) throw app.httpErrors.notFound("Customer not found");

    await scheduleLongTask({
      tenantId,
      customerId,
      conversationId: null,
      taskType: "vector_customer_profile_reindex",
      title: `Vector reindex ${customerId}`,
      source: "workflow",
      priority: 70,
      payload: { customerId }
    });

    return { queued: true, customerId };
  });

  app.post("/api/admin/customer-intelligence/reindex/batch", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = (req.body as { customerIds?: string[]; limit?: number } | undefined) ?? {};
    const customerIds = Array.isArray(body.customerIds)
      ? Array.from(new Set(body.customerIds.map((item) => String(item).trim()).filter(Boolean)))
      : [];
    const limit = typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 500)) : 100;

    await scheduleLongTask({
      tenantId,
      customerId: null,
      conversationId: null,
      taskType: "vector_batch_reindex",
      title: "Vector batch reindex",
      source: "workflow",
      priority: 75,
      payload: customerIds.length > 0 ? { customerIds } : { limit }
    });

    return {
      queued: true,
      mode: customerIds.length > 0 ? "selected_customers" : "latest_customers",
      customerCount: customerIds.length > 0 ? customerIds.length : limit
    };
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
    const roleLabel = normalizeNonEmptyString(body.roleLabel) ?? null;
    const personality = normalizeNonEmptyString(body.personality) ?? null;
    const scenePrompt = normalizeNonEmptyString(body.scenePrompt) ?? null;
    const systemPrompt = normalizeNonEmptyString(body.systemPrompt) ?? null;
    const description = normalizeNonEmptyString(body.description) ?? null;
    const status = body.status === "active" || body.status === "inactive" || body.status === "draft" ? body.status : "draft";
    if (!name) throw app.httpErrors.badRequest("AI agent name is required");

    try {
      return await withTenantTransaction(tenantId, async (trx) => {
        if (status === "active") {
          await assertAISeatAvailable(trx, tenantId);
        }
        const [created] = await trx("tenant_ai_agents")
          .insert({
            tenant_id: tenantId,
            name,
            role_label: roleLabel,
            personality,
            scene_prompt: scenePrompt,
            system_prompt: systemPrompt,
            description,
            status
          })
          .returning(["ai_agent_id", "name", "role_label", "personality", "scene_prompt", "system_prompt", "description", "status", "created_at", "updated_at"]);

        return {
          aiAgentId: created.ai_agent_id,
          name: created.name,
          roleLabel: created.role_label ?? null,
          personality: created.personality ?? null,
          scenePrompt: created.scene_prompt ?? null,
          systemPrompt: created.system_prompt ?? null,
          description: created.description ?? null,
          status: created.status,
          createdAt: created.created_at,
          updatedAt: created.updated_at
        };
      });
    } catch (error) {
      if ((error as Error).message === aiSeatLimitMessage) {
        return reply.status(409).send({ error: "ai_seat_limit_exceeded", message: aiSeatLimitMessage });
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
          await assertAISeatAvailable(trx, tenantId, aiAgentId);
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

        return {
          aiAgentId: updated.ai_agent_id,
          name: updated.name,
          roleLabel: updated.role_label ?? null,
          personality: updated.personality ?? null,
          scenePrompt: updated.scene_prompt ?? null,
          systemPrompt: updated.system_prompt ?? null,
          description: updated.description ?? null,
          status: updated.status,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at
        };
      });
    } catch (error) {
      if ((error as Error).message === aiSeatLimitMessage) {
        return reply.status(409).send({ error: "ai_seat_limit_exceeded", message: aiSeatLimitMessage });
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

  app.get("/api/admin/ai-configs", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("ai_configs")
        .select(
          "config_id",
          "name",
          "provider",
          "model",
          "encrypted_api_key",
          "quotas",
          "is_default",
          "is_active",
          "updated_at",
          "created_at"
        )
        .where({ tenant_id: tenantId })
        .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }]);

      return {
        configs: rows.map((cfg) => {
          const quotas = parseJsonObject(cfg.quotas);
          return {
            config_id: cfg.config_id,
            name: cfg.name,
            provider: cfg.provider,
            model_name: cfg.model,
            temperature: toNumber(quotas.temperature, 0.4),
            max_tokens: toNumber(quotas.maxTokens, 500),
            system_prompt_override: typeof quotas.systemPromptOverride === "string" ? quotas.systemPromptOverride : null,
            integrations: (quotas.integrations as Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>) ?? {},
            has_api_key: Boolean(readAIProviderApiKey(parseAIConfigKeyBag(cfg.encrypted_api_key), normalizeProvider(cfg.provider))),
            base_url: readAIProviderBaseUrl(quotas, normalizeProvider(cfg.provider)),
            is_default: Boolean(cfg.is_default),
            is_active: Boolean(cfg.is_active),
            created_at: cfg.created_at,
            updated_at: cfg.updated_at
          };
        })
      };
    });
  });

  app.get("/api/admin/ai-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const cfg = await pickTenantAIConfig(trx, tenantId);
      if (!cfg) throw app.httpErrors.notFound("AI config not found");
      return serializeAIConfigRow(cfg);
    });
  });

  app.post("/api/admin/ai-configs", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(tenantId);

    const body = req.body as {
      name?: string;
      provider?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
      systemPromptOverride?: string | null;
      encryptedApiKey?: string;
      baseUrl?: string | null;
      integrations?: Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>;
      isActive?: boolean;
      isDefault?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const provider = normalizeProvider(body.provider);
      const modelName = normalizeNonEmptyString(body.modelName) ?? defaultModelForProvider(provider);
      const name = normalizeNonEmptyString(body.name) ?? `${provider.toUpperCase()} Profile`;
      if (requiresAIProviderApiKeyOnCreate(provider) && !normalizeNonEmptyString(body.encryptedApiKey)) {
        throw app.httpErrors.badRequest("API key is required when creating this model config");
      }
      const quotas: Record<string, unknown> = {};
      quotas.temperature = body.temperature !== undefined ? Math.max(0, Math.min(2, body.temperature)) : 0.4;
      quotas.maxTokens = body.maxTokens !== undefined ? Math.max(100, Math.min(4000, body.maxTokens)) : 500;
      quotas.systemPromptOverride = body.systemPromptOverride ?? null;
      quotas.integrations = body.integrations ?? {};
      if (body.baseUrl !== undefined) {
        setAIProviderBaseUrl(quotas, provider, body.baseUrl);
      }

      const keyBag: Record<string, unknown> = {};
      if (body.encryptedApiKey) {
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
      }

      if (body.isDefault) {
        await trx("ai_configs")
          .where({ tenant_id: tenantId })
          .update({ is_default: false, updated_at: trx.fn.now() });
      }

      const [created] = await trx("ai_configs")
        .insert({
          tenant_id: tenantId,
          name,
          provider,
          model: modelName,
          encrypted_api_key: JSON.stringify(keyBag),
          quotas: JSON.stringify(quotas),
          is_active: body.isActive ?? true,
          is_default: body.isDefault ?? false
        })
        .returning([
          "config_id",
          "name",
          "provider",
          "model",
          "quotas",
          "is_default",
          "is_active",
          "created_at",
          "updated_at"
        ]);

      return serializeAIConfigRow(created);
    });
  });

  app.patch("/api/admin/ai-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(tenantId);

    const body = req.body as {
      provider?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
      systemPromptOverride?: string | null;
      encryptedApiKey?: string;
      baseUrl?: string | null;
      integrations?: Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const currentConfig = await pickTenantAIConfig(trx, tenantId);
      if (!currentConfig) throw app.httpErrors.notFound("AI config not found");
      const targetConfigId = currentConfig.config_id as string;

      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };

      if (body.provider !== undefined) {
        updates.provider = normalizeProvider(body.provider);
      }
      if (body.modelName !== undefined) updates.model = body.modelName;
      if (body.encryptedApiKey !== undefined) {
        const provider = normalizeProvider(String(updates.provider ?? currentConfig.provider ?? "openai"));
        const keyBag = parseAIConfigKeyBag(currentConfig.encrypted_api_key);
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
        updates.encrypted_api_key = JSON.stringify(keyBag);
      }

      if (
        body.temperature !== undefined ||
        body.maxTokens !== undefined ||
        body.systemPromptOverride !== undefined ||
        body.integrations !== undefined
      ) {
        const quotas = parseJsonObject(currentConfig.quotas);
        if (body.temperature !== undefined) {
          quotas.temperature = Math.max(0, Math.min(2, body.temperature));
        }
        if (body.maxTokens !== undefined) {
          quotas.maxTokens = Math.max(100, Math.min(4000, body.maxTokens));
        }
        if (body.systemPromptOverride !== undefined) {
          quotas.systemPromptOverride = body.systemPromptOverride;
        }
        if (body.integrations !== undefined) {
          quotas.integrations = body.integrations;
        }
        if (body.baseUrl !== undefined) {
          const provider = normalizeProvider(String(updates.provider ?? currentConfig.provider ?? "openai"));
          setAIProviderBaseUrl(quotas, provider, body.baseUrl);
        }
        updates.quotas = JSON.stringify(quotas);
      }

      await trx("ai_configs").where({ tenant_id: tenantId, config_id: targetConfigId }).update(updates);
      return { updated: true, config_id: targetConfigId };
    });
  });

  app.patch("/api/admin/ai-configs/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(tenantId);
    const { configId } = req.params as { configId: string };

    const body = req.body as {
      name?: string;
      provider?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
      systemPromptOverride?: string | null;
      encryptedApiKey?: string;
      baseUrl?: string | null;
      integrations?: Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>;
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const current = await trx("ai_configs")
        .select("config_id", "quotas", "provider", "encrypted_api_key")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!current) throw app.httpErrors.notFound("AI config not found");

      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };

      if (body.provider !== undefined) {
        updates.provider = normalizeProvider(body.provider);
      }
      if (body.name !== undefined) updates.name = normalizeNonEmptyString(body.name) ?? "AI Config";
      if (body.modelName !== undefined) updates.model = body.modelName;
      if (body.encryptedApiKey !== undefined) {
        const provider = normalizeProvider(String(updates.provider ?? current.provider ?? "openai"));
        const keyBag = parseAIConfigKeyBag(current.encrypted_api_key);
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
        updates.encrypted_api_key = JSON.stringify(keyBag);
      }
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      if (
        body.temperature !== undefined ||
        body.maxTokens !== undefined ||
        body.systemPromptOverride !== undefined ||
        body.integrations !== undefined
      ) {
        const quotas = parseJsonObject(current.quotas);
        if (body.temperature !== undefined) {
          quotas.temperature = Math.max(0, Math.min(2, body.temperature));
        }
        if (body.maxTokens !== undefined) {
          quotas.maxTokens = Math.max(100, Math.min(4000, body.maxTokens));
        }
        if (body.systemPromptOverride !== undefined) {
          quotas.systemPromptOverride = body.systemPromptOverride;
        }
        if (body.integrations !== undefined) {
          quotas.integrations = body.integrations;
        }
        if (body.baseUrl !== undefined) {
          const provider = normalizeProvider(String(updates.provider ?? current.provider ?? "openai"));
          setAIProviderBaseUrl(quotas, provider, body.baseUrl);
        }
        updates.quotas = JSON.stringify(quotas);
      }

      await trx("ai_configs").where({ tenant_id: tenantId, config_id: configId }).update(updates);
      return { updated: true, config_id: configId };
    });
  });

  app.post("/api/admin/ai-configs/:configId/set-default", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(tenantId);
    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const target = await trx("ai_configs")
        .select("config_id")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!target) throw app.httpErrors.notFound("AI config not found");

      await trx("ai_configs")
        .where({ tenant_id: tenantId })
        .update({ is_default: false, updated_at: trx.fn.now() });

      await trx("ai_configs")
        .where({ tenant_id: tenantId, config_id: configId })
        .update({ is_default: true, updated_at: trx.fn.now() });

      return { updated: true, config_id: configId };
    });
  });

  app.delete("/api/admin/ai-configs/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(tenantId);
    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("ai_configs")
        .select("config_id", "is_default")
        .where({ tenant_id: tenantId, config_id: configId })
        .first<{ config_id: string; is_default: boolean }>();
      if (!row) throw app.httpErrors.notFound("AI config not found");

      const countRow = await trx("ai_configs")
        .where({ tenant_id: tenantId })
        .count<{ cnt: string }>("config_id as cnt")
        .first();
      const total = Number(countRow?.cnt ?? 0);
      if (total <= 1) {
        throw app.httpErrors.badRequest("At least one AI config must be kept");
      }

      await trx("ai_configs")
        .where({ tenant_id: tenantId, config_id: configId })
        .del();

      if (row.is_default) {
        const fallback = await trx("ai_configs")
          .select("config_id")
          .where({ tenant_id: tenantId })
          .orderBy("updated_at", "desc")
          .first<{ config_id: string }>();
        if (fallback) {
          await trx("ai_configs")
            .where({ tenant_id: tenantId, config_id: fallback.config_id })
            .update({ is_default: true, updated_at: trx.fn.now() });
        }
      }

      return { deleted: true, config_id: configId };
    });
  });

  app.get("/api/admin/knowledge-base", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { category?: string; search?: string; page?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = 20;
    const offset = (page - 1) * limit;

    return withTenantTransaction(tenantId, async (trx) => {
      const qb = trx("knowledge_base_entries")
        .select("entry_id", "category", "title", "content", "tags", "is_active", "hit_count", "created_at", "updated_at")
        .where({ tenant_id: tenantId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset);

      if (query.category) qb.where("category", query.category);
      if (query.search) {
        const tsq = String(query.search).split(/\s+/).filter(Boolean).join(" | ");
        qb.whereRaw("search_vector @@ to_tsquery('simple', ?)", [tsq]);
      }

      const [rows, countRow] = await Promise.all([
        qb,
        trx("knowledge_base_entries").where({ tenant_id: tenantId }).count("entry_id as cnt").first()
      ]);

      return { entries: rows, total: Number((countRow as { cnt: string })?.cnt ?? 0), page, limit };
    });
  });

  app.post("/api/admin/knowledge-base", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
    };

    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title) throw app.httpErrors.badRequest("title is required");
    if (!content) throw app.httpErrors.badRequest("content is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const [entry] = await trx("knowledge_base_entries")
        .insert({
          tenant_id: tenantId,
          category: body.category ?? "general",
          title,
          content,
          tags: JSON.stringify(body.tags ?? [])
        })
        .returning(["entry_id", "category", "title", "is_active", "created_at"]);
      return entry;
    });
  });

  app.patch("/api/admin/knowledge-base/:entryId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { entryId } = req.params as { entryId: string };
    const body = req.body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.category !== undefined) updates.category = body.category;
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.content !== undefined) updates.content = body.content.trim();
      if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      const affected = await trx("knowledge_base_entries")
        .where({ tenant_id: tenantId, entry_id: entryId })
        .update(updates);

      if (affected === 0) throw app.httpErrors.notFound("KB entry not found");
      return { updated: true };
    });
  });

  app.delete("/api/admin/knowledge-base/:entryId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { entryId } = req.params as { entryId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const affected = await trx("knowledge_base_entries")
        .where({ tenant_id: tenantId, entry_id: entryId })
        .update({ is_active: false, updated_at: trx.fn.now() });

      if (affected === 0) throw app.httpErrors.notFound("KB entry not found");
      return { deactivated: true };
    });
  });
}
