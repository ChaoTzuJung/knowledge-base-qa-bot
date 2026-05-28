import { Hono } from "hono";
import { z } from "zod";
import { answerQuery } from "../strategies/query.js";

const CompareBody = z.object({ query: z.string().min(1) });

export const compareRoute = new Hono().post("/compare", async (c) => {
  let parsed;
  try {
    parsed = CompareBody.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body. Expect { query: string }" }, 400);
  }
  const [markdownKb, vectorRag] = await Promise.all([
    answerQuery(parsed.query, "markdown_kb"),
    answerQuery(parsed.query, "vector_rag"),
  ]);
  return c.json({ markdown_kb: markdownKb, vector_rag: vectorRag });
});
