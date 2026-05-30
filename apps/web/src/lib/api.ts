import { hc } from "hono/client";
import type { AppType } from "@kb/server/app";
import type { FeedbackInput } from "@kb/shared";

export const client = hc<AppType>(
  typeof window === "undefined" ? "http://localhost:5173" : window.location.origin,
);

export async function buildIndex() {
  const res = await client["build-index"].$post();
  if (!res.ok) throw new Error(`/build-index failed: ${res.status}`);
  return res.json();
}

export async function compareQuery(query: string) {
  const res = await client.compare.$post({ json: { query } });
  if (!res.ok) throw new Error(`/compare failed: ${res.status}`);
  return res.json();
}

export async function chatOnce(query: string, strategy: "markdown_kb" | "vector_rag") {
  const res = await client.chat.$post({ json: { query, strategy } });
  if (!res.ok) throw new Error(`/chat failed: ${res.status}`);
  return res.json();
}

export async function sendFeedback(input: FeedbackInput) {
  const res = await client.feedback.$post({ json: input });
  if (!res.ok) throw new Error(`/feedback failed: ${res.status}`);
  return res.json();
}
