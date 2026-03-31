import type { FastifyInstance } from "fastify";

import {
  createCapabilityForTenant,
  deleteCapabilityForTenant,
  getCapabilityDetailForTenant,
  listCapabilitiesForTenant,
  updateCapabilityForTenant
} from "../capabilities/capability-definition.service.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";

export async function capabilityAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/capabilities", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return {
      items: await listCapabilitiesForTenant(tenantId)
    };
  });

  app.get("/api/admin/capabilities/:capabilityId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { capabilityId } = req.params as { capabilityId: string };

    const detail = await getCapabilityDetailForTenant(tenantId, capabilityId);
    if (!detail) throw app.httpErrors.notFound("Capability not found");
    return detail;
  });

  app.post("/api/admin/capabilities", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    return createCapabilityForTenant(tenantId, req.body as Record<string, unknown> as never);
  });

  app.patch("/api/admin/capabilities/:capabilityId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { capabilityId } = req.params as { capabilityId: string };
    const detail = await updateCapabilityForTenant(tenantId, capabilityId, req.body as Record<string, unknown> as never);
    if (!detail) throw app.httpErrors.notFound("Capability not found");
    return detail;
  });

  app.delete("/api/admin/capabilities/:capabilityId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { capabilityId } = req.params as { capabilityId: string };
    const deleted = await deleteCapabilityForTenant(tenantId, capabilityId);
    if (!deleted) throw app.httpErrors.notFound("Capability not found");
    return { deleted: true, capabilityId };
  });
}
