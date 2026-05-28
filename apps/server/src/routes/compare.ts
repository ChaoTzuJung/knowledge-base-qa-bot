import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { answerQuery } from "../strategies/query.js";

const CompareBody = z.object({ query: z.string().min(1) });

export const compareRoute = new Hono().post(
  "/compare",
  zValidator("json", CompareBody, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid body. Expect { query: string }" }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const { query } = c.req.valid("json");
    const [markdownKb, vectorRag] = await Promise.all([
      answerQuery(query, "markdown_kb"),
      answerQuery(query, "vector_rag"),
    ]);
    return c.json({ markdown_kb: markdownKb, vector_rag: vectorRag });
  },
);
