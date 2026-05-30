/**
 * Source-authority weighting.
 *
 * Two documents can be equally relevant to a query yet carry very different
 * trust: an official policy page should outrank a chat transcript that happens
 * to mention the same words. We let each document declare a `source_type` in its
 * front matter, map that to a priority, and apply a small, capped re-ranking
 * boost so authority breaks near-ties WITHOUT overriding a clearly more relevant
 * result.
 *
 * The boost is multiplicative (`score * (1 + priority * AUTHORITY_WEIGHT)`) rather
 * than the additive constant a single-retriever system would use: our scores live
 * on three different scales (BM25 ~0-20, cosine 0-1, RRF ~0-0.03), and a relative
 * factor is the only scale-invariant way to treat them uniformly.
 */

/** source_type (from front matter) → authority priority. Higher = more trusted. */
export const SOURCE_PRIORITIES: Record<string, number> = {
  policy: 3,
  official: 3,
  terms: 3,
  faq: 2,
  guide: 2,
  doc: 1,
  docs: 1,
  transcript: 0,
  chat: 0,
  qa: 0,
};

/** Priority for documents with no (or an unknown) source_type — the "doc" baseline. */
export const DEFAULT_PRIORITY = 1;

/** Each priority point adds this fraction to a result's score for RANKING only.
 *  e.g. policy(3) ranks as if +15% relevant; a transcript(0) gets no boost. */
export const AUTHORITY_WEIGHT = 0.05;

export function priorityForSourceType(sourceType: string | undefined): number {
  if (!sourceType) return DEFAULT_PRIORITY;
  return SOURCE_PRIORITIES[sourceType.trim().toLowerCase()] ?? DEFAULT_PRIORITY;
}

/**
 * Re-rank scored items by authority-adjusted score, returning them sorted best-first.
 * The ORIGINAL score is preserved in the output (authority changes order, not the
 * relevance number shown to the user). Array sort is stable, so equal-authority
 * ties keep their incoming relevance order.
 *
 * Not used for llm_index, whose "scores" are pick ranks, not magnitudes.
 */
export function rerankByAuthority<T extends { priority?: number }>(
  items: T[],
  scores: number[],
): Array<{ item: T; score: number }> {
  return items
    .map((item, i) => ({
      item,
      score: scores[i],
      boosted: scores[i] * (1 + (item.priority ?? DEFAULT_PRIORITY) * AUTHORITY_WEIGHT),
    }))
    .sort((a, b) => b.boosted - a.boosted)
    .map(({ item, score }) => ({ item, score }));
}
