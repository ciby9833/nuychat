/**
 * 作用:
 * - WA Workspace 模块总入口。
 *
 * 交互:
 * - 由 app.ts 注册。
 * - 聚合 internal webhook、workbench、admin 三类路由。
 */
import type { FastifyInstance } from "fastify";

import { waAdminRoutes } from "./wa-admin.routes.js";
import { waInternalRoutes } from "./wa-internal.routes.js";
import { waWorkbenchRoutes } from "./wa-workbench.routes.js";

export async function waWorkspaceRoutes(app: FastifyInstance) {
  await app.register(waInternalRoutes);
  await app.register(waWorkbenchRoutes);
  await app.register(waAdminRoutes);
}
