import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { answerQuery } from "../strategies/query.js";

const ChatBody = z.object({
  query: z.string().min(1),
  strategy: z.enum(["markdown_kb", "vector_rag"]).optional(),
});

export const chatRoute = new Hono().post(
  "/chat",
  zValidator("json", ChatBody, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid body. Expect { query: string, strategy?: 'markdown_kb' | 'vector_rag' }" },
        400,
      );
    }
    return undefined;
  }),
  async (c) => {
    const { query, strategy: maybeStrategy } = c.req.valid("json");
    const strategy = maybeStrategy ?? "markdown_kb";
    const result = await answerQuery(query, strategy);
    return c.json({ ...result, strategy });
  },
);
