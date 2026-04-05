/**
 * 作用:
 * - 提供 WA provider 的内部 webhook 入口。
 *
 * 交互:
 * - 当前接入 Evolution webhook。
 * - 调用 wa-provider-webhook.service 做标准化与落库。
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { ingestEvolutionWebhook } from "./wa-provider-webhook.service.js";

export async function waInternalRoutes(app: FastifyInstance) {
  app.post("/internal/wa/evolution/:waAccountId/webhook", async (req) => {
    const { waAccountId } = req.params as { waAccountId: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : null;
    if (!tenantId) {
      throw app.httpErrors.badRequest("tenantId is required in webhook body");
    }

    return withTenantTransaction(tenantId, async (trx) =>
      ingestEvolutionWebhook(trx, {
        tenantId,
        waAccountId,
        body
      })
    );
  });
}
