/**
 * 作用:
 * - 提供 WA 模块的内部维护入口。
 *
 * 交互:
 * - 调用 wa-reconcile.service 触发会话级消息补偿。
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { reconcileWaConversation } from "./wa-reconcile.service.js";

export async function waInternalRoutes(app: FastifyInstance) {
  app.post("/internal/wa/reconcile/:waConversationId", async (req) => {
    const { waConversationId } = req.params as { waConversationId: string };
    const body = (req.body ?? {}) as { tenantId?: string; reason?: string };
    if (typeof body.tenantId !== "string" || !body.tenantId.trim()) {
      throw app.httpErrors.badRequest("tenantId is required");
    }

    return withTenantTransaction(body.tenantId, async (trx) =>
      reconcileWaConversation(trx, {
        tenantId: body.tenantId.trim(),
        waConversationId,
        reason: body.reason ?? null
      })
    );
  });
}
