import type { Chunk, ChatResult, Section, SourceInfo, Strategy } from "../lib/types.js";
import { generateAnswer } from "../llm/answer.js";
import { verifyGrounding } from "../llm/grounding.js";
import { buildPrompt, sectionsToContext } from "../llm/prompts.js";
import { INJECTION_REFUSAL, detectInjection, sanitizeCitations } from "../llm/safety.js";
import { BM25_THRESHOLD, search as bm25Search } from "./markdown-kb/bm25.js";
import { isIndexed as isMarkdownIndexed, state as markdownState } from "./markdown-kb/indexer.js";
import { selectSections } from "./llm-index/router.js";
import { rerankByAuthority } from "./authority.js";
import { reciprocalRankFusion } from "./rrf.js";
import { isVectorIndexed, vectorState } from "./vector-rag/indexer.js";
import { SIMILARITY_THRESHOLD, vectorSearch } from "./vector-rag/retriever.js";

interface RetrieveResult {
  ok: boolean;
  prompt?: string;
  /** Full retrieved context (untruncated section text), used for grounding verification. */
  context?: string;
  sources: SourceInfo[];
  notIndexed: boolean;
}

/** Sections/chunks fed to the answer LLM. */
const TOP_K = 3;
/** Wider pool retrieved before authority re-ranking, so a high-authority result
 *  just outside the top-K can still surface ahead of a lower-authority one. */
const CANDIDATE_POOL = 5;

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

/** Assemble the successful retrieval result: prompt for the answer LLM, full
 *  context for the grounding verifier, and truncated source previews for the UI. */
function buildRetrieved(
  query: string,
  items: Array<Section | Chunk>,
  scores: number[],
): RetrieveResult {
  const ctx = sectionsToContext(items, scores);
  return {
    ok: true,
    prompt: buildPrompt(query, ctx),
    context: ctx.map((s) => `[${s.id}]\n${s.content}`).join("\n---\n"),
    sources: toSources(items, scores),
    notIndexed: false,
  };
}

export async function retrieve(query: string, strategy: Strategy): Promise<RetrieveResult> {
  if (strategy === "markdown_kb") {
    if (!isMarkdownIndexed()) return { ok: false, sources: [], notIndexed: true };
    const ranked = bm25Search(query, CANDIDATE_POOL);
    if (ranked.length === 0) return { ok: false, sources: [], notIndexed: false };
    const top = rerankByAuthority(
      ranked.map((r) => r.section),
      ranked.map((r) => r.score),
    ).slice(0, TOP_K);
    return buildRetrieved(
      query,
      top.map((t) => t.item),
      top.map((t) => t.score),
    );
  }

  if (strategy === "llm_index") {
    if (!isMarkdownIndexed()) return { ok: false, sources: [], notIndexed: true };

    // The LLM reads the section catalog (what wiki/index.md renders) and picks
    // the relevant sections by meaning — no keyword/vector scoring.
    const selected = await selectSections(query, markdownState.sections);
    if (selected.length === 0) return { ok: false, sources: [], notIndexed: false };

    // No similarity score for the LLM router; expose the 1-based pick order, which
    // the UI renders as "rank N" instead of a misleading decimal score.
    return buildRetrieved(
      query,
      selected,
      selected.map((_, i) => i + 1),
    );
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
    const fused = reciprocalRankFusion([bm25Ids, vectorIds]);

    // Fuse at section granularity; the Markdown KB store holds the full section
    // text (vector chunks may be partial), so it is the canonical content source.
    const sectionById = new Map(markdownState.sections.map((s) => [s.id, s]));
    const ranked = fused
      .map((f) => ({ section: sectionById.get(f.id), score: f.score }))
      .filter((r): r is { section: Section; score: number } => r.section !== undefined);
    if (ranked.length === 0) return { ok: false, sources: [], notIndexed: false };

    // Apply source-authority re-ranking to the fused pool, then take the top-K.
    const top = rerankByAuthority(
      ranked.map((r) => r.section),
      ranked.map((r) => r.score),
    ).slice(0, TOP_K);

    return buildRetrieved(
      query,
      top.map((t) => t.item),
      top.map((t) => t.score),
    );
  }

  if (!isVectorIndexed()) return { ok: false, sources: [], notIndexed: true };
  const hits = await vectorSearch(query, CANDIDATE_POOL);
  if (hits.length === 0) return { ok: false, sources: [], notIndexed: false };
  const top = rerankByAuthority(
    hits.map((h) => h.chunk),
    hits.map((h) => h.score),
  ).slice(0, TOP_K);
  return buildRetrieved(
    query,
    top.map((t) => t.item),
    top.map((t) => t.score),
  );
}

export async function answerQuery(
  query: string,
  strategy: Strategy,
  opts: { verify?: boolean } = {},
): Promise<ChatResult> {
  if (detectInjection(query)) {
    return { answer: INJECTION_REFUSAL, sources: [] };
  }
  const r = await retrieve(query, strategy);
  if (r.notIndexed) {
    const which =
      strategy === "markdown_kb" || strategy === "llm_index"
        ? "Markdown KB"
        : strategy === "vector_rag"
          ? "Vector"
          : "Hybrid";
    return {
      answer: `The ${which} index has not been built yet. Call POST /index first.`,
      sources: [],
    };
  }
  if (!r.ok || !r.prompt) {
    return { answer: "I cannot confirm from the knowledge base.", sources: [] };
  }
  const raw = await generateAnswer(r.prompt);
  const answer = sanitizeCitations(raw, r.sources.map((s) => s.source));
  const grounding = opts.verify ? await verifyGrounding(answer, r.context ?? "") : undefined;
  return { answer, sources: r.sources, grounding };
}

export function indexedStatus() {
  return {
    markdown_kb: isMarkdownIndexed(),
    vector_rag: isVectorIndexed(),
    vector_chunks: vectorState.chunks.length,
  };
}
