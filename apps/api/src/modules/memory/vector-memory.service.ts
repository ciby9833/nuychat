/**
 * Vector Memory Service — Layer 3 of the three-layer memory system.
 *
 * Stores per-customer long-term profile embeddings in Qdrant so the AI
 * can recall patterns from a customer's previous conversations even after
 * Layers 1 & 2 have been evicted or summarised.
 *
 * Collection schema:
 *   name     : "customer_profiles"
 *   vector   : float32[1536]  (text-embedding-3-small)
 *   payload  : { customerId, tenantId, summary, updatedAt }
 *
 * All functions silently no-op when Qdrant is unavailable.
 */

import { getQdrantClient } from "../../infra/qdrant/client.js";
import { db } from "../../infra/db/client.js";
import { estimateEmbeddingTokens, recordAIUsage } from "../ai/usage-meter.service.js";

const COLLECTION_NAME = "customer_profiles";
const VECTOR_SIZE = 1536; // text-embedding-3-small output dimension

// ─── Embedding helper ────────────────────────────────────────────────────────

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000) // stay well under the 8192-token limit
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return json.data[0].embedding;
}

async function recordEmbeddingUsage(tenantId: string, text: string): Promise<void> {
  const inputTokens = estimateEmbeddingTokens(text);
  if (inputTokens <= 0) return;

  await recordAIUsage(db, {
    tenantId,
    provider: "openai",
    model: "text-embedding-3-small",
    feature: "embedding",
    inputTokens,
    outputTokens: 0,
    metadata: {
      source: "vector_memory"
    }
  });
}

function normalizeSearchTokens(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function lexicalScore(queryTokens: string[], summary: string) {
  if (queryTokens.length === 0) return 0;
  const haystack = summary.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) hits += 1;
  }
  const overlap = hits / queryTokens.length;
  const phraseBoost = haystack.includes(queryTokens.join(" ")) ? 0.2 : 0;
  return Math.min(1, overlap + phraseBoost);
}

async function searchCachedProfiles(input: {
  tenantId: string;
  query: string;
  limit: number;
}): Promise<Array<{ customerId: string; summary: string; score: number }>> {
  const tokens = normalizeSearchTokens(input.query);
  if (tokens.length === 0) return [];

  const rows = await db("customer_profiles")
    .where({ tenant_id: input.tenantId })
    .whereNot("profile_summary", "")
    .select("customer_id", "profile_summary", "profile_keywords", "last_indexed_at")
    .orderBy("last_indexed_at", "desc")
    .limit(120);

  return rows
    .map((row) => ({
      customerId: String(row.customer_id),
      summary: String(row.profile_summary ?? ""),
      score: lexicalScore(
        tokens,
        `${String(row.profile_summary ?? "")} ${String(row.profile_keywords ?? "")}`
      )
    }))
    .filter((row) => row.summary.length > 0 && row.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

async function searchFtsProfiles(input: {
  tenantId: string;
  query: string;
  limit: number;
}): Promise<Array<{ customerId: string; summary: string; score: number }>> {
  const trimmed = input.query.trim();
  if (!trimmed) return [];

  try {
    const rows = await db.raw(
      `
        SELECT customer_id, profile_summary, ts_rank_cd(search_vector, plainto_tsquery('simple', ?)) AS score
        FROM customer_profiles
        WHERE tenant_id = ?
          AND search_vector @@ plainto_tsquery('simple', ?)
        ORDER BY score DESC, last_indexed_at DESC
        LIMIT ?
      `,
      [trimmed, input.tenantId, trimmed, input.limit]
    );

    const data = Array.isArray(rows.rows) ? rows.rows : [];
    return data.map((row) => ({
      customerId: String(row.customer_id),
      summary: String(row.profile_summary ?? ""),
      score: Number(row.score ?? 0)
    }));
  } catch {
    return [];
  }
}

// ─── Collection initialisation ───────────────────────────────────────────────

async function ensureCollection(): Promise<boolean> {
  const client = await getQdrantClient();
  if (!client) return false;

  try {
    const { collections } = await client.getCollections();
    if (!collections.some((c) => c.name === COLLECTION_NAME)) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" }
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Embed the customer's conversation summary and upsert it as a Qdrant point.
 * The point ID is derived deterministically from customerId + tenantId so
 * repeated calls update (not duplicate) the profile.
 */
export async function upsertCustomerProfile(input: {
  customerId: string;
  tenantId: string;
  summary: string;
  apiKey: string;
}): Promise<void> {
  if (!await ensureCollection()) return;
  const client = await getQdrantClient();
  if (!client) return;

  try {
    const vector = await embedText(input.summary, input.apiKey);
    await recordEmbeddingUsage(input.tenantId, input.summary);
    // Use a numeric point ID derived from the first 16 hex chars of customerId + tenantId
    const pointId = BigInt(`0x${(input.tenantId + input.customerId).replace(/-/g, "").slice(0, 15)}`);

    await client.upsert(COLLECTION_NAME, {
      wait: false,
      points: [
        {
          id: Number(pointId % BigInt(Number.MAX_SAFE_INTEGER)),
          vector,
          payload: {
            customerId: input.customerId,
            tenantId: input.tenantId,
            summary: input.summary,
            updatedAt: new Date().toISOString()
          }
        }
      ]
    });
  } catch (err) {
    // Non-fatal — vector memory is best-effort
    console.warn("[VectorMemory] upsertCustomerProfile failed:", (err as Error).message);
  }
}

/**
 * Search for the most relevant customer profiles for the current conversation.
 * Results are filtered to the same tenant and sorted by cosine similarity.
 */
export async function searchSimilarProfiles(input: {
  tenantId: string;
  query: string;
  limit?: number;
  apiKey?: string;
}): Promise<Array<{ customerId: string; summary: string; score: number }>> {
  const limit = input.limit ?? 3;
  const cached = await searchCachedProfiles({
    tenantId: input.tenantId,
    query: input.query,
    limit
  });
  if (cached.length >= Math.min(limit, 2) || (cached[0]?.score ?? 0) >= 0.65) {
    return cached;
  }

  const fts = await searchFtsProfiles({
    tenantId: input.tenantId,
    query: input.query,
    limit
  });
  if (fts.length >= Math.min(limit, 2) || (fts[0]?.score ?? 0) >= 0.2) {
    return fts;
  }

  if (!input.apiKey) {
    return cached.length > 0 ? cached : fts;
  }

  if (!await ensureCollection()) return [];
  const client = await getQdrantClient();
  if (!client) return cached.length > 0 ? cached : fts;

  try {
    const vector = await embedText(input.query, input.apiKey);
    await recordEmbeddingUsage(input.tenantId, input.query);
    const results = await client.search(COLLECTION_NAME, {
      vector,
      limit,
      filter: {
        must: [{ key: "tenantId", match: { value: input.tenantId } }]
      },
      with_payload: true
    });

    return results
      .filter((r) => r.score > 0.75) // only high-confidence matches
      .map((r) => ({
        customerId: String(r.payload?.customerId ?? ""),
        summary: String(r.payload?.summary ?? ""),
        score: r.score
      }));
  } catch (err) {
    console.warn("[VectorMemory] searchSimilarProfiles failed:", (err as Error).message);
    return cached.length > 0 ? cached : fts;
  }
}
