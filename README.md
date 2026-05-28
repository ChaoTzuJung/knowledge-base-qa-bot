# Knowledge Base Q&A Bot

Node.js + React port of [`build-moat-live-sessions/knowledge_base_qa_bot`](https://github.com/AllenLi0110/build-moat-live-sessions/tree/main/knowledge_base_qa_bot).
Grounded Q&A over local Markdown docs. Both **Markdown KB (BM25)** and **Vector RAG (HNSW)**
retrieval strategies are implemented, plus a `/compare` endpoint that runs both side-by-side.
The frontend uses [assistant-ui](https://www.assistant-ui.com/) v0.14 with the **Vercel AI SDK
v6 UI message stream protocol** — sources are streamed first as a `data-sources` part, then
answer tokens as `text-start` / `text-delta` / `text-end`.

### Stack pin

| Package | Version |
|---|---|
| `ai` | ^6.0.0 |
| `@ai-sdk/openai` | ^3.0.0 |
| `@ai-sdk/react` | ^3.0.0 |
| `@assistant-ui/react` | ^0.14.0 |
| `@assistant-ui/react-ai-sdk` | ^1.3.0 |
| `hono` | ^4.6.0 |
| `hnswlib-node` | ^3.0.0 |

## Layout

```
.
├── docs/                       # Markdown knowledge base (sample: refunds, account, shipping)
├── .kb/                        # generated indexes (gitignored)
│   ├── index.json              # Markdown KB (BM25) — human-readable
│   └── vector_index/           # Vector RAG (hnswlib-node + metadata.json)
├── apps/
│   ├── server/                 # Hono backend on :8000
│   └── web/                    # Vite + React + assistant-ui on :5173
└── package.json                # npm workspaces
```

## Prerequisites

- Node.js 20+ (tested on 22.11)
- `OPENAI_API_KEY` for `/chat`, `/chat/stream`, `/compare`, and vector embeddings during `/index`

```bash
export OPENAI_API_KEY="sk-..."
```

Optional env: `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_EMBEDDING_MODEL`
(default `text-embedding-3-small`), `PORT` (default `8000`).

## Install & run

```bash
npm install

# Terminal 1: backend
npm run dev:server

# Terminal 2: frontend (proxies to :8000)
npm run dev:web

# Open http://localhost:5173
```

## API

| Method | Path           | Body                                                                  | Description                                           |
|--------|----------------|-----------------------------------------------------------------------|-------------------------------------------------------|
| GET    | `/health`      | —                                                                     | `{ "status": "ok" }`                                  |
| POST   | `/index`       | —                                                                     | Rebuilds both indexes from `docs/*.md`                |
| POST   | `/chat`        | `{ query, strategy?: "markdown_kb" \| "vector_rag" }`                 | Non-streaming JSON `{ answer, sources, strategy }`    |
| POST   | `/chat/stream` | `{ query, strategy? }` _or_ `{ messages: [...], strategy? }`          | AI SDK data stream; sources arrive as a data part     |
| POST   | `/compare`     | `{ query }`                                                           | `{ markdown_kb: {answer,sources}, vector_rag: {...} }`|

### Citation format

Answers cite sources inline as `[filename.md#heading-slug]`, e.g.
`[refund_policy.md#refund-timeline]`. The `sources[]` array includes the same id plus a
` > `-joined heading path, a numeric score, and a 240-character preview.

### Fallback behaviour

- Index not built → backend replies with an explicit "not indexed yet" message; no LLM call.
- Retrieval below threshold (BM25 < 0.5 or cosine < 0.3) → "I cannot confirm from the knowledge base."

## Verify

```bash
curl http://localhost:8000/health
# {"status":"ok"}

curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'
# Before indexing: "The Markdown KB index has not been built yet..."

curl -X POST http://localhost:8000/index
# {"files_indexed":3,"sections_indexed":12,"chunks_indexed":12,"vector_files_indexed":3}

cat .kb/index.json | head -40
cat .kb/vector_index/metadata.json | head -20

curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'
# 200 with answer citing refund_policy.md#refund-timeline

curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"Can I change my email address?","strategy":"vector_rag"}'
# 200 with answer citing account_help.md#change-email-address

curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which restaurants are nearby?"}'
# "I cannot confirm from the knowledge base."

curl -N -X POST http://localhost:8000/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'
# AI SDK v6 UI message stream (SSE):
#   data: {"type":"data-sources", "id":"sources", "data":{"strategy":..., "sources":[...]}}
#   data: {"type":"start","messageId":"..."}
#   data: {"type":"text-start","id":"..."}
#   data: {"type":"text-delta","id":"...","delta":"Refund"}
#   ...
#   data: {"type":"finish"}

curl -X POST http://localhost:8000/compare \
  -H 'Content-Type: application/json' \
  -d '{"query":"How long do refunds take?"}'
```

## Design notes

| Question                                  | Answer                                                                                                  |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Why both strategies?                      | Cheap apples-to-apples comparison on a tiny corpus. `/compare` makes it explicit.                       |
| Retrieval unit                            | Markdown KB: heading section. Vector RAG: same, but split if section > 1500 chars (200-char overlap).   |
| Score threshold                           | BM25 ≥ 0.5; cosine similarity ≥ 0.3. Below threshold ⇒ honest "cannot confirm", no LLM call.            |
| Persistence                               | `.kb/index.json` (Markdown KB) + `.kb/vector_index/{metadata.json,hnsw.bin}` (Vector RAG). Auto-loaded. |
| Streaming                                 | `createUIMessageStream` + `writer.write({type:"data-sources"})` + `writer.merge(streamText().toUIMessageStream())`. |
| Frontend                                  | assistant-ui `<Thread />` composed from `ThreadPrimitive` / `MessagePrimitive` / `ComposerPrimitive`; data parts surface as `{type:"data", name:"sources", data}` in `message.parts`. |
| Scale (10 → 100k files)                   | BM25 in-memory stops scaling well past ~10k sections; switch to a BM25 backend (Tantivy/Meili) or rely on Vector + ANN. |

## Scripts

```bash
npm run dev:server      # backend, :8000
npm run dev:web         # frontend, :5173
npm run build           # type-check + production build
```
