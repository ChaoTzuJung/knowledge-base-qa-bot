import { Hono } from "hono";
import { z } from "zod";
import { answerQuery } from "../strategies/query.js";

const ChatBody = z.object({
  query: z.string().min(1),
  strategy: z.enum(["markdown_kb", "vector_rag"]).optional(),
});

export const chatRoute = new Hono().post("/chat", async (c) => {
  let parsed;
  try {
    parsed = ChatBody.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: "Invalid body. Expect { query: string, strategy?: 'markdown_kb' | 'vector_rag' }" }, 400);
  }
  const strategy = parsed.strategy ?? "markdown_kb";
  const result = await answerQuery(parsed.query, strategy);
  return c.json({ ...result, strategy });
});
