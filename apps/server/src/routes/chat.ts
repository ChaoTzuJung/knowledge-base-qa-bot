import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { answerQuery } from "../strategies/query.js";

const ChatBody = z.object({
  query: z.string().min(1),
  strategy: z.enum(["markdown_kb", "vector_rag", "hybrid", "llm_index"]).optional(),
});

export const chatRoute = new Hono().post(
  "/chat",
  zValidator("json", ChatBody, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error:
            "Invalid body. Expect { query: string, strategy?: 'markdown_kb' | 'vector_rag' | 'hybrid' | 'llm_index' }",
        },
        400,
      );
    }
    return undefined;
  }),
  async (c) => {
    const { query, strategy: maybeStrategy } = c.req.valid("json");
    const strategy = maybeStrategy ?? "hybrid";
    const result = await answerQuery(query, strategy, { verify: true });
    return c.json({ ...result, strategy });
  },
);
