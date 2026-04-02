import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { buildChannelConfigPayload, createWhatsAppChannelConfig, ensureTenantChannelConfigs, normalizeTenantChannelType, serializeTenantChannelConfig } from "./tenant-channel-config.service.js";
import { type ChannelConfigMutationBody, normalizeChannelAdminString, parseStoredChannelConfig } from "./channel-admin.serializer.js";
import { buildWebChannelLinkInfo, buildWebhookChannelLinkInfo } from "./channel-web-link.helper.js";
import { buildEmbeddedSignupSetupView, hydrateEmbeddedSignupBinding } from "./whatsapp-embedded-signup.service.js";

export async function channelAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/channel-configs", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await ensureTenantChannelConfigs(trx, tenantId);
      return rows.map((row) => serializeTenantChannelConfig(row));
    });
  });

  // 创建新的 WhatsApp 渠道实例（多号码支持）
  app.post("/api/admin/channel-configs/whatsapp", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const body = req.body as { label?: string; usageScene?: string; isPrimary?: boolean } | undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const created = await createWhatsAppChannelConfig(trx, tenantId, {
        label: typeof body?.label === "string" ? body.label.trim() || undefined : undefined,
        usageScene: typeof body?.usageScene === "string" ? body.usageScene.trim() || undefined : undefined,
        isPrimary: typeof body?.isPrimary === "boolean" ? body.isPrimary : undefined
      });
      return serializeTenantChannelConfig(created);
    });
  });

  app.post("/api/admin/channel-configs", async () => {
    throw app.httpErrors.methodNotAllowed("Use POST /api/admin/channel-configs/whatsapp to add a WhatsApp instance");
  });

  app.get("/api/admin/channel-configs/web-link", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      await ensureTenantChannelConfigs(trx, tenantId);
      const row = await trx("channel_configs")
        .select("channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, channel_type: "web" })
        .orderBy("created_at", "desc")
        .first<{ channel_id: string; encrypted_config: string; is_active: boolean }>();

      if (!row) {
        throw app.httpErrors.notFound("WEB channel not found");
      }

      const config = parseStoredChannelConfig(row.encrypted_config);
      const publicChannelKey = typeof config.publicChannelKey === "string" ? config.publicChannelKey : null;
      return buildWebChannelLinkInfo({
        channelId: row.channel_id,
        publicChannelKey,
        isActive: row.is_active
      });
    });
  });

  app.get("/api/admin/channel-configs/webhook-link/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      await ensureTenantChannelConfigs(trx, tenantId);
      const row = await trx("channel_configs")
        .select("channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId, channel_type: "webhook" })
        .first<{ channel_id: string; encrypted_config: string; is_active: boolean }>();

      if (!row) {
        throw app.httpErrors.notFound("Webhook channel not found");
      }

      const config = parseStoredChannelConfig(row.encrypted_config);
      const outboundWebhookUrl = typeof config.outboundWebhookUrl === "string" ? config.outboundWebhookUrl : null;
      return buildWebhookChannelLinkInfo({
        channelId: row.channel_id,
        isActive: row.is_active,
        outboundWebhookUrl
      });
    });
  });

  // 实例级 setup（新接口，前端应使用此接口）
  app.get("/api/admin/channel-configs/:configId/whatsapp/setup", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("channel_configs")
        .select("encrypted_config")
        .where({ tenant_id: tenantId, config_id: configId, channel_type: "whatsapp" })
        .first<{ encrypted_config: unknown }>();
      if (!row) {
        throw app.httpErrors.notFound("WhatsApp channel config not found");
      }
      return buildEmbeddedSignupSetupView(parseStoredChannelConfig(row.encrypted_config));
    });
  });

  app.post("/api/admin/channel-configs/:configId/whatsapp/embedded-signup/complete", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };
    const body = req.body as {
      phoneNumberId?: string;
      wabaId?: string;
      businessAccountName?: string;
      displayPhoneNumber?: string;
    };

    const phoneNumberId = normalizeChannelAdminString(body.phoneNumberId);
    if (!phoneNumberId) {
      throw app.httpErrors.badRequest("phoneNumberId is required");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      await ensureTenantChannelConfigs(trx, tenantId);
      const row = await trx("channel_configs")
        .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId, channel_type: "whatsapp" })
        .first<{
          config_id: string;
          tenant_id: string;
          channel_type: string;
          channel_id: string;
          encrypted_config: unknown;
          is_active: boolean;
        }>();
      if (!row) {
        throw app.httpErrors.notFound("WhatsApp channel config not found");
      }

      const currentConfig = parseStoredChannelConfig(row.encrypted_config);
      const binding = await hydrateEmbeddedSignupBinding({
        phoneNumberId,
        wabaId: normalizeChannelAdminString(body.wabaId),
        businessAccountName: normalizeChannelAdminString(body.businessAccountName),
        displayPhoneNumber: normalizeChannelAdminString(body.displayPhoneNumber)
      });

      const nextConfig = buildChannelConfigPayload("whatsapp", currentConfig, {
        phoneNumberId: binding.phoneNumberId,
        wabaId: binding.wabaId ?? undefined,
        businessAccountName: binding.businessAccountName ?? undefined,
        displayPhoneNumber: binding.displayPhoneNumber ?? undefined
      });
      nextConfig.onboardingStatus = "bound";
      nextConfig.connectedAt = new Date().toISOString();

      try {
        await trx("channel_configs")
          .where({ tenant_id: tenantId, config_id: configId })
          .update({
            encrypted_config: JSON.stringify(nextConfig),
            is_active: true,
            updated_at: trx.fn.now()
          });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw app.httpErrors.badRequest("Phone Number ID is already bound");
        }
        throw error;
      }

      const updatedRow = await trx("channel_configs")
        .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!updatedRow) {
        throw app.httpErrors.notFound("Channel config not found");
      }

      return serializeTenantChannelConfig(updatedRow as {
        config_id: string;
        tenant_id: string;
        channel_type: string;
        channel_id: string;
        encrypted_config: unknown;
        is_active: boolean;
      });
    });
  });

  // 解绑 WhatsApp 号码：清空绑定数据 + 停用实例
  app.post("/api/admin/channel-configs/:configId/whatsapp/unbind", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("channel_configs")
        .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId, channel_type: "whatsapp" })
        .first<{
          config_id: string;
          tenant_id: string;
          channel_type: string;
          channel_id: string;
          encrypted_config: unknown;
          is_active: boolean;
        }>();
      if (!row) {
        throw app.httpErrors.notFound("WhatsApp channel config not found");
      }

      const currentConfig = parseStoredChannelConfig(row.encrypted_config);
      // 清空所有绑定数据，使 phoneNumberId 唯一约束释放
      const nextConfig = { ...currentConfig };
      delete nextConfig.phoneNumberId;
      delete nextConfig.wabaId;
      delete nextConfig.displayPhoneNumber;
      delete nextConfig.businessAccountName;
      delete nextConfig.connectedAt;
      nextConfig.onboardingStatus = "unbound";

      await trx("channel_configs")
        .where({ tenant_id: tenantId, config_id: configId })
        .update({
          encrypted_config: JSON.stringify(nextConfig),
          is_active: false,
          updated_at: trx.fn.now()
        });

      const updatedRow = await trx("channel_configs")
        .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!updatedRow) throw app.httpErrors.notFound("Channel config not found");

      return serializeTenantChannelConfig(updatedRow as {
        config_id: string;
        tenant_id: string;
        channel_type: string;
        channel_id: string;
        encrypted_config: unknown;
        is_active: boolean;
      });
    });
  });

  app.patch("/api/admin/channel-configs/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };
    const body = req.body as ChannelConfigMutationBody;

    return withTenantTransaction(tenantId, async (trx) => {
      await ensureTenantChannelConfigs(trx, tenantId);

      const row = await trx("channel_configs")
        .select("channel_type", "encrypted_config")
        .where({ tenant_id: tenantId, config_id: configId })
        .first<{ channel_type: string; encrypted_config: unknown }>();
      if (!row) throw app.httpErrors.notFound("Channel config not found");

      const currentConfig = parseStoredChannelConfig(row.encrypted_config);
      const channelType = normalizeTenantChannelType(row.channel_type);
      if (!channelType) throw app.httpErrors.badRequest("Unsupported channelType");
      const nextConfig = buildChannelConfigPayload(channelType, currentConfig, body);

      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.isActive !== undefined) updates.is_active = body.isActive;
      if (body.channelId !== undefined) {
        const nextChannelId = normalizeChannelAdminString(body.channelId);
        if (!nextChannelId) {
          throw app.httpErrors.badRequest("channelId cannot be empty");
        }
        updates.channel_id = nextChannelId;
      }
      updates.encrypted_config = JSON.stringify(nextConfig);

      try {
        const updated = await trx("channel_configs")
          .where({ tenant_id: tenantId, config_id: configId })
          .update(updates);
        if (!updated) throw app.httpErrors.notFound("Channel config not found");
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          throw app.httpErrors.badRequest("Channel config conflict: key/channel already used");
        }
        throw error;
      }

      const updatedRow = await trx("channel_configs")
        .select("config_id", "tenant_id", "channel_type", "channel_id", "encrypted_config", "is_active")
        .where({ tenant_id: tenantId, config_id: configId })
        .first();
      if (!updatedRow) {
        throw app.httpErrors.notFound("Channel config not found");
      }

      return serializeTenantChannelConfig(updatedRow as {
        config_id: string;
        tenant_id: string;
        channel_type: string;
        channel_id: string;
        encrypted_config: unknown;
        is_active: boolean;
      });
    });
  });

  // 仅允许删除未绑定 (onboardingStatus=unbound) 的 WhatsApp 实例
  // web / webhook 不允许删除，使用 isActive=false 停用
  app.delete("/api/admin/channel-configs/:configId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    const { configId } = req.params as { configId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("channel_configs")
        .select("config_id", "channel_type", "encrypted_config")
        .where({ tenant_id: tenantId, config_id: configId })
        .first<{ config_id: string; channel_type: string; encrypted_config: unknown }>();
      if (!row) throw app.httpErrors.notFound("Channel config not found");

      if (row.channel_type !== "whatsapp") {
        throw app.httpErrors.methodNotAllowed("Only WhatsApp channel instances can be deleted; set isActive=false to disable other channels");
      }

      const config = parseStoredChannelConfig(row.encrypted_config);
      if (config.onboardingStatus !== "unbound" || config.phoneNumberId) {
        throw app.httpErrors.badRequest("WhatsApp instance must be unbound before deletion; call /whatsapp/unbind first");
      }

      await trx("channel_configs").where({ tenant_id: tenantId, config_id: configId }).delete();
      return { deleted: true };
    });
  });
}
