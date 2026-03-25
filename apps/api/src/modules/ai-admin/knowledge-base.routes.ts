import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";

export async function registerKnowledgeBaseAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/knowledge-base", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { category?: string; search?: string; page?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = 20;
    const offset = (page - 1) * limit;

    return withTenantTransaction(tenantId, async (trx) => {
      const qb = trx("knowledge_base_entries")
        .select("entry_id", "category", "title", "content", "tags", "is_active", "hit_count", "created_at", "updated_at")
        .where({ tenant_id: tenantId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset);

      if (query.category) qb.where("category", query.category);
      if (query.search) {
        const tsq = String(query.search).split(/\s+/).filter(Boolean).join(" | ");
        qb.whereRaw("search_vector @@ to_tsquery('simple', ?)", [tsq]);
      }

      const [rows, countRow] = await Promise.all([
        qb,
        trx("knowledge_base_entries").where({ tenant_id: tenantId }).count("entry_id as cnt").first()
      ]);

      return { entries: rows, total: Number((countRow as { cnt: string })?.cnt ?? 0), page, limit };
    });
  });

  app.post("/api/admin/knowledge-base", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const body = req.body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
    };

    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title) throw app.httpErrors.badRequest("title is required");
    if (!content) throw app.httpErrors.badRequest("content is required");

    return withTenantTransaction(tenantId, async (trx) => {
      const [entry] = await trx("knowledge_base_entries")
        .insert({
          tenant_id: tenantId,
          category: body.category ?? "general",
          title,
          content,
          tags: JSON.stringify(body.tags ?? [])
        })
        .returning(["entry_id", "category", "title", "is_active", "created_at"]);
      return entry;
    });
  });

  app.patch("/api/admin/knowledge-base/:entryId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { entryId } = req.params as { entryId: string };
    const body = req.body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
      isActive?: boolean;
    };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.category !== undefined) updates.category = body.category;
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.content !== undefined) updates.content = body.content.trim();
      if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      const affected = await trx("knowledge_base_entries")
        .where({ tenant_id: tenantId, entry_id: entryId })
        .update(updates);

      if (affected === 0) throw app.httpErrors.notFound("KB entry not found");
      return { updated: true };
    });
  });

  app.delete("/api/admin/knowledge-base/:entryId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const { entryId } = req.params as { entryId: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const affected = await trx("knowledge_base_entries")
        .where({ tenant_id: tenantId, entry_id: entryId })
        .update({ is_active: false, updated_at: trx.fn.now() });

      if (affected === 0) throw app.httpErrors.notFound("KB entry not found");
      return { deactivated: true };
    });
  });
}
