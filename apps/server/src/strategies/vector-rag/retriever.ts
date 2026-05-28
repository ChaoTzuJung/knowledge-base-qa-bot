import { OPENAI_EMBEDDING_MODEL } from "../../env.js";
import { getOpenAI } from "../../llm/client.js";
import type { Chunk } from "../../lib/types.js";
import { vectorState } from "./indexer.js";

const SIMILARITY_THRESHOLD = 0.3;

export interface VectorHit {
  chunk: Chunk;
  score: number;
}

export async function vectorSearch(query: string, k = 3): Promise<VectorHit[]> {
  if (!vectorState.index || vectorState.chunks.length === 0) return [];

  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: query,
  });
  const queryVec = res.data[0].embedding;

  const requested = Math.min(k, vectorState.chunks.length);
  const result = vectorState.index.searchKnn(queryVec, requested);

  const hits: VectorHit[] = [];
  for (let i = 0; i < result.neighbors.length; i++) {
    const label = result.neighbors[i];
    const distance = result.distances[i];
    const similarity = 1 - distance;
    const chunk = vectorState.byLabel.get(label);
    if (!chunk) continue;
    hits.push({ chunk, score: similarity });
  }

  if (hits.length === 0 || hits[0].score < SIMILARITY_THRESHOLD) return [];
  return hits;
}
