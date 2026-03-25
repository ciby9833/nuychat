import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { scheduleLongTask } from "../tasks/task-scheduler.service.js";

export async function registerCustomerIntelligenceAdminRoutes(app: FastifyInstance) {
  app.post("/api/admin/customer-intelligence/reindex/customers/:customerId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { customerId } = req.params as { customerId: string };

    const exists = await withTenantTransaction(tenantId, async (trx) => {
      const row = await trx("customers")
        .where({ tenant_id: tenantId, customer_id: customerId })
        .select("customer_id")
        .first();
      return Boolean(row);
    });
    if (!exists) throw app.httpErrors.notFound("Customer not found");

    await scheduleLongTask({
      tenantId,
      customerId,
      conversationId: null,
      taskType: "vector_customer_profile_reindex",
      title: `Vector reindex ${customerId}`,
      source: "workflow",
      priority: 70,
      payload: { customerId }
    });

    return { queued: true, customerId };
  });

  app.post("/api/admin/customer-intelligence/reindex/batch", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = (req.body as { customerIds?: string[]; limit?: number } | undefined) ?? {};
    const customerIds = Array.isArray(body.customerIds)
      ? Array.from(new Set(body.customerIds.map((item) => String(item).trim()).filter(Boolean)))
      : [];
    const limit = typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 500)) : 100;

    await scheduleLongTask({
      tenantId,
      customerId: null,
      conversationId: null,
      taskType: "vector_batch_reindex",
      title: "Vector batch reindex",
      source: "workflow",
      priority: 75,
      payload: customerIds.length > 0 ? { customerIds } : { limit }
    });

    return {
      queued: true,
      mode: customerIds.length > 0 ? "selected_customers" : "latest_customers",
      customerCount: customerIds.length > 0 ? customerIds.length : limit
    };
  });
}
