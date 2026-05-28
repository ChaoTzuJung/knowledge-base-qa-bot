import type { ChatResult, IndexResult, Strategy } from "./types";

export async function buildIndex(): Promise<IndexResult> {
  const res = await fetch("/index", { method: "POST" });
  if (!res.ok) throw new Error(`/index failed: ${res.status}`);
  return res.json();
}

export async function compareQuery(query: string): Promise<{
  markdown_kb: ChatResult;
  vector_rag: ChatResult;
}> {
  const res = await fetch("/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`/compare failed: ${res.status}`);
  return res.json();
}

export async function chatOnce(
  query: string,
  strategy: Strategy,
): Promise<ChatResult & { strategy: Strategy }> {
  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, strategy }),
  });
  if (!res.ok) throw new Error(`/chat failed: ${res.status}`);
  return res.json();
}
