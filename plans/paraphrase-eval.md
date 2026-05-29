# Plan: Paraphrase Comparison Eval (minimal CLI)

## Context

The README lists "Paraphrase Comparison" as a stretch goal:

> Create a small set of paraphrased queries and compare Markdown KB vs Vector RAG.
> Look for cases where BM25 misses synonyms and cases where vector search retrieves
> semantically related but wrong chunks.

The repo currently has no eval/benchmark code. The existing `/compare` route only runs
the *same* query through both strategies (full LLM answer) — it does **not** test
paraphrase robustness, and it doesn't score retrieval against an expected target.

This plan adds the missing piece as the **smallest possible change**: a self-contained
CLI eval that runs a curated set of paraphrased queries through both strategies'
*retrieval* layer and prints where each strategy hits or misses the expected section.

### Decisions (chosen for minimal change, per user preference)
- **Curated probe set**, not LLM-generated paraphrases → deterministic, no new LLM code,
  reliably demonstrates the synonym-miss / wrong-chunk phenomena the README wants.
- **Retrieval-only** → reuse the existing `retrieve()` (`apps/server/src/strategies/query.ts:26`);
  no answer generation, so it's fast and cheap. (Vector side still embeds the query via
  OpenAI — unavoidable — so `OPENAI_API_KEY` is needed for the vector column; BM25 needs none.)
- **Standalone CLI script**, not a new endpoint/web mode → touches none of the app surface
  (no route, no `AppType`, no React, no shared types). Just one new file + npm scripts.

## What gets built

### 1. NEW FILE — `apps/server/src/eval/paraphrase.ts`

A runnable `tsx` script with three parts:

**(a) Curated probes** — a `Probe[]` array. Each probe = one intent, the `expected`
source id, and 3 paraphrases (the first keyword-friendly, the rest synonym-heavy to
expose BM25 gaps / vector wrong-chunks). Source ids follow the parser format
`file#slugify(heading)` (`apps/server/src/strategies/markdown-kb/parser.ts:40`).
Grounded in the 12 real sections of `docs/`:

```ts
interface Probe { intent: string; expected: string; paraphrases: string[]; }

const PROBES: Probe[] = [
  { intent: "refund timing", expected: "refund_policy.md#refund-timeline",
    paraphrases: [
      "How long do refunds take?",            // BM25-friendly: has "refund"
      "When will I get my money back?",        // synonym BM25 likely misses
      "time until reimbursement is processed", // synonym
    ] },
  { intent: "cancel an order", expected: "refund_policy.md#cancellation-window",
    paraphrases: [
      "How do I cancel my order?",
      "Can I call off a purchase I just made?",
      "stop an order before it ships",
    ] },
  { intent: "expedited shipping speed", expected: "shipping_faq.md#expedited-shipping",
    paraphrases: [
      "How fast is expedited shipping?",
      "express delivery turnaround time",      // "express" != "expedited" -> BM25 gap
      "quickest way to receive my package",
    ] },
  { intent: "change email", expected: "account_help.md#change-email-address",
    paraphrases: [
      "How do I change my email address?",
      "update the address you send mail to",   // vector may grab shipping "address" -> wrong chunk
      "switch my login email",
    ] },
  { intent: "reset password", expected: "account_help.md#reset-password",
    paraphrases: [
      "How do I reset my password?",
      "I forgot my login credentials",
      "recover access to my account",          // vector may drift to delete/manage account
    ] },
];
```

**(b) Runner** — bootstrap the index exactly like the server does
(`apps/server/src/index.ts:4-18`): call `loadIndexJson()`
(`strategies/markdown-kb/indexer.ts`) and `loadVectorIndex()`
(`strategies/vector-rag/indexer.ts`) in try/catch. Then for every paraphrase call
`retrieve(p, "markdown_kb")` and `retrieve(p, "vector_rag")` (reused from
`strategies/query.ts`). For each result derive a cell:
- `notIndexed` → `"no-index"`
- `!ok` / empty → `"miss (cannot confirm)"`
- else compare expected against returned sources, stripping any `::part-N` chunk suffix:
  `src.source.split("::")[0] === expected`. Record **hit@1** (top source matches),
  **hit@3** (expected anywhere in top-3), the **top source id**, and its **score**.
- Wrap the vector call in try/catch so a missing `OPENAI_API_KEY` or API error degrades
  to `"error"` for that cell and the BM25 column still prints.

**(c) Output** — print per intent a small table (paraphrase × {BM25, Vector}) with a
`✅/❌` badge, the top source id, and score; then a summary line per strategy
(`hit@1` and `hit@3` counts out of total paraphrases). End with `process.exit(0)`.
Plain `console.log` + `padEnd` columns — no new deps.

### 2. EDIT — `apps/server/package.json`
Add to `scripts`: `"eval": "tsx src/eval/paraphrase.ts"` (tsx is already used by `dev`).

### 3. EDIT — `package.json` (root)
Add passthrough: `"eval": "npm --workspace apps/server run eval"` (mirrors the existing
`dev:server` / `dev:web` passthrough style).

## Files NOT touched (kept minimal)
`app.ts`, all of `routes/`, `apps/web/**`, `packages/shared/**`, e2e tests. No new
dependencies. No change to the running server or its API surface.

## Reused, not rewritten
- `retrieve(query, strategy)` — `apps/server/src/strategies/query.ts:26` (retrieval w/o LLM)
- `loadIndexJson()` / `loadVectorIndex()` — same bootstrap as `index.ts:4-18`
- Source-id format from `parser.ts:40` (`file#slugify(heading)`) for `expected` matching
- `SourceInfo` shape (`source`, `heading`, `score`, `content`) for reading results

## Verification

1. Build/load index once (writes `.kb/`): start the server (`npm run dev:server`) and
   `curl -X POST localhost:8000/build-index`, **or** ensure `.kb/` already exists.
2. `export OPENAI_API_KEY=sk-...` (needed for the vector column's query embedding).
3. Run `npm run eval` (or `npm --workspace apps/server run eval`).
4. Confirm the output shows, for at least one intent, a divergence such as:
   - BM25 `❌` on a synonym paraphrase ("money back", "express delivery") where Vector `✅`;
   - and/or Vector returning a semantically-related-but-wrong section on
     "update the address you send mail to" / "recover access to my account".
5. Confirm the summary prints `hit@1` / `hit@3` totals for both strategies.
6. Sanity: with `OPENAI_API_KEY` unset, the script still runs and prints the BM25 column,
   with the Vector column showing `error` (graceful degradation).
7. `npm run build` (workspace `apps/server` `tsc`) still passes — the new file is typed.
