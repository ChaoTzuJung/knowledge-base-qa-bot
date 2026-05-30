import { OPENAI_MODEL } from "../env.js";
import { getOpenAI } from "./client.js";
import type { GroundingVerdict } from "../lib/types.js";

export const GROUNDING_SYSTEM_PROMPT = `You are a strict grounding checker. Given an ANSWER and the CONTEXT it was supposed to be based on, decompose the answer into atomic factual claims and decide whether EACH claim is directly supported by the context.

Rules:
1. A claim is "supported" only if the context states it or directly entails it. General world knowledge does NOT count as support.
2. Ignore the inline [file.md#heading] citation markers themselves — judge the factual content, not the citations.
3. Output ONLY JSON: {"grounded": boolean, "unsupported": string[]}. "grounded" is true iff every claim is supported; "unsupported" lists the unsupported claims (short paraphrases), empty when grounded.
4. No prose, no code fence.`;

/**
 * Parse the checker's reply into a verdict. Tolerates a ```json fence. Fails
 * OPEN (treats the answer as grounded) on malformed output so a flaky checker
 * never suppresses an otherwise-valid answer.
 */
export function parseVerdict(reply: string): GroundingVerdict {
  let text = reply.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    const parsed = JSON.parse(text) as { grounded?: unknown; unsupported?: unknown };
    if (typeof parsed.grounded !== "boolean") return { grounded: true, unsupported: [] };
    const unsupported = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((c): c is string => typeof c === "string")
      : [];
    return { grounded: parsed.grounded, unsupported };
  } catch {
    return { grounded: true, unsupported: [] };
  }
}

/**
 * Second-pass grounding check: ask the model to verify the answer's claims
 * against the retrieved context. Catches hallucinations that cleared retrieval
 * thresholds. Fails open on error / empty input (returns grounded).
 */
export async function verifyGrounding(answer: string, context: string): Promise<GroundingVerdict> {
  if (!answer.trim() || !context.trim()) return { grounded: true, unsupported: [] };

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: GROUNDING_SYSTEM_PROMPT },
        { role: "user", content: `CONTEXT:\n${context}\n\nANSWER:\n${answer}\n\nVerdict (JSON):` },
      ],
    });
    return parseVerdict(completion.choices[0]?.message?.content ?? "");
  } catch (err) {
    console.error("[grounding] verify failed, treating as grounded:", err);
    return { grounded: true, unsupported: [] };
  }
}
