import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { loadConversationPreview } from "../conversation/conversation-preview.service.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import { CaseTaskService } from "../tasks/case-task.service.js";

const caseTaskService = new CaseTaskService();

export async function taskAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/tasks", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as {
      status?: string;
      ownerAgentId?: string;
      createdFrom?: string;
      createdTo?: string;
      dueFrom?: string;
      dueTo?: string;
      search?: string;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const items = await caseTaskService.listAdminTasks(trx, tenantId, {
        status: query.status ?? null,
        ownerAgentId: query.ownerAgentId ?? null,
        createdFrom: query.createdFrom ? new Date(query.createdFrom) : null,
        createdTo: query.createdTo ? new Date(query.createdTo) : null,
        dueFrom: query.dueFrom ? new Date(query.dueFrom) : null,
        dueTo: query.dueTo ? new Date(query.dueTo) : null,
        search: query.search ?? null
      });
      return { items };
    });
  });

  app.get("/api/admin/conversations/:conversationId/preview", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { conversationId } = req.params as { conversationId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const preview = await loadConversationPreview(trx, tenantId, conversationId);
      if (!preview) throw app.httpErrors.notFound("Conversation not found");
      return preview;
    });
  });

  app.get("/api/admin/tasks/:taskId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { taskId } = req.params as { taskId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const detail = await caseTaskService.getAdminTaskDetail(trx, tenantId, taskId);
      if (!detail) throw app.httpErrors.notFound("Task not found");
      return detail;
    });
  });

  app.patch("/api/admin/tasks/:taskId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { taskId } = req.params as { taskId: string };
    const auth = req.auth;
    const body = (req.body as {
      status?: string;
      priority?: string;
      assigneeAgentId?: string | null;
      dueAt?: string | null;
      note?: string;
    } | undefined) ?? {};

    return withTenantTransaction(tenantId, async (trx) => {
      const task = await caseTaskService.getAdminTaskDetail(trx, tenantId, taskId);
      if (!task) throw app.httpErrors.notFound("Task not found");
      await caseTaskService.patchTask(trx, {
        tenantId,
        taskId,
        status: body.status,
        priority: body.priority,
        assigneeAgentId: body.assigneeAgentId,
        dueAt: body.dueAt
      });
      if (body.note?.trim()) {
        await caseTaskService.addComment(trx, {
          tenantId,
          taskId,
          body: body.note.trim(),
          authorType: auth?.agentId ? "agent" : "admin",
          authorIdentityId: auth?.sub ?? null,
          authorAgentId: auth?.agentId ?? null
        });
      }
      const detail = await caseTaskService.getAdminTaskDetail(trx, tenantId, taskId);
      if (!detail) throw app.httpErrors.internalServerError("Task updated but could not be loaded");
      return detail;
    });
  });

  app.post("/api/admin/tasks/:taskId/comments", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { taskId } = req.params as { taskId: string };
    const auth = req.auth;
    const body = (req.body as { body?: string } | undefined) ?? {};
    const content = body.body?.trim();
    if (!content) throw app.httpErrors.badRequest("body is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const task = await caseTaskService.getAdminTaskDetail(trx, tenantId, taskId);
      if (!task) throw app.httpErrors.notFound("Task not found");
      await caseTaskService.addComment(trx, {
        tenantId,
        taskId,
        body: content,
        authorType: auth?.agentId ? "agent" : "admin",
        authorIdentityId: auth?.sub ?? null,
        authorAgentId: auth?.agentId ?? null
      });
      const detail = await caseTaskService.getAdminTaskDetail(trx, tenantId, taskId);
      if (!detail) throw app.httpErrors.internalServerError("Task comment saved but detail could not be loaded");
      return detail;
    });
  });
}
