import type { FastifyInstance } from "fastify";

import { replayTenantEvents } from "./realtime.events.js";

export async function realtimeRoutes(app: FastifyInstance) {
  app.get("/api/realtime/replay", async (req) => {
    const auth = req.auth;
    if (!auth?.tenantId) {
      throw app.httpErrors.unauthorized("Missing realtime session");
    }

    const query = (req.query as { afterEventId?: string; limit?: string } | undefined) ?? {};
    const afterEventId = typeof query.afterEventId === "string" && query.afterEventId.trim()
      ? query.afterEventId.trim()
      : null;
    const limit = Number(query.limit ?? 200);

    return {
      events: await replayTenantEvents(auth.tenantId, afterEventId, limit)
    };
  });
}
