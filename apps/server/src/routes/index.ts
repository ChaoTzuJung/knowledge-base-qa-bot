import { Hono } from "hono";
import { buildIndex } from "../strategies/markdown-kb/indexer.js";
import { buildVectorIndex } from "../strategies/vector-rag/indexer.js";

export const indexRoute = new Hono().post("/build-index", async (c) => {
  const md = buildIndex();
  let vector: { files_indexed: number; chunks_indexed: number };
  try {
    vector = await buildVectorIndex();
  } catch (err) {
    console.error("[/index] vector index build failed:", err);
    vector = { files_indexed: 0, chunks_indexed: 0 };
  }
  return c.json({
    files_indexed: md.files_indexed,
    sections_indexed: md.sections_indexed,
    chunks_indexed: vector.chunks_indexed,
    vector_files_indexed: vector.files_indexed,
  });
});
