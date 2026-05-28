import type { Chunk, Section } from "../lib/types.js";

export const SYSTEM_PROMPT = `You are a knowledge base assistant.

Rules:
1. Answer ONLY using the information in the CONTEXT block below.
2. Cite every factual claim using the exact source IDs that appear inline as [Source: filename.md#heading-slug]. Use the format [filename.md#heading-slug] in your answer.
3. If the CONTEXT does not contain enough information to answer, reply exactly: "I cannot confirm from the knowledge base."
4. Do not use any outside knowledge. Do not guess.
5. Keep answers concise (1-3 sentences) and grounded.`;

export interface ContextSection {
  id: string;
  heading_path: string[];
  content: string;
  score: number;
}

export function sectionsToContext(items: Array<Section | Chunk>, scores: number[]): ContextSection[] {
  return items.map((item, i) => ({
    id: item.id,
    heading_path: item.heading_path,
    content: item.content,
    score: scores[i],
  }));
}

export function buildPrompt(query: string, sections: ContextSection[]): string {
  if (sections.length === 0) {
    return `CONTEXT:\n(no context)\n\nQUESTION:\n${query}`;
  }
  const blocks = sections.map((s) => {
    const breadcrumb = s.heading_path.join(" > ");
    return `[Source: ${s.id}] [Score: ${s.score.toFixed(3)}]\nHeading: ${breadcrumb}\n${s.content}`;
  });
  return `CONTEXT:\n${blocks.join("\n---\n")}\n\nQUESTION:\n${query}`;
}
