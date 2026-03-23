import { skillRegistry } from "../skill.registry.js";

/**
 * Knowledge Base search skill.
 * Performs PostgreSQL full-text search on knowledge_base_entries for the current tenant.
 * Returns up to 3 relevant articles that the AI can use to answer the customer.
 */
skillRegistry.register({
  name: "search_knowledge_base",
  description:
    "Search the internal knowledge base for articles matching a query. " +
    "Use this when a customer asks about policies, FAQs, shipping, returns, payments, or any " +
    "topic that might be covered in company documentation. Always search before making up answers.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query — use natural language keywords (e.g. 'return policy', 'track order')"
      },
      category: {
        type: "string",
        description: "Optional category filter: policy | shipping | payment | order | faq | product | general",
        enum: ["policy", "shipping", "payment", "order", "faq", "product", "general"]
      }
    },
    required: ["query"]
  },

  async execute(input, ctx) {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { error: "query is required" };
    }

    const category = typeof input.category === "string" ? input.category : null;

    try {
      // PostgreSQL full-text search using the tsvector column (search_vector)
      // to_tsquery uses the same 'simple' dictionary as the index
      const tsQuery = query
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u0400-\u04ff]/g, ""))
        .filter(Boolean)
        .join(" | ");

      if (!tsQuery) {
        return { entries: [], total: 0, query };
      }

      const qb = ctx.db("knowledge_base_entries")
        .select("entry_id", "category", "title", "content", "tags", "hit_count")
        .where({ tenant_id: ctx.tenantId, is_active: true })
        .whereRaw("search_vector @@ to_tsquery('simple', ?)", [tsQuery])
        .orderByRaw("ts_rank(search_vector, to_tsquery('simple', ?)) DESC", [tsQuery])
        .limit(3);

      if (category) {
        qb.where("category", category);
      }

      const rows = await qb;

      // Increment hit_count in background (best-effort, no await)
      if (rows.length > 0) {
        const ids = rows.map((r: { entry_id: string }) => r.entry_id);
        ctx.db("knowledge_base_entries")
          .whereIn("entry_id", ids)
          .increment("hit_count", 1)
          .catch(() => null);
      }

      return {
        entries: rows.map((r: { entry_id: string; category: string; title: string; content: string; tags: unknown }) => ({
          id: r.entry_id,
          category: r.category,
          title: r.title,
          content: r.content,
          tags: r.tags
        })),
        total: rows.length,
        query
      };
    } catch (err) {
      return { error: "KB search failed", detail: (err as Error).message, entries: [], total: 0 };
    }
  }
});
