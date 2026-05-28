import { openai } from "@ai-sdk/openai";
import { createDataStreamResponse, formatDataStreamPart, streamText } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { OPENAI_MODEL } from "../env.js";
import { SYSTEM_PROMPT } from "../llm/prompts.js";
import { retrieve } from "../strategies/query.js";

const Message = z.object({
  role: z.string(),
  content: z.union([
    z.string(),
    z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
  ]),
});

const StreamBody = z.object({
  query: z.string().optional(),
  messages: z.array(Message).optional(),
  strategy: z.enum(["markdown_kb", "vector_rag"]).optional(),
}).refine((v) => v.query || (v.messages && v.messages.length > 0), {
  message: "Provide either query or messages.",
});

function extractQuery(body: z.infer<typeof StreamBody>): string {
  if (body.query) return body.query;
  const msgs = body.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const textPart = m.content.find((p) => p.type === "text" && p.text);
    if (textPart?.text) return textPart.text;
  }
  return "";
}

export const chatStreamRoute = new Hono().post("/chat/stream", async (c) => {
  let body: z.infer<typeof StreamBody>;
  try {
    body = StreamBody.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body. Expect { query | messages, strategy? }" }, 400);
  }

  const strategy = body.strategy ?? "markdown_kb";
  const query = extractQuery(body);
  if (!query) return c.json({ error: "Empty query" }, 400);

  const retrieved = await retrieve(query, strategy);

  const response = createDataStreamResponse({
    async execute(dataStream) {
      dataStream.writeData(
        JSON.parse(JSON.stringify({
          type: "sources",
          strategy,
          sources: retrieved.sources,
        })),
      );

      if (retrieved.notIndexed) {
        const which = strategy === "markdown_kb" ? "Markdown KB" : "Vector";
        dataStream.write(
          formatDataStreamPart(
            "text",
            `The ${which} index has not been built yet. Call POST /index first.`,
          ),
        );
        return;
      }

      if (!retrieved.ok || !retrieved.prompt) {
        dataStream.write(
          formatDataStreamPart("text", "I cannot confirm from the knowledge base."),
        );
        return;
      }

      const stream = streamText({
        model: openai(OPENAI_MODEL),
        system: SYSTEM_PROMPT,
        prompt: retrieved.prompt,
        temperature: 0,
      });
      stream.mergeIntoDataStream(dataStream);
    },
    onError: (err) => {
      console.error("[/chat/stream] error:", err);
      return err instanceof Error ? err.message : "Stream error";
    },
  });

  return response;
});
