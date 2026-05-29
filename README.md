<p align="right"><strong>English</strong> · <a href="./README.zh-TW.md">繁體中文</a></p>

# Knowledge Base Q&A Bot

A self-hostable Q&A chatbot over a local Markdown knowledge base. The server retrieves
grounded context with **two interchangeable strategies** — Markdown KB (BM25) and Vector
RAG (HNSW over OpenAI embeddings) — and streams the answer with inline citations.
The web client is built on [assistant-ui](https://www.assistant-ui.com/) and the
[Vercel AI SDK v6](https://ai-sdk.dev/) UI message stream protocol.

```
┌────────────┐   POST /chat/stream    ┌──────────────┐
│  React +   │ ─────────────────────▶ │  Hono server │
│ assistant- │                        │  (Node.js)   │
│    ui      │  data-sources part     │              │
│            │  ◀── text-* parts ──── │   strategies │
└────────────┘                        └──────┬───────┘
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                         markdown_kb (BM25)     vector_rag (HNSW
                         heading sections        + embeddings)
```

---

## 1 · How to use

### Prerequisites

- Node.js 20+ (tested on 22.11)
- An `OPENAI_API_KEY` exported in your shell. Without it `/chat`, `/chat/stream`,
  `/compare`, and embedding generation during `/build-index` will fail.

```bash
export OPENAI_API_KEY="sk-..."
```

Optional environment variables:

| Variable                 | Default                   | Purpose                                |
|--------------------------|---------------------------|----------------------------------------|
| `OPENAI_MODEL`           | `gpt-4o-mini`             | Chat completion model                  |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small`  | Embedding model for the vector index   |
| `PORT`                   | `8000`                    | Server port                            |

### Install & run

```bash
npm install
npm run dev:server   # terminal 1 — Hono on :8000
npm run dev:web      # terminal 2 — Vite on :5173 (proxies to :8000)
```

Then open <http://localhost:5173>. On first load the indexes are empty — click
**Build Index** in the sidebar (or `POST /build-index`) before asking questions.

### Try it with curl

```bash
# Health
curl http://localhost:8000/health
# {"status":"ok"}

# Build both indexes from docs/*.md
curl -X POST http://localhost:8000/build-index
# {"files_indexed":3,"sections_indexed":12,"chunks_indexed":12,"vector_files_indexed":3}

# One-shot Q&A (BM25 by default)
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'

# Same query, vector strategy
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"Can I change my email address?","strategy":"vector_rag"}'

# Out-of-scope → honest fallback
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which restaurants are nearby?"}'
# "I cannot confirm from the knowledge base."

# Streaming (AI SDK v6 UI message stream)
curl -N -X POST http://localhost:8000/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'

# Side-by-side compare
curl -X POST http://localhost:8000/compare \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'
```

### Import raw sources (optional)

The knowledge base is canonical Markdown under `docs/`. To bring in plain-text or
HTML sources, drop them in `raw/` and normalize them into `docs/*.md`:

```bash
npm run import:raw              # raw/*.txt | raw/*.html -> docs/*.md
npm run import:raw -- --force   # overwrite docs that already exist
```

Each converted file gets YAML front matter recording its original `source`
filename, and a heading is guaranteed so the indexers always pick it up. The
script only normalizes — rebuild afterwards with **Build Index** or
`POST /build-index`.

### Paraphrase eval (retrieval robustness)

`npm run eval` runs a curated set of paraphrased queries — the *same* intent phrased
different ways — through both strategies' retrieval layer (no LLM answer) and reports
whether each strategy still surfaces the expected section. It makes the two failure
modes concrete: BM25 misses synonyms ("money back" never matches the word "refund"),
while vector search can return a semantically related but wrong section.

```bash
npm run eval   # build the index first: POST /build-index, or ensure .kb/ exists
```

The BM25 column needs no API key; the vector column embeds each query, so it needs
`OPENAI_API_KEY` (without it those cells degrade to an error and the BM25 column
still prints).

```text
▸ refund timing   →  expect: refund_policy.md#refund-timeline
   "How long do refunds take?"
       BM25    ✅ refund_policy.md#refund-timeline  (2.152)
       Vector  ✅ refund_policy.md#refund-timeline  (0.683)
   "When will I get my money back?"
       BM25    ⚠️  cannot-confirm (below threshold)
       Vector  ✅ refund_policy.md#refund-timeline  (0.466)

Summary (out of 15 paraphrases)
   Markdown KB (BM25):   hit@1 10/15    hit@3 11/15
   Vector RAG:           hit@1 14/15    hit@3 15/15
```

Legend: ✅ expected is top-1, 🔸 expected in top-3, ❌ wrong section. The probes live
in [`apps/server/src/eval/paraphrase.ts`](apps/server/src/eval/paraphrase.ts) — add
intents and paraphrases there.

### Scripts

```bash
npm run dev:server   # Hono backend, :8000
npm run dev:web      # Vite frontend, :5173
npm run import:raw   # normalize raw/*.txt|*.html into docs/*.md
npm run eval         # paraphrase retrieval eval (BM25 vs vector)
npm run build        # tsc -b + vite build
npm run test:unit    # node:test unit tests (raw→Markdown helpers)
npm run test:e2e     # Playwright suite (auto-starts both dev servers)
```

---

## 2 · How it works

### Repository layout

```
.
├── apps/
│   ├── server/                  Hono backend on :8000
│   │   └── src/
│   │       ├── app.ts           chained Hono builder; exports AppType for RPC
│   │       ├── index.ts         startup + serve
│   │       ├── routes/          /health, /build-index, /chat, /chat/stream, /compare
│   │       ├── strategies/      markdown-kb (BM25), vector-rag (HNSW), shared retrieve
│   │       ├── scripts/         import-raw: raw/*.{txt,html} → docs/*.md (+ tests)
│   │       └── eval/            paraphrase: BM25 vs vector retrieval robustness
│   ├── web/                     React + Vite + Tailwind + assistant-ui on :5173
│   │   └── src/lib/api.ts       typed Hono RPC client via hc<AppType>
│   └── e2e/                     Playwright suite; auto-starts dev servers via webServer
├── packages/
│   └── shared/                  Strategy, SourceInfo, ChatResult, IndexResult
├── raw/                         drop-zone for .txt / .html sources to import
├── docs/                        canonical Markdown KB (refund_policy, account_help, ...)
├── .kb/                         generated indexes (gitignored)
│   ├── index.json               BM25 sections + stats
│   └── vector_index/            HNSW binary + metadata.json
└── tsconfig.json                strict shared root config; apps extend it
```

### API surface

| Method | Path            | Body                                                          | Response                                                  |
|--------|-----------------|---------------------------------------------------------------|-----------------------------------------------------------|
| GET    | `/health`       | —                                                             | `{ "status": "ok" }`                                      |
| POST   | `/build-index`  | —                                                             | `{ files_indexed, sections_indexed, chunks_indexed, ... }`|
| POST   | `/chat`         | `{ query, strategy?: "markdown_kb" \| "vector_rag" }`         | `{ answer, sources, strategy }`                           |
| POST   | `/chat/stream`  | `{ query, strategy? }` or `{ messages: [...], strategy? }`    | AI SDK UI message stream (SSE)                            |
| POST   | `/compare`      | `{ query }`                                                   | `{ markdown_kb: {...}, vector_rag: {...} }`               |

### Retrieval pipeline

For each query:

1. **Tokenise & retrieve** using the selected strategy.
   - **Markdown KB**: parse `docs/*.md` into heading sections, score with BM25, return
     the top-k sections.
   - **Vector RAG**: same parsing, but split sections longer than 1500 chars (200-char
     overlap), embed with `text-embedding-3-small`, search the HNSW index by cosine
     similarity.
2. **Threshold check**. BM25 ≥ 0.5 or cosine ≥ 0.3 — anything below is treated as
   "no confident match"; the server short-circuits to `"I cannot confirm from the
   knowledge base."` without calling the LLM.
3. **Prompt assembly**. Top hits are joined with their heading path
   (`refund_policy.md > Refund Policy > Refund timeline`) and inserted into the
   system + user prompt template.
4. **Generate**. `streamText` with the assembled prompt, streamed back as UI message
   parts.

### Streaming protocol

`/chat/stream` returns a Vercel AI SDK v6 UI message stream. The order is deliberate:

```
data: {"type":"data-sources","id":"sources","data":{"strategy":"markdown_kb","sources":[...]}}
data: {"type":"start","messageId":"..."}
data: {"type":"text-start","id":"..."}
data: {"type":"text-delta","id":"...","delta":"Refunds "}
data: {"type":"text-delta","id":"...","delta":"typically arrive in "}
...
data: {"type":"finish"}
```

Sources are streamed **before** any answer token so the UI can render the sources
panel while the model is still generating. The implementation uses
`createUIMessageStream` to inject the `data-sources` part, then `writer.merge`'s the
output of `streamText().toUIMessageStream({ messageMetadata, onFinish })`.

### End-to-end type safety

The server defines a single chained Hono app in
[`apps/server/src/app.ts`](apps/server/src/app.ts) and exports its type:

```ts
export const app = new Hono()
  .use("*", cors())
  .route("/", healthRoute)
  .route("/", indexRoute)
  .route("/", chatRoute)
  // ...

export type AppType = typeof app;
```

The web client consumes it via
[`apps/web/src/lib/api.ts`](apps/web/src/lib/api.ts):

```ts
import { hc } from "hono/client";
import type { AppType } from "@kb/server/app";

export const client = hc<AppType>(window.location.origin);

// Compile-time error if the body shape is wrong:
await client.compare.$post({ json: { query: "..." } });
```

Request and response shapes flow from the server's `c.req.valid("json")` (validated
by `@hono/zod-validator`) and `c.json(...)` into the client without any duplicated
type declarations.

### Tests

Playwright covers the user-visible flows under `apps/e2e/tests/`:

- `cold-start` — welcome screen renders before any indexing.
- `chat-markdown-kb` — refund question, asserts streamed answer and citation.
- `chat-vector-rag` — email question routed through the vector strategy.
- `compare` — `/compare` view renders both columns.
- `index-management` — Build Index button transitions to "Indexing…" and shows
  counts.
- `out-of-scope` — restaurant question hits the "cannot confirm" fallback with an
  empty sources panel.

The Playwright config has a `webServer` block, so `npm run test:e2e` boots both
`dev:server` and `dev:web` automatically (or reuses already-running instances
locally).

Unit tests use Node's built-in `node:test` (zero dependencies) and cover the
pure raw→Markdown conversion helpers in `apps/server/src/scripts/import-raw.test.ts`.
Run them with `npm run test:unit`.

---

## 3 · Design decisions

### Why two retrieval strategies?

The brief asked for grounded Q&A. BM25 and vector RAG have different failure modes,
and the corpus is small enough that running both in parallel is cheap. `/compare`
makes the difference visible so the reader can build intuition for when each
strategy wins ("How long do refunds take?" → BM25 nails it because the heading
itself contains the keywords; "Can I change my email address?" → vector wins
because the heading is "Update account email" with no overlap in surface form).

### Why a heading section as the retrieval unit?

Markdown documents are already authored with semantic boundaries — headings. A
heading section is small enough to fit in a prompt but large enough to retain
local context. Splitting on sentences would over-fragment; splitting on whole
files would over-coarsen. Sections longer than 1500 characters are further chunked
for the vector index with a 200-character overlap so dense paragraphs don't lose
neighbours at boundaries.

### Why explicit "I cannot confirm"?

The whole point of a knowledge base bot is to *not* hallucinate. Below the
similarity threshold, the server short-circuits to a fixed string without ever
calling the LLM. That keeps cost predictable and removes the temptation for the
model to bridge with general knowledge it picked up at training time.

### Why stream sources *before* tokens?

Two reasons:
1. **Perceived latency**. The sources panel populates immediately while the LLM
   starts generating, so the UI never looks frozen.
2. **Honesty**. The user can see what evidence the answer is built on *before*
   reading the answer, which makes verifying easier.

The AI SDK v6 protocol supports out-of-order parts (`data-*` and `text-*` can be
interleaved), and the assistant-ui `SourcesPanel` simply reads the latest
`data-sources` part from the last assistant message.

### Why a chained Hono builder + Hono RPC instead of fetch?

The first cut of this project had five separate `new Hono()` instances mounted
at `/`, plus a raw `fetch("/chat", ...)` client. That worked but had two costs:

- Request/response types were duplicated in
  `apps/server/src/lib/types.ts` and `apps/web/src/lib/types.ts`. They were already
  out of sync in one place.
- A typo in the request body (`query` → `qery`) would silently fail at runtime.

Switching to a chained builder lets `typeof app` capture every route's input and
output shape. The web client gets a typed proxy
(`client.compare.$post({ json: { query } })`) and the duplicated types collapse
into a single `packages/shared/` workspace.

`@hono/zod-validator` was the natural pair — `c.req.valid("json")` is both the
validation gate and the typed payload source in one call.

### Why `/build-index` instead of `/index`?

The Hono RPC client treats `client.index` as an alias for the parent path
(`/` in this case), so `client.index.$post()` resolved to `POST /` and failed.
Renaming the route to `/build-index` sidesteps the alias and reads more clearly
("build the index") in both the API surface and the URL bar.

### Why a separate `packages/shared` workspace?

Cross-app types are not server-only or web-only. Putting them in a third workspace
makes the dependency direction explicit (both apps depend on `@kb/shared`) and
prevents `apps/web` from pulling in server-only modules just to import a type.
Server-only types like `Section`, `Chunk`, and `VectorMetadata` stay in
`apps/server/src/lib/types.ts`.

### Why strict TypeScript at the repo root?

A single `tsconfig.json` at the root with `strict`, `verbatimModuleSyntax`,
`isolatedModules`, `noFallthroughCasesInSwitch`, and `noImplicitOverride`. Both
apps extend it. The benefit is consistency: if one app gets a stricter compile
flag, the other gets it for free, and reviewers don't have to remember which
package is laxer. The cost was one round of `as unknown as` cleanup that turned
out to be hiding real type weaknesses around `UIMessage.parts`.

### Scale ceiling

This implementation is comfortable up to a few thousand sections. Past that:

- BM25 in JavaScript with an in-memory index stops fitting in a single process.
  Move to a dedicated backend (Tantivy / Meilisearch / OpenSearch).
- HNSW with `hnswlib-node` is fine into the millions of vectors, but rebuilding
  the index on every `/build-index` becomes slow. Move to a vector DB with
  incremental upserts (pgvector, Qdrant, Pinecone).
- The `/build-index` endpoint should be replaced by a background worker once
  rebuilds take longer than a request cycle.

None of this is necessary for the present corpus — the point is the architecture
already separates the strategy interface from its storage, so swapping is a
contained change.
