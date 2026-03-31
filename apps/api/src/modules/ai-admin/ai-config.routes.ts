import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { requiresAIProviderApiKeyOnCreate } from "../../../../../packages/shared-types/src/ai-model-config.js";
import { normalizeNonEmptyString, parseJsonObject } from "../tenant/tenant-admin.shared.js";
import {
  assertTenantCanManageAIConfig,
  defaultModelForProvider,
  normalizeProvider,
  parseAIConfigKeyBag,
  pickTenantAIConfig,
  readAIProviderApiKey,
  readAIProviderBaseUrl,
  serializeAIConfigRow,
  setAIProviderApiKey,
  setAIProviderBaseUrl
} from "./ai-admin.shared.js";

export async function registerAIConfigAdminRoutes(app: FastifyInstance) {
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
          const provider = normalizeProvider(cfg.provider);
          return {
            config_id: cfg.config_id,
            name: cfg.name,
            provider: cfg.provider,
            model_name: cfg.model,
            temperature: typeof quotas.temperature === "number" ? quotas.temperature : 0.4,
            max_tokens: typeof quotas.maxTokens === "number" ? quotas.maxTokens : 500,
            system_prompt_override: typeof quotas.systemPromptOverride === "string" ? quotas.systemPromptOverride : null,
            has_api_key: Boolean(readAIProviderApiKey(parseAIConfigKeyBag(cfg.encrypted_api_key), provider)),
            base_url: readAIProviderBaseUrl(quotas, provider),
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
    await assertTenantCanManageAIConfig(app, tenantId);

    const body = req.body as {
      name?: string;
      provider?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
      systemPromptOverride?: string | null;
      encryptedApiKey?: string;
      baseUrl?: string | null;
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

      const quotas: Record<string, unknown> = {
        temperature: body.temperature !== undefined ? Math.max(0, Math.min(2, body.temperature)) : 0.4,
        maxTokens: body.maxTokens !== undefined ? Math.max(100, Math.min(4000, body.maxTokens)) : 500,
        systemPromptOverride: body.systemPromptOverride ?? null
      };
      if (body.baseUrl !== undefined) {
        setAIProviderBaseUrl(quotas, provider, body.baseUrl);
      }

      const keyBag: Record<string, unknown> = {};
      if (body.encryptedApiKey) {
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
      }

      if (body.isDefault) {
        await trx("ai_configs").where({ tenant_id: tenantId }).update({ is_default: false, updated_at: trx.fn.now() });
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
        .returning(["config_id", "name", "provider", "model", "quotas", "is_default", "is_active", "created_at", "updated_at"]);

      return serializeAIConfigRow(created as Record<string, unknown>);
    });
  });

  app.patch("/api/admin/ai-config", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(app, tenantId);

    const body = req.body as {
      provider?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
      systemPromptOverride?: string | null;
      encryptedApiKey?: string;
      baseUrl?: string | null;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const currentConfig = await pickTenantAIConfig(trx, tenantId);
      if (!currentConfig) throw app.httpErrors.notFound("AI config not found");
      const targetConfigId = currentConfig.config_id as string;
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };

      if (body.provider !== undefined) updates.provider = normalizeProvider(body.provider);
      if (body.modelName !== undefined) updates.model = body.modelName;
      if (body.encryptedApiKey !== undefined) {
        const provider = normalizeProvider(String(updates.provider ?? currentConfig.provider ?? "openai"));
        const keyBag = parseAIConfigKeyBag(currentConfig.encrypted_api_key);
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
        updates.encrypted_api_key = JSON.stringify(keyBag);
      }

      if (body.temperature !== undefined || body.maxTokens !== undefined || body.systemPromptOverride !== undefined || body.baseUrl !== undefined) {
        const quotas = parseJsonObject(currentConfig.quotas);
        if (body.temperature !== undefined) quotas.temperature = Math.max(0, Math.min(2, body.temperature));
        if (body.maxTokens !== undefined) quotas.maxTokens = Math.max(100, Math.min(4000, body.maxTokens));
        if (body.systemPromptOverride !== undefined) quotas.systemPromptOverride = body.systemPromptOverride;
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
    await assertTenantCanManageAIConfig(app, tenantId);
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
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const current = await trx("ai_configs")
        .select("config_id", "quotas", "provider", "encrypted_api_key")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!current) throw app.httpErrors.notFound("AI config not found");

      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.provider !== undefined) updates.provider = normalizeProvider(body.provider);
      if (body.name !== undefined) updates.name = normalizeNonEmptyString(body.name) ?? "AI Config";
      if (body.modelName !== undefined) updates.model = body.modelName;
      if (body.encryptedApiKey !== undefined) {
        const provider = normalizeProvider(String(updates.provider ?? current.provider ?? "openai"));
        const keyBag = parseAIConfigKeyBag(current.encrypted_api_key);
        setAIProviderApiKey(keyBag, provider, body.encryptedApiKey);
        updates.encrypted_api_key = JSON.stringify(keyBag);
      }
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      if (body.temperature !== undefined || body.maxTokens !== undefined || body.systemPromptOverride !== undefined || body.baseUrl !== undefined) {
        const quotas = parseJsonObject(current.quotas);
        if (body.temperature !== undefined) quotas.temperature = Math.max(0, Math.min(2, body.temperature));
        if (body.maxTokens !== undefined) quotas.maxTokens = Math.max(100, Math.min(4000, body.maxTokens));
        if (body.systemPromptOverride !== undefined) quotas.systemPromptOverride = body.systemPromptOverride;
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
    await assertTenantCanManageAIConfig(app, tenantId);
    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const target = await trx("ai_configs").select("config_id").where({ tenant_id: tenantId, config_id: configId }).first();
      if (!target) throw app.httpErrors.notFound("AI config not found");

      await trx("ai_configs").where({ tenant_id: tenantId }).update({ is_default: false, updated_at: trx.fn.now() });
      await trx("ai_configs").where({ tenant_id: tenantId, config_id: configId }).update({ is_default: true, updated_at: trx.fn.now() });

      return { updated: true, config_id: configId };
    });
  });

  app.delete("/api/admin/ai-configs/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    await assertTenantCanManageAIConfig(app, tenantId);
    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("ai_configs")
        .select("config_id", "is_default")
        .where({ tenant_id: tenantId, config_id: configId })
        .first<{ config_id: string; is_default: boolean }>();
      if (!row) throw app.httpErrors.notFound("AI config not found");

      const countRow = await trx("ai_configs").where({ tenant_id: tenantId }).count<{ cnt: string }>("config_id as cnt").first();
      if (Number(countRow?.cnt ?? 0) <= 1) {
        throw app.httpErrors.badRequest("At least one AI config must be kept");
      }

      await trx("ai_configs").where({ tenant_id: tenantId, config_id: configId }).del();

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
}
