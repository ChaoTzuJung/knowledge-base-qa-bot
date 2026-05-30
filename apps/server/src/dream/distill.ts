import { OPENAI_MODEL } from "../env.js";
import { getOpenAI } from "../llm/client.js";

export interface QAPair {
  question: string;
  answer: string;
}

export const DISTILL_SYSTEM_PROMPT = `You are consolidating a knowledge base. You are given several similar questions that were each already answered FROM the knowledge base, with their answers.

Produce ONE canonical FAQ entry that covers them:
1. Write a single clear, general question that represents the group.
2. Write a concise answer (1-3 sentences) using ONLY facts present in the provided answers. Do not add new information.
3. Preserve the inline [file.md#heading-slug] citation markers from the source answers; cite the same sources.
4. Output ONLY JSON: {"question": string, "answer": string}. No prose, no code fence.`;

/**
 * Parse the distiller's reply into a canonical Q&A. Tolerates a ```json fence.
 * Returns null on malformed output or empty fields, so the caller SKIPS the
 * cluster rather than writing junk into the KB (fail-open).
 */
export function parseDistillation(reply: string): QAPair | null {
  let text = reply.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    const parsed = JSON.parse(text) as { question?: unknown; answer?: unknown };
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    if (!question || !answer) return null;
    return { question, answer };
  } catch {
    return null;
  }
}

function buildDistillPrompt(pairs: QAPair[]): string {
  const blocks = pairs.map((p, i) => `Q${i + 1}: ${p.question}\nA${i + 1}: ${p.answer}`);
  return `${blocks.join("\n\n")}\n\nCanonical FAQ entry (JSON):`;
}

/**
 * Distill a cluster of similar Q&A pairs into one canonical entry via a single
 * LLM call. Fails OPEN: returns null on any error or malformed reply, so a flaky
 * call never corrupts the consolidated KB.
 */
export async function distillCluster(pairs: QAPair[]): Promise<QAPair | null> {
  if (pairs.length === 0) return null;
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: DISTILL_SYSTEM_PROMPT },
        { role: "user", content: buildDistillPrompt(pairs) },
      ],
    });
    return parseDistillation(completion.choices[0]?.message?.content ?? "");
  } catch (err) {
    console.error("[dream] distillCluster failed (cluster skipped):", err);
    return null;
  }
}
