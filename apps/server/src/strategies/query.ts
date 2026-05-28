import type { ChatResult, SourceInfo, Strategy } from "../lib/types.js";
import { generateAnswer } from "../llm/answer.js";
import { buildPrompt, sectionsToContext } from "../llm/prompts.js";
import { search as bm25Search } from "./markdown-kb/bm25.js";
import { isIndexed as isMarkdownIndexed } from "./markdown-kb/indexer.js";
import { isVectorIndexed, vectorState } from "./vector-rag/indexer.js";
import { vectorSearch } from "./vector-rag/retriever.js";

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
    const which = strategy === "markdown_kb" ? "Markdown KB" : "Vector";
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
