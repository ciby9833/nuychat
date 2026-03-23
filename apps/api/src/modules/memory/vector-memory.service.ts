import crypto from "node:crypto";

import { db } from "../../infra/db/client.js";
import { getQdrantClient } from "../../infra/qdrant/client.js";
import { estimateEmbeddingTokens, recordAIUsage } from "../ai/usage-meter.service.js";

const PROFILE_COLLECTION = "customer_memory_profiles_v2";
const MEMORY_COLLECTION = "customer_memory_units_v2";
const VECTOR_SIZE = 1536;

type VectorSearchRow = {
  id: string;
  score: number;
};

function pointIdFromText(input: string): number {
  const hex = crypto.createHash("sha256").update(input).digest("hex").slice(0, 15);
  return Number(BigInt(`0x${hex}`) % BigInt(Number.MAX_SAFE_INTEGER));
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 12000)
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

async function ensureCollection(name: string): Promise<boolean> {
  const client = await getQdrantClient();
  if (!client) return false;

  try {
    const { collections } = await client.getCollections();
    if (!collections.some((collection) => collection.name === name)) {
      await client.createCollection(name, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" }
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function recordEmbeddingUsage(tenantId: string, text: string, source: string) {
  const inputTokens = estimateEmbeddingTokens(text);
  if (inputTokens <= 0) return;

  await recordAIUsage(db, {
    tenantId,
    provider: "openai",
    model: "text-embedding-3-small",
    feature: "embedding",
    inputTokens,
    outputTokens: 0,
    metadata: { source }
  });
}

export async function syncCustomerProfileVector(input: {
  tenantId: string;
  customerId: string;
  profileText: string;
  apiKey: string;
}): Promise<boolean> {
  if (!input.profileText.trim()) return false;
  if (!await ensureCollection(PROFILE_COLLECTION)) return false;
  const client = await getQdrantClient();
  if (!client) return false;

  try {
    const vector = await embedText(input.profileText, input.apiKey);
    if (vector.length === 0) return false;
    await recordEmbeddingUsage(input.tenantId, input.profileText, "customer_memory_profile");

    await client.upsert(PROFILE_COLLECTION, {
      wait: false,
      points: [
        {
          id: pointIdFromText(`profile:${input.tenantId}:${input.customerId}`),
          vector,
          payload: {
            tenantId: input.tenantId,
            customerId: input.customerId,
            text: input.profileText,
            kind: "profile",
            updatedAt: new Date().toISOString()
          }
        }
      ]
    });

    return true;
  } catch (error) {
    console.warn("[VectorMemory] syncCustomerProfileVector failed:", (error as Error).message);
    return false;
  }
}

export async function syncCustomerMemoryUnitVector(input: {
  tenantId: string;
  customerId: string;
  memoryUnitId: string;
  memoryText: string;
  memoryType: string;
  apiKey: string;
}): Promise<boolean> {
  if (!input.memoryText.trim()) return false;
  if (!await ensureCollection(MEMORY_COLLECTION)) return false;
  const client = await getQdrantClient();
  if (!client) return false;

  try {
    const vector = await embedText(input.memoryText, input.apiKey);
    if (vector.length === 0) return false;
    await recordEmbeddingUsage(input.tenantId, input.memoryText, "customer_memory_unit");

    await client.upsert(MEMORY_COLLECTION, {
      wait: false,
      points: [
        {
          id: pointIdFromText(`memory:${input.tenantId}:${input.memoryUnitId}`),
          vector,
          payload: {
            tenantId: input.tenantId,
            customerId: input.customerId,
            memoryUnitId: input.memoryUnitId,
            memoryType: input.memoryType,
            text: input.memoryText,
            kind: "memory_unit",
            updatedAt: new Date().toISOString()
          }
        }
      ]
    });

    return true;
  } catch (error) {
    console.warn("[VectorMemory] syncCustomerMemoryUnitVector failed:", (error as Error).message);
    return false;
  }
}

export async function searchRelevantMemoryVectors(input: {
  tenantId: string;
  customerId: string;
  query: string;
  limit?: number;
  apiKey?: string;
}): Promise<VectorSearchRow[]> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || !input.query.trim()) return [];
  if (!await ensureCollection(MEMORY_COLLECTION)) return [];
  const client = await getQdrantClient();
  if (!client) return [];

  try {
    const vector = await embedText(input.query, apiKey);
    if (vector.length === 0) return [];
    await recordEmbeddingUsage(input.tenantId, input.query, "customer_memory_query");

    const hits = await client.search(MEMORY_COLLECTION, {
      vector,
      limit: Math.max(1, Math.min(input.limit ?? 8, 20)),
      with_payload: true,
      score_threshold: 0.18,
      filter: {
        must: [
          { key: "tenantId", match: { value: input.tenantId } },
          { key: "customerId", match: { value: input.customerId } }
        ]
      }
    });

    return hits
      .map((hit) => {
        const payload = hit.payload as { memoryUnitId?: unknown } | undefined;
        if (typeof payload?.memoryUnitId !== "string") return null;
        return {
          id: payload.memoryUnitId,
          score: Number(hit.score ?? 0)
        };
      })
      .filter((item): item is VectorSearchRow => Boolean(item));
  } catch (error) {
    console.warn("[VectorMemory] searchRelevantMemoryVectors failed:", (error as Error).message);
    return [];
  }
}

export async function searchSimilarProfiles(input: {
  tenantId: string;
  query: string;
  limit?: number;
  apiKey?: string;
}): Promise<Array<{ customerId: string; summary: string; score: number }>> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || !input.query.trim()) return [];
  if (!await ensureCollection(PROFILE_COLLECTION)) return [];
  const client = await getQdrantClient();
  if (!client) return [];

  try {
    const vector = await embedText(input.query, apiKey);
    if (vector.length === 0) return [];
    await recordEmbeddingUsage(input.tenantId, input.query, "customer_memory_profile_query");

    const hits = await client.search(PROFILE_COLLECTION, {
      vector,
      limit: Math.max(1, Math.min(input.limit ?? 3, 10)),
      with_payload: true,
      score_threshold: 0.2,
      filter: {
        must: [
          { key: "tenantId", match: { value: input.tenantId } }
        ]
      }
    });

    return hits
      .map((hit) => {
        const payload = hit.payload as { customerId?: unknown; text?: unknown } | undefined;
        if (typeof payload?.customerId !== "string") return null;
        return {
          customerId: payload.customerId,
          summary: typeof payload.text === "string" ? payload.text : "",
          score: Number(hit.score ?? 0)
        };
      })
      .filter((item): item is { customerId: string; summary: string; score: number } => Boolean(item));
  } catch (error) {
    console.warn("[VectorMemory] searchSimilarProfiles failed:", (error as Error).message);
    return [];
  }
}
