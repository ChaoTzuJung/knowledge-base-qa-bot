import type { ChatResult, Section, SourceInfo, Strategy } from "../lib/types.js";
import { generateAnswer } from "../llm/answer.js";
import { buildPrompt, sectionsToContext } from "../llm/prompts.js";
import { BM25_THRESHOLD, search as bm25Search } from "./markdown-kb/bm25.js";
import { isIndexed as isMarkdownIndexed, state as markdownState } from "./markdown-kb/indexer.js";
import { reciprocalRankFusion } from "./rrf.js";
import { isVectorIndexed, vectorState } from "./vector-rag/indexer.js";
import { SIMILARITY_THRESHOLD, vectorSearch } from "./vector-rag/retriever.js";

export interface RetrievedContext {
  prompt: string;
  sources: SourceInfo[];
}

function toSources(
  items: Array<{ id: string; heading_path: string[]; content: string }>,
  scores: number[],
): SourceInfo[] {
  return items.map((item, i) => ({
    source: item.id,
    heading: item.heading_path.join(" > "),
    score: Math.round(scores[i] * 1000) / 1000,
    content: item.content.slice(0, 240),
  }));
}

/** A vector chunk id equals its parent section id, optionally suffixed "::part-N". */
function parentSectionId(chunkId: string): string {
  return chunkId.split("::")[0];
}

export async function retrieve(
  query: string,
  strategy: Strategy,
): Promise<{ ok: boolean; prompt?: string; sources: SourceInfo[]; notIndexed: boolean }> {
  if (strategy === "markdown_kb") {
    if (!isMarkdownIndexed()) return { ok: false, sources: [], notIndexed: true };
    const ranked = bm25Search(query, 3);
    if (ranked.length === 0) return { ok: false, sources: [], notIndexed: false };
    const items = ranked.map((r) => r.section);
    const scores = ranked.map((r) => r.score);
    const ctx = sectionsToContext(items, scores);
    return {
      ok: true,
      prompt: buildPrompt(query, ctx),
      sources: toSources(items, scores),
      notIndexed: false,
    };
  }

  if (strategy === "hybrid") {
    if (!isMarkdownIndexed() || !isVectorIndexed()) {
      return { ok: false, sources: [], notIndexed: true };
    }

    const CANDIDATES = 5;
    // Pull ungated ranked lists from both retrievers (threshold 0); RRF uses
    // ranks, not the raw, non-comparable BM25/cosine scores.
    const bm25Ranked = bm25Search(query, CANDIDATES, 0);
    const vectorHits = await vectorSearch(query, CANDIDATES, 0);

    // Preserve the anti-hallucination guarantee: only answer if at least one
    // retriever clears its own confidence threshold.
    const confident =
      (bm25Ranked.length > 0 && bm25Ranked[0].score >= BM25_THRESHOLD) ||
      (vectorHits.length > 0 && vectorHits[0].score >= SIMILARITY_THRESHOLD);
    if (!confident) return { ok: false, sources: [], notIndexed: false };

    const bm25Ids = bm25Ranked.map((r) => r.section.id);
    const vectorIds = vectorHits.map((h) => parentSectionId(h.chunk.id));
    const fused = reciprocalRankFusion([bm25Ids, vectorIds]).slice(0, 3);

    // Fuse at section granularity; the Markdown KB store holds the full section
    // text (vector chunks may be partial), so it is the canonical content source.
    const sectionById = new Map(markdownState.sections.map((s) => [s.id, s]));
    const ranked = fused
      .map((f) => ({ section: sectionById.get(f.id), score: f.score }))
      .filter((r): r is { section: Section; score: number } => r.section !== undefined);
    if (ranked.length === 0) return { ok: false, sources: [], notIndexed: false };

    const items = ranked.map((r) => r.section);
    const scores = ranked.map((r) => r.score);
    const ctx = sectionsToContext(items, scores);
    return {
      ok: true,
      prompt: buildPrompt(query, ctx),
      sources: toSources(items, scores),
      notIndexed: false,
    };
  }

  if (!isVectorIndexed()) return { ok: false, sources: [], notIndexed: true };
  const hits = await vectorSearch(query, 3);
  if (hits.length === 0) return { ok: false, sources: [], notIndexed: false };
  const items = hits.map((h) => h.chunk);
  const scores = hits.map((h) => h.score);
  const ctx = sectionsToContext(items, scores);
  return {
    ok: true,
    prompt: buildPrompt(query, ctx),
    sources: toSources(items, scores),
    notIndexed: false,
  };
}

export async function answerQuery(
  query: string,
  strategy: Strategy,
): Promise<ChatResult> {
  const r = await retrieve(query, strategy);
  if (r.notIndexed) {
    const which =
      strategy === "markdown_kb" ? "Markdown KB" : strategy === "vector_rag" ? "Vector" : "Hybrid";
    return {
      answer: `The ${which} index has not been built yet. Call POST /index first.`,
      sources: [],
    };
  }
  if (!r.ok || !r.prompt) {
    return { answer: "I cannot confirm from the knowledge base.", sources: [] };
  }
  const answer = await generateAnswer(r.prompt);
  return { answer, sources: r.sources };
}

export function indexedStatus() {
  return {
    markdown_kb: isMarkdownIndexed(),
    vector_rag: isVectorIndexed(),
    vector_chunks: vectorState.chunks.length,
  };
}
