/**
 * 作用：从 knowledge_base_entries 中检索与当前问题最相关的知识条目，并格式化为主链可注入的知识上下文。
 * 上游：context-pipeline.ts
 * 下游：prompt-assembler.ts、后续 evidence layer
 * 协作对象：conversation.routes.ts（复用相同的 tsquery 构造思路）
 * 不负责：不决定轨道，不直接回答用户，不做工具执行。
 * 变更注意：
 *   - FTS (to_tsquery 'simple') 只对 ASCII/Latin 文本可靠；PostgreSQL 的 simple 配置不做中文分词，
 *     整个中文短语会被当作单一 lexeme 存储。对 CJK 查询改用 ILIKE + bigram 分解，确保能召回中文知识。
 *   - 知识库条目数量通常很小（< 1000），ILIKE 扫表性能可接受。
 */

import type { Knex } from "knex";

export type KnowledgeEntry = {
  entry_id: string;
  title: string;
  category: string | null;
  content: string;
  updated_at: string | null;
};

// CJK unicode ranges: CJK Unified Ideographs, Hiragana/Katakana, Hangul
const CJK_PATTERN = /[一-鿿぀-ヿ가-힯]/;

export async function searchKnowledgeEntries(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    queryText: string;
    limit?: number;
  }
): Promise<KnowledgeEntry[]> {
  const limit = Math.max(1, input.limit ?? 4);
  const q = input.queryText.trim();
  if (!q) return [];

  const hasCJK = CJK_PATTERN.test(q);

  // ── Path A: pure ASCII/Latin query — use the GIN-indexed full-text search ──
  if (!hasCJK) {
    const tsQuery = buildTsQuery(q);
    if (tsQuery) {
      const rows = (await db("knowledge_base_entries")
        .where({ tenant_id: input.tenantId, is_active: true })
        .andWhereRaw("search_vector @@ to_tsquery('simple', ?)", [tsQuery])
        .select("entry_id", "title", "category", "content", "updated_at")
        .orderBy("hit_count", "desc")
        .orderBy("updated_at", "desc")
        .limit(limit)) as KnowledgeEntry[];
      if (rows.length > 0) return rows;
    }
  }

  // ── Path B: CJK or FTS miss — ILIKE search with bigrams + phrases ─────────
  // PostgreSQL's 'simple' text search cannot segment Chinese text; entire CJK
  // phrases are stored as single lexemes and won't match sub-phrase queries.
  // Bigram decomposition (e.g. "取件" → ["取件", "上取", ...]) gives reasonable
  // recall for a small knowledge base with no vector store.
  return searchByKeywords(db, { tenantId: input.tenantId, queryText: q, limit });
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

// ── Internal helpers ─────────────────────────────────────────────────────────

async function searchByKeywords(
  db: Knex | Knex.Transaction,
  input: { tenantId: string; queryText: string; limit: number }
): Promise<KnowledgeEntry[]> {
  const tokens = extractSearchTokens(input.queryText);

  if (tokens.length === 0) {
    // Fallback: return most-hit active entries so the LLM has something to work with
    return (await db("knowledge_base_entries")
      .where({ tenant_id: input.tenantId, is_active: true })
      .select("entry_id", "title", "category", "content", "updated_at")
      .orderBy("hit_count", "desc")
      .orderBy("updated_at", "desc")
      .limit(input.limit)) as KnowledgeEntry[];
  }

  return (await db("knowledge_base_entries")
    .where({ tenant_id: input.tenantId, is_active: true })
    .where(function() {
      for (const token of tokens) {
        this.orWhereRaw("title ILIKE ?", [`%${token}%`]);
        this.orWhereRaw("content ILIKE ?", [`%${token}%`]);
      }
    })
    .select("entry_id", "title", "category", "content", "updated_at")
    .orderBy("hit_count", "desc")
    .orderBy("updated_at", "desc")
    .limit(input.limit)) as KnowledgeEntry[];
}

/**
 * Extract search tokens from a mixed CJK+Latin query:
 * - CJK: the full phrase + bigrams (2-char windows). Bigrams give good recall for
 *   partial matches (e.g. "取件" in "上门取件规则") without the noise of single chars.
 * - Latin/ASCII: words of length ≥ 3.
 * - Deduplicated and capped at 12 tokens to keep the ILIKE clause reasonable.
 */
function extractSearchTokens(text: string): string[] {
  const tokens: string[] = [];

  // Extract all CJK characters in sequence
  const cjkSegments = text.match(/[一-鿿぀-ヿ가-힯]+/g) ?? [];
  for (const segment of cjkSegments) {
    // Full segment (good for exact phrase matches)
    if (segment.length >= 2) tokens.push(segment);
    // Bigrams (good for partial/embedded phrase matches)
    for (let i = 0; i < segment.length - 1; i++) {
      tokens.push(segment[i] + segment[i + 1]);
    }
  }

  // Extract Latin words ≥ 3 characters
  const latinWords = text.match(/[a-zA-Z]{3,}/g) ?? [];
  tokens.push(...latinWords);

  return [...new Set(tokens)].slice(0, 12);
}

/** Builds a PostgreSQL `to_tsquery('simple', ...)` compatible token string. */
function buildTsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return tokens.join(" | ");
}
