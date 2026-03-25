import type { FastifyInstance } from "fastify";

import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { registerCSATAdminRoutes } from "./csat.routes.js";
import { registerQAAdminRoutes } from "./qa.routes.js";
import { registerSLAAdminRoutes } from "./sla.routes.js";

export async function qualityAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);
  await registerSLAAdminRoutes(app);
  await registerQAAdminRoutes(app);
  await registerCSATAdminRoutes(app);
}
