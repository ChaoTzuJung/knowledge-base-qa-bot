import { OPENAI_MODEL } from "../env.js";
import { getOpenAI } from "./client.js";
import { CONTEXTUALIZE_SYSTEM_PROMPT } from "./prompts.js";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

// Keep memory "short": the last few turns are enough to resolve a follow-up.
const MAX_TURNS = 6;

/**
 * Rewrite a follow-up question into a standalone query using recent conversation
 * history, so retrieval can resolve pronouns and implicit references. Memory only
 * shapes WHAT we search for — answer generation still grounds on retrieved sources.
 *
 * Fails open: on the first turn (no history) or any error, returns the question
 * unchanged so chat is never blocked by this step.
 */
export async function contextualizeQuery(history: Turn[], question: string): Promise<string> {
  if (history.length === 0) return question;

  const transcript = history
    .slice(-MAX_TURNS)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: CONTEXTUALIZE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Chat history:\n${transcript}\n\nFollow-up question:\n${question}\n\nStandalone question:`,
        },
      ],
    });
    const rewritten = completion.choices[0]?.message?.content?.trim();
    return rewritten && rewritten.length > 0 ? rewritten : question;
  } catch (err) {
    console.error("[contextualize] rewrite failed, using original question:", err);
    return question;
  }
}
