import type { Section } from "../../lib/types.js";
import { tokenize } from "./parser.js";
import { state } from "./indexer.js";

const K1 = 1.5;
const B = 0.75;
const HEADING_BOOST = 1.5;

export function bm25Score(queryTokens: string[], section: Section): number {
  if (state.sections.length === 0) return 0;

  const docLen = section.tokens.length;
  if (docLen === 0) return 0;

  const tf: Record<string, number> = {};
  for (const t of section.tokens) tf[t] = (tf[t] ?? 0) + 1;

  const N = state.sections.length;
  const avgdl = state.avg_doc_len || 1;

  let score = 0;
  const headingTokens = new Set(tokenize(section.heading_path.join(" ")));

  for (const q of queryTokens) {
    const f = tf[q] ?? 0;
    if (f === 0) continue;
    const df = state.doc_freq[q] ?? 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const denom = f + K1 * (1 - B + (B * docLen) / avgdl);
    score += idf * ((f * (K1 + 1)) / denom);
    if (headingTokens.has(q)) score += HEADING_BOOST;
  }

  return score;
}

export interface RankedSection {
  section: Section;
  score: number;
}

export function search(query: string, k = 3, threshold = 0.5): RankedSection[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const ranked: RankedSection[] = state.sections
    .map((section) => ({ section, score: bm25Score(queryTokens, section) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  if (ranked.length === 0 || ranked[0].score < threshold) return [];
  return ranked;
}
