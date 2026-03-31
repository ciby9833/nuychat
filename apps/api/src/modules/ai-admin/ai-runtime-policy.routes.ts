import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { getTenantAIRuntimePolicy, serializePreReplyPolicy, upsertTenantAIRuntimePolicy } from "../ai/runtime-policy.service.js";

export async function registerAIRuntimePolicyAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/ai-runtime-policy", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    return withTenantTransaction(tenantId, async (trx) => {
      const policy = await getTenantAIRuntimePolicy(trx, tenantId);
      return {
        policy_id: policy.policyId,
        tenant_id: policy.tenantId,
        pre_reply_policies: policy.preReplyPolicies,
        model_scene_config: policy.modelSceneConfig,
        created_at: policy.createdAt,
        updated_at: policy.updatedAt
      };
    });
  });

  app.patch("/api/admin/ai-runtime-policy", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      preReplyPolicies?: unknown;
      modelSceneConfig?: unknown;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const policy = await upsertTenantAIRuntimePolicy(trx, {
        tenantId,
        preReplyPolicies: serializePreReplyPolicy(body.preReplyPolicies),
        modelSceneConfig: body.modelSceneConfig
      });

      return {
        policy_id: policy.policyId,
        tenant_id: policy.tenantId,
        pre_reply_policies: policy.preReplyPolicies,
        model_scene_config: policy.modelSceneConfig,
        created_at: policy.createdAt,
        updated_at: policy.updatedAt
      };
    });
  });
}
