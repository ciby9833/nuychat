/**
 * 作用：从 knowledge_base_entries 中检索与当前问题最相关的知识条目，并格式化为主链可注入的知识上下文。
 * 上游：context-pipeline.ts
 * 下游：prompt-assembler.ts、后续 evidence layer
 * 协作对象：conversation.routes.ts（复用相同的 tsquery 构造思路）
 * 不负责：不决定轨道，不直接回答用户，不做工具执行。
 * 变更注意：第一阶段仅做轻量关键词检索；后续可叠加向量召回与 rerank。
 */

import type { Knex } from "knex";

export type KnowledgeEntry = {
  entry_id: string;
  title: string;
  category: string | null;
  content: string;
  updated_at: string | null;
};

export async function searchKnowledgeEntries(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    queryText: string;
    limit?: number;
  }
): Promise<KnowledgeEntry[]> {
  const tsQuery = buildTsQuery(input.queryText);
  if (!tsQuery) return [];

  const rows = await db<KnowledgeEntry>("knowledge_base_entries")
    .where({ tenant_id: input.tenantId, is_active: true })
    .andWhereRaw("search_vector @@ to_tsquery('simple', ?)", [tsQuery])
    .select("entry_id", "title", "category", "content", "updated_at")
    .orderBy("hit_count", "desc")
    .orderBy("updated_at", "desc")
    .limit(Math.max(1, input.limit ?? 4));

  return rows;
}

export async function buildKnowledgeContext(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    queryText: string;
    limit?: number;
  }
): Promise<string | null> {
  const rows = await searchKnowledgeEntries(db, input);
  return formatKnowledgeEntriesAsContext(rows);
}

export function formatKnowledgeEntriesAsContext(rows: KnowledgeEntry[]): string | null {
  if (rows.length === 0) return null;

  const lines = rows.map((row, index) => {
    const header = [
      `${index + 1}. ${row.title}`,
      row.category ? `category=${row.category}` : null,
      row.updated_at ? `updated=${new Date(row.updated_at).toISOString()}` : null
    ].filter(Boolean).join(" | ");
    return `${header}\n${row.content.slice(0, 800)}`;
  });

  return `[BUSINESS KNOWLEDGE]\n${lines.join("\n\n")}`;
}

function buildTsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return tokens.join(" | ");
}
