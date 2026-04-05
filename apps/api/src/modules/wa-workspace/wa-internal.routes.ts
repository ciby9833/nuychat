/**
 * 作用:
 * - 提供 WA provider 的内部 webhook 入口。
 *
 * 交互:
 * - 当前接入 Evolution webhook。
 * - 调用 wa-provider-webhook.service 做标准化与落库。
 * - 调用 wa-reconcile.service 触发会话级消息补偿。
 *
 * 说明:
 * - Evolution 不会在 webhook body 内附带租户信息，因此这里从 query/path 解析上下文，
 *   再进入租户事务，避免回调因 tenantId 缺失被拒绝。
 */
import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { ingestEvolutionWebhook } from "./wa-provider-webhook.service.js";
import { reconcileWaConversation } from "./wa-reconcile.service.js";

export async function waInternalRoutes(app: FastifyInstance) {
  const ingestWebhook = async (req: {
    params: { waAccountId: string };
    query?: { tenantId?: string };
    body?: unknown;
  }) => {
    const { waAccountId } = req.params as { waAccountId: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tenantId =
      (typeof req.query?.tenantId === "string" && req.query.tenantId.trim()) ||
      (typeof body.tenantId === "string" && body.tenantId.trim()) ||
      null;
    if (!tenantId) {
      throw app.httpErrors.badRequest("tenantId is required in webhook query");
    }

    return withTenantTransaction(tenantId, async (trx) =>
      ingestEvolutionWebhook(trx, {
        tenantId,
        waAccountId,
        body
      })
    );
  };

  app.post("/internal/wa/evolution/:waAccountId/webhook", async (req) => ingestWebhook(req));
  app.post("/internal/wa/evolution/:waAccountId/webhook/:eventSlug", async (req) => ingestWebhook(req));

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
