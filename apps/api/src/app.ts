import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";

import { getMaxFileSize, getUploadsDir } from "./infra/storage/upload.service.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { agentRoutes } from "./modules/agent/agent.routes.js";
import { channelAdminRoutes } from "./modules/channel/channel-admin.routes.js";
import { channelGateway } from "./modules/channel/channel.gateway.js";
import { conversationRoutes } from "./modules/conversation/conversation.routes.js";
import { closeDatabase } from "./infra/db/client.js";
import { platformRoutes } from "./modules/platform/platform.routes.js";
import { realtimeRoutes } from "./modules/realtime/realtime.routes.js";
import { aiAdminRoutes } from "./modules/ai-admin/index.js";
import { adminGovernanceRoutes } from "./modules/admin-governance/index.js";
import { adminRoutingRoutes } from "./modules/admin-routing/index.js";
import { customerAdminRoutes } from "./modules/customer-admin/index.js";
import { memoryAdminRoutes } from "./modules/memory-admin/index.js";
import { opsWorkforceRoutes } from "./modules/ops-workforce/index.js";
import { orgAdminRoutes } from "./modules/org-admin/index.js";
import { qualityAdminRoutes } from "./modules/quality-admin/index.js";
import { supervisorAdminRoutes } from "./modules/supervisor-admin/index.js";
import { tenantContextPlugin } from "./modules/tenant/tenant.middleware.js";
import { uploadRoutes } from "./modules/upload/upload.routes.js";
import { webchatRoutes } from "./modules/webchat/webchat.routes.js";

type CrossOriginResourcePolicyValue = "same-origin" | "same-site" | "cross-origin";

function resolveHelmetCrossOriginResourcePolicy() {
  const value = process.env.HELMET_CROSS_ORIGIN_RESOURCE_POLICY?.trim();
  if (!value) return undefined;
  if (value === "false") {
    return false;
  }
  if (value === "same-origin" || value === "same-site" || value === "cross-origin") {
    return { policy: value as CrossOriginResourcePolicyValue };
  }
  return undefined;
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: { target: "pino-pretty" },
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  await app.register(helmet, {
    crossOriginResourcePolicy: resolveHelmetCrossOriginResourcePolicy()
  });
  await app.register(sensible);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me"
  });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true
  });
  await app.register(multipart, { limits: { fileSize: getMaxFileSize() } });
  await app.register(fastifyStatic, {
    root: getUploadsDir(),
    prefix: "/uploads/",
    decorateReply: false
  });

  app.get("/health", async () => ({
    status: "ok",
    ts: new Date().toISOString()
  }));

  await app.register(authRoutes);
  await app.register(platformRoutes);
  await app.register(tenantContextPlugin);
  await app.register(channelGateway);
  await app.register(realtimeRoutes);
  await app.register(webchatRoutes);
  await app.register(uploadRoutes);
  await app.register(conversationRoutes);
  await app.register(agentRoutes);
  await app.register(channelAdminRoutes);
  await app.register(aiAdminRoutes);
  await app.register(adminRoutingRoutes);
  await app.register(opsWorkforceRoutes);
  await app.register(supervisorAdminRoutes);
  await app.register(adminGovernanceRoutes);
  await app.register(orgAdminRoutes);
  await app.register(qualityAdminRoutes);
  await app.register(memoryAdminRoutes);
  await app.register(customerAdminRoutes);

  app.addHook("onClose", async () => {
    await closeDatabase();
  });

  return app;
}
