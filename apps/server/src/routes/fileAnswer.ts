import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { fileAnswer } from "../strategies/markdown-kb/answer-filing.js";

const FileAnswerBody = z.object({
  query: z.string().min(1),
  answer: z.string().min(1),
  sources: z
    .array(
      z.object({
        source: z.string(),
        heading: z.string(),
        score: z.number(),
        content: z.string(),
      }),
    )
    .default([]),
  strategy: z.enum(["markdown_kb", "vector_rag"]).optional(),
});

export const fileAnswerRoute = new Hono().post(
  "/file-answer",
  zValidator("json", FileAnswerBody, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid body. Expect { query: string, answer: string, sources?: SourceInfo[], strategy?: 'markdown_kb' | 'vector_rag' }" },
        400,
      );
    }
    return undefined;
  }),
  async (c) => {
    const { query, answer, sources, strategy: maybeStrategy } = c.req.valid("json");
    const strategy = maybeStrategy ?? "markdown_kb";
    const { slug, file } = fileAnswer({
      query,
      answer,
      sources,
      strategy,
      filedAt: new Date().toISOString(),
    });
    return c.json({ filed: true, slug, file });
  },
);
