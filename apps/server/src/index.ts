import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PORT } from "./env.js";
import { healthRoute } from "./routes/health.js";
import { indexRoute } from "./routes/index.js";
import { chatRoute } from "./routes/chat.js";
import { chatStreamRoute } from "./routes/chatStream.js";
import { compareRoute } from "./routes/compare.js";
import { loadIndexJson } from "./strategies/markdown-kb/indexer.js";
import { loadVectorIndex } from "./strategies/vector-rag/indexer.js";

const app = new Hono();

app.use("*", cors());
app.route("/", healthRoute);
app.route("/", indexRoute);
app.route("/", chatRoute);
app.route("/", chatStreamRoute);
app.route("/", compareRoute);

try {
  const md = loadIndexJson();
  console.log(`[startup] markdown_kb: ${md.sections_indexed} sections from ${md.files_indexed} files`);
} catch (err) {
  console.error("[startup] failed to load markdown_kb index:", err);
}
try {
  const vec = loadVectorIndex();
  console.log(`[startup] vector_rag: ${vec.chunks_indexed} chunks from ${vec.files_indexed} files`);
} catch (err) {
  console.error("[startup] failed to load vector index:", err);
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
