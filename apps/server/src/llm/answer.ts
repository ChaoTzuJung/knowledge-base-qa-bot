import { OPENAI_MODEL } from "../env.js";
import { getOpenAI } from "./client.js";
import { SYSTEM_PROMPT } from "./prompts.js";

export async function generateAnswer(userPrompt: string): Promise<string> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}
