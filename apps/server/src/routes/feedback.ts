import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { recordFeedback } from "../feedback/store.js";

const FeedbackBody = z.object({
  rating: z.enum(["up", "down"]),
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
  // For a "down" rating: the section the answer should have used, or null to mean
  // "it should have refused". Omitted for "up".
  expected_source: z.string().nullable().optional(),
});

export const feedbackRoute = new Hono().post(
  "/feedback",
  zValidator("json", FeedbackBody, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error:
            "Invalid body. Expect { rating: 'up' | 'down', query, answer, sources?, expected_source? }",
        },
        400,
      );
    }
    return undefined;
  }),
  async (c) => {
    const input = c.req.valid("json");
    recordFeedback(input, new Date().toISOString());
    return c.json({ recorded: true });
  },
);
