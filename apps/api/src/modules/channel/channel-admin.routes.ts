import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { buildChannelConfigPayload, ensureTenantChannelConfigs, normalizeTenantChannelType, serializeTenantChannelConfig } from "./tenant-channel-config.service.js";
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

  app.post("/api/admin/channel-configs", async () => {
    throw app.httpErrors.methodNotAllowed("Channel configs are provisioned per tenant automatically and cannot be created manually");
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

  app.get("/api/admin/channel-configs/whatsapp/setup", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw app.httpErrors.badRequest("Missing tenant context");
    }

    return withTenantTransaction(tenantId, async (trx) => {
      await ensureTenantChannelConfigs(trx, tenantId);
      const row = await trx("channel_configs")
        .select("encrypted_config")
        .where({ tenant_id: tenantId, channel_type: "whatsapp" })
        .first<{ encrypted_config: unknown }>();
      return buildEmbeddedSignupSetupView(parseStoredChannelConfig(row?.encrypted_config ?? {}));
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

  app.delete("/api/admin/channel-configs/:configId", async () => {
    throw app.httpErrors.methodNotAllowed("Channel configs cannot be deleted; set isActive=false instead");
  });
}
