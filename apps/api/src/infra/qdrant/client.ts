/**
 * Qdrant client — gracefully unavailable when Qdrant is not running.
 *
 * If QDRANT_URL is not set or Qdrant is unreachable the client returns null
 * and all vector-memory operations silently no-op.
 */

import { QdrantClient } from "@qdrant/js-client-rest";

import { readOptionalEnv } from "../env.js";

let _client: QdrantClient | null = null;
let _initialised = false;

export async function getQdrantClient(): Promise<QdrantClient | null> {
  if (_initialised) return _client;
  _initialised = true;

  const qdrantUrl = readOptionalEnv("QDRANT_URL");
  if (!qdrantUrl) {
    console.info("[Qdrant] Disabled (QDRANT_URL not set)");
    _client = null;
    return _client;
  }

  try {
    const client = new QdrantClient({ url: qdrantUrl });
    // Lightweight health-check — will throw if Qdrant is not reachable
    await client.getCollections();
    _client = client;
    console.info(`[Qdrant] Connected at ${qdrantUrl}`);
  } catch {
    console.warn(`[Qdrant] Not reachable at ${qdrantUrl} — vector memory disabled`);
    _client = null;
  }

  return _client;
}
