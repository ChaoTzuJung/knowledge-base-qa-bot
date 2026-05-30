import type { Section } from "../../lib/types.js";
import { OPENAI_MODEL } from "../../env.js";
import { getOpenAI } from "../../llm/client.js";

const MAX_SECTIONS = 3;

/**
 * A compact catalog of section ids + heading breadcrumbs — the same map that
 * `wiki/index.md` renders — for the LLM router to choose from. Built from the
 * in-memory Markdown sections so it never depends on the generated wiki file.
 */
export function buildCatalog(sections: Section[]): string {
  return sections.map((s) => `- ${s.id} — ${s.heading_path.join(" > ")}`).join("\n");
}

export const ROUTER_SYSTEM_PROMPT = `You are a retrieval router. You receive a CATALOG of knowledge-base sections (one per line as "<id> — <heading path>") and a QUESTION. Pick the sections whose content most likely answers the question.

Rules:
1. Return ONLY a JSON array of section id strings, copied EXACTLY from the catalog. No prose, no code fence.
2. Pick at most ${MAX_SECTIONS}, best first; pick fewer (or none) if little is relevant.
3. If NOTHING in the catalog is relevant, return [].
4. Never invent ids that are not in the catalog.`;

/**
 * Parse the router's reply into a validated, deduped, capped list of ids that
 * actually exist in the catalog. Tolerates a ```json fence; drops any
 * hallucinated/unknown id. Returns [] on malformed output.
 */
export function parseSelection(reply: string, validIds: Set<string>): string[] {
  let text = reply.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: string[] = [];
  for (const item of parsed) {
    if (out.length >= MAX_SECTIONS) break;
    if (typeof item === "string" && validIds.has(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Ask the LLM to pick the most relevant sections from the catalog. Returns the
 * chosen Section objects (validated against the catalog; unknown ids dropped).
 * Fails closed: on any error returns [] so the caller short-circuits to the
 * "I cannot confirm" fallback rather than crashing the request.
 */
export async function selectSections(query: string, sections: Section[]): Promise<Section[]> {
  if (sections.length === 0) return [];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const catalog = buildCatalog(sections);

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `CATALOG:\n${catalog}\n\nQUESTION:\n${query}\n\nSelected ids (JSON array):`,
        },
      ],
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    const ids = parseSelection(reply, new Set(byId.keys()));
    return ids.map((id) => byId.get(id)).filter((s): s is Section => s !== undefined);
  } catch (err) {
    console.error("[llm-index] router failed:", err);
    return [];
  }
}
