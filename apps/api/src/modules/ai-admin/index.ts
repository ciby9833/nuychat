import type { FastifyInstance } from "fastify";

import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { registerAIAgentAdminRoutes } from "./ai-agents.routes.js";
import { registerAIConfigAdminRoutes } from "./ai-config.routes.js";
import { registerAIRuntimePolicyAdminRoutes } from "./ai-runtime-policy.routes.js";
import { registerCustomerIntelligenceAdminRoutes } from "./customer-intelligence-admin.routes.js";
import { registerKnowledgeBaseAdminRoutes } from "./knowledge-base.routes.js";

export async function aiAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);
  await registerAIAgentAdminRoutes(app);
  await registerCustomerIntelligenceAdminRoutes(app);
  await registerAIConfigAdminRoutes(app);
  await registerAIRuntimePolicyAdminRoutes(app);
  await registerKnowledgeBaseAdminRoutes(app);
}
