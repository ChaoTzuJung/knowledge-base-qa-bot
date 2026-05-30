# Plan: Dream Memory Consolidation (self-improving retrieval)

## Context

Learned from a peer project (coastk05396's `/api/memory/dream`) — the one genuinely
novel pattern across the surveyed repos: a **self-improving retrieval loop**. Today every
answer is recomputed from scratch, and a frequently-asked question depends on retrieval
landing on the right section *every time*. The loop closes that gap: log each answered
turn (tagged with the existing grounding verdict), periodically cluster the **repeated,
grounded** questions, distill each cluster into one canonical Q&A, and promote it into the
indexed KB — so the next occurrence hits a first-class retrievable section. Frequently-asked,
vetted answers literally become part of the corpus.

### Decisions (confirmed with user)
- **Trigger: manual `POST /dream`** (+ `npm run dream`), not automatic. Safe, predictable,
  no surprise background KB mutations.
- **Output: `docs/_consolidated.md`**, tagged `source_type: faq`, so `buildIndex` picks it up
  as first-class KB and the source-authority weighting ranks it appropriately.
- **Scope: the full loop in one PR** — log → cluster → distill → write → reindex.
- **Pure core + fail-open everywhere**, mirroring the rest of the server: logging never breaks
  a response; an empty log writes nothing; a distill error skips that cluster only.

## Data flow

```
every answered turn ──logTurn()──▶ .kb/dream/turns.jsonl   (append, fire-and-forget)
                                          │
POST /dream ──▶ read log ─▶ filter VALID ─▶ embed unique Qs (cached) ─▶ union-find
   cluster (cosine ≥ 0.85) ─▶ keep clusters asked ≥ 3× ─▶ skip already-promoted
   ─▶ distill each (1 LLM call) ─▶ upsert into .kb/dream/state.json
   ─▶ render docs/_consolidated.md ─▶ buildIndex() + buildVectorIndex()
   ─▶ report { scanned, valid, clusters, promoted[], skipped[], reindexed }
```

`state.json` (not the doc) is the source of truth; the doc is re-rendered from it each run,
so a re-run with no new clusters promotes nothing and leaves the doc byte-identical.

## What gets built

### 1. NEW FILE — `apps/server/src/dream/log.ts`
- `classifyTurn(answer, sources, grounding): "VALID" | "DEFAULT" | "REJECTED"` (pure).
  REJECTED = a refusal sentinel (`INJECTION_REFUSAL`, `"I cannot confirm…"`, "index has not
  been built") **or** zero sources; DEFAULT = `grounding.grounded === false`; else VALID.
- `logTurn(input)` → append one JSON line to `.kb/dream/turns.jsonl`. Synchronous, wrapped
  in try/catch — logging can never break a chat response. `ts` is passed by the caller.
- `readTurns(): LoggedTurn[]` — parse the JSONL, skipping malformed lines; `[]` when absent.

### 2. NEW FILE — `apps/server/src/dream/cluster.ts` (pure, no IO)
`cosine(a, b)`, a small `UnionFind` (path compression + union by size),
`clusterByCosine(vectors, threshold = 0.85)` → index groups via single-link union-find, and
`selectClusters(groups, minSize = 3)`.

### 3. NEW FILE — `apps/server/src/dream/distill.ts`
`DISTILL_SYSTEM_PROMPT` + `parseDistillation(reply): { question, answer } | null` (pure;
tolerates a ```json fence; returns null on malformed/empty → cluster skipped) and
`distillCluster(pairs)` — one `getOpenAI().chat.completions.create` call (mirrors
`llm/answer.ts`), temp 0, instructed to preserve `[file.md#slug]` citations. Fail-open.

### 4. NEW FILE — `apps/server/src/dream/consolidate.ts`
`runDream(now?)`: read log → filter VALID → embed each VALID question (one vector per turn,
so cluster size = times asked; cached by `hashContent` in `.kb/dream/embeddings.json`, misses
batched into one embeddings call) → `clusterByCosine` → `selectClusters` → for each cluster
whose fingerprint (hash of its sorted distinct questions) is not already in `state.json`,
`distillCluster` the distinct pairs → push a `{fingerprint, slug, question, answer,
occurrences, promoted_at}` entry → render `docs/_consolidated.md` from all entries →
`buildIndex()` + `buildVectorIndex()`. Returns a `DreamReport`. No writes when nothing new.

### 5. NEW FILE — `apps/server/src/routes/dream.ts`
`new Hono().post("/dream", …)` → `runDream()` → JSON report; 500 on unexpected error.

### 6. NEW FILE — `apps/server/src/scripts/run-dream.ts`
`npm run dream`: load the persisted indexes (so the post-consolidation incremental rebuild
reuses unchanged vectors), call `runDream()`, print the report.

### 7. EDIT — `apps/server/src/lib/paths.ts`
Add `DREAM_DIR`, `DREAM_LOG_PATH`, `DREAM_STATE_PATH`, `DREAM_EMBED_CACHE_PATH`,
`CONSOLIDATED_DOC_PATH` (= `docs/_consolidated.md`), `CONSOLIDATED_DOC_FILE`.

### 8. EDIT — `apps/server/src/app.ts`
Mount `dreamRoute` (`.route("/", dreamRoute)`).

### 9. EDIT — `apps/server/src/routes/chat.ts` and `chatStream.ts`
Call `logTurn(...)` on every answer path. In `chat.ts`, after `answerQuery` (verify is on).
In `chatStream.ts`: the injection-refusal early return, the not-indexed and "cannot confirm"
branches (REJECTED), and the success path after the grounding verdict is computed (using the
rewritten standalone `query` and the streamed `fullText`).

### 10. EDIT — `apps/server/package.json`
Add `"dream": "tsx src/scripts/run-dream.ts"`.

### 11. NEW FILES — tests
`dream/cluster.test.ts`, `dream/distill.test.ts`, `dream/log.test.ts` cover the pure logic
(clustering/selection, distill parsing incl. fenced/malformed, status classification).

### 12. EDIT — `README.md` / `README.zh-TW.md`
A Features bullet + an Advanced-usage subsection ("Dream memory consolidation"), mirrored.

## Reused, not rewritten
- `getOpenAI()` (`apps/server/src/llm/client.ts`) — chat **and** embeddings.
- `OPENAI_MODEL` / `OPENAI_EMBEDDING_MODEL` (`apps/server/src/env.ts`); the non-streaming call
  shape from `apps/server/src/llm/answer.ts`.
- `GroundingVerdict` already on `ChatResult.grounding` — `chat.ts` passes `{verify:true}`,
  `chatStream.ts` computes it.
- `hashContent` (`apps/server/src/strategies/vector-rag/incremental.ts`) — embed-cache key.
- `answerSlug` (`apps/server/src/strategies/markdown-kb/answer-filing.ts`) — section slugs.
- `buildIndex` / `buildVectorIndex` — the same calls `/build-index` makes.
- The source-authority weighting (prior PR) ranks the promoted `source_type: faq` doc.

## Verification
1. **Unit + types**: cluster / distill / log suites — full server suite green
   (84 tests), `tsc --noEmit` clean.
2. **Offline cluster probe** (no API): 3 near-duplicate vectors + 1 outlier →
   one 3-member cluster kept, outlier dropped.
3. **End-to-end** (real `OPENAI_API_KEY`), cleaned up afterward:
   - Ask one grounded question 3× → 3 VALID turns.
   - `POST /dream` → `valid 3, clusters 1, promoted 1`, `docs/_consolidated.md` created with
     `## …` + preserved citation, indexes rebuilt (15 → 16 chunks).
   - Re-ask → `_consolidated.md#…` is the **top** retrieved source (loop closed).
   - `POST /dream` again → `promoted: []`, doc byte-identical (idempotent).
4. **No-regression**: with an empty log the loop writes nothing; the existing KB and all
   strategies behave exactly as before.

## Notes / cost
- `POST /dream` costs embeddings for new questions (cached afterward) + one distill call per
  new cluster; requires `OPENAI_API_KEY`. Logging and clustering are free.
- `docs/_consolidated.md` is machine-generated ("do not edit by hand"); once `/dream` runs in
  a real deployment it becomes a tracked KB file.
- Logged queries stay local to `.kb/` (gitignored).
- Clustering is O(n²) pairwise cosine over unique VALID questions — fine at this scale; the
  report logs the scanned count so growth stays visible (no silent cap).

## Out of scope
- Auto/threshold triggering (manual only for now) and a `/dream` UI surface.
- Multi-metric eval / feedback→test loop — the next feature (see
  `plans/multi-metric-eval-feedback-loop.md` once started).
