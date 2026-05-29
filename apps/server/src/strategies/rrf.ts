/**
 * Reciprocal Rank Fusion (Cormack et al., 2009).
 *
 * Combines several ranked lists of ids into a single ranking. An item at
 * 1-based rank `r` in a list contributes `1 / (K + r)`; contributions sum across
 * lists, so items ranked highly by multiple retrievers rise to the top. Only
 * ranks matter — the retrievers' raw, non-comparable scores (BM25 vs cosine)
 * are deliberately ignored. K=60 is the standard dampening constant.
 *
 * Duplicate ids within a single list are collapsed to their best (first) rank.
 */
export function reciprocalRankFusion(
  lists: string[][],
  k = 60,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = [...new Set(list)]; // dedupe within a list, keep best rank
    seen.forEach((id, i) => {
      const rank = i + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
