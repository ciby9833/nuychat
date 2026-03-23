/**
 * Qdrant client — gracefully unavailable when Qdrant is not running.
 *
 * If QDRANT_URL is not set or Qdrant is unreachable the client returns null
 * and all vector-memory operations silently no-op.
 */

import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";

let _client: QdrantClient | null = null;
let _initialised = false;

export async function getQdrantClient(): Promise<QdrantClient | null> {
  if (_initialised) return _client;
  _initialised = true;

  try {
    const client = new QdrantClient({ url: QDRANT_URL });
    // Lightweight health-check — will throw if Qdrant is not reachable
    await client.getCollections();
    _client = client;
    console.info(`[Qdrant] Connected at ${QDRANT_URL}`);
  } catch {
    console.warn(`[Qdrant] Not reachable at ${QDRANT_URL} — vector memory disabled`);
    _client = null;
  }

  return _client;
}
