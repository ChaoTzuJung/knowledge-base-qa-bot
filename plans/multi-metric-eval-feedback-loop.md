# Plan: Multi-metric Eval + Feedback→Test Loop

> Status: ④a (answer-level eval) IMPLEMENTED in this PR. ④b (feedback→test loop, web UI)
> NOT started. Last of the peer-learned features (source: gary9630). Shipped as two PRs —
> ④a server-only here; ④b (web UI + e2e) separately.

## Context

The current eval (`apps/server/src/eval/paraphrase.ts`) measures only **retrieval** —
hit@1 / hit@3 of `markdown_kb` vs `vector_rag` over paraphrases. It never inspects the
*answer*: whether the LLM actually **cited** the right source, whether it **hallucinated** a
citation, or whether it correctly **refused** an unanswerable question. gary9630's project
keeps these as distinct metrics and feeds real production misses back into the eval set.
Adopting both gives a quality signal the retrieval-only eval can't see, and a loop that grows
the regression corpus from real usage.

### Decisions (to confirm with user before ④b)
- **④a is server/eval-only** and low-risk; **④b** adds a `/feedback` route, a `.kb/feedback/`
  store, and a thumbs UI in the web app (so it gets its own PR + e2e).
- **Citation/decision metrics, not LLM-as-judge** — deterministic and cheap.
- For ④b's web work: **consult the `assistant-ui` / `primitives` skills + installed source
  first** (don't go from memory), and add **`data-testid`** hooks for e2e (project preference).

## ④a — Multi-metric eval

Run the **full** pipeline (`answerQuery(query, strategy, { verify: true })`), not just
`retrieve()`, and score each case on independent axes.

### Metrics (per case, pure functions)
- `retrieval_recall` — expected section(s) ∈ retrieved sources.
- `top1_hit` — expected == top retrieved source (kept from today's eval).
- `citation_recall` — |expected ∩ **cited-in-answer**| / |expected|.
- `citation_precision` — |**cited** ∩ retrieved| / |cited| (catches hallucinated citations
  the retrieval metric is blind to).
- `decision_match` — for `expected_decision: "cannot_confirm"` cases the system must return
  the refusal sentinel; for `"answer"` cases it must produce a grounded answer.
- `answer_grounded` — the existing `grounding.grounded` verdict.

### What gets built
1. **NEW — `apps/server/src/eval/metrics.ts`**: `extractCitations(answer)` (reuse the
   `CITATION_RE` pattern in `llm/safety.ts` / `markdown-kb/answer-filing.ts`) and pure
   `computeCaseMetrics({ expected, retrieved, cited, decision, grounding })`. Unit-tested.
2. **NEW — `apps/server/src/eval/cases.ts`**: typed cases
   `{ intent, paraphrases[], expected: string[], expected_decision }`, seeded from today's
   `PROBES` plus new `cannot_confirm` cases (e.g. "What is the CEO's salary?").
3. **NEW — `apps/server/src/eval/answer-eval.ts`**: driver that runs cases through
   `answerQuery`, computes metrics, prints a per-case table + macro-averaged summary. Needs
   `OPENAI_API_KEY`. Reuses the index-bootstrap block from `paraphrase.ts`.
4. **EDIT — `apps/server/package.json`**: `"eval:answer": "tsx src/eval/answer-eval.ts"`
   (keep the fast, key-free retrieval `eval`).
5. **EDIT — READMEs**: document `eval:answer` next to the Paraphrase eval section (mirror
   EN + zh-TW; re-verify the zh-TW anchor slug).

## ④b — Feedback → eval-case loop

Let a user rate an assistant answer; turn 👎 (with a corrected expected source) into a new
eval case, closing production → regression.

### What gets built
1. **NEW — `apps/server/src/routes/feedback.ts`**: `POST /feedback`
   `{ query, answer, sources, rating: "up"|"down", expected_source? }` → append to
   `.kb/feedback/feedback.jsonl` (best-effort; never breaks the response). Mount in `app.ts`.
2. **NEW — `apps/server/src/scripts/eval-from-feedback.ts`** + `"eval:from-feedback"`:
   read 👎 feedback that has an `expected_source`, convert each into a `cases.ts`-shaped entry,
   append to a tracked `apps/server/src/eval/cases.gen.json` (deduped by query) that
   `answer-eval.ts` loads alongside the curated cases.
3. **EDIT — `apps/web`**: thumbs up/down on assistant messages POSTing to `/feedback`
   (assistant-ui action affordance; add `data-testid`s).
4. **NEW — `apps/e2e`**: thumbs-down → feedback persisted / endpoint called.
5. **EDIT — `packages/shared`**: a `Feedback` type if the web needs it for Hono RPC typing.

## Reused, not rewritten
- `answerQuery` (`apps/server/src/strategies/query.ts`), `GroundingVerdict`, the index
  bootstrap from `paraphrase.ts`, the `CITATION_RE` citation pattern. No re-embedding — go
  through the same pipeline the server uses.

## Verification
1. **Unit + types**: `metrics.test.ts` (precision/recall math, decision-match, extraction);
   server suite green, `tsc --noEmit` clean.
2. **④a e2e** (real key): `npm run eval:answer` — citation precision < 1 only when the answer
   cites something unexpected; `cannot_confirm` cases score `decision_match` ✅.
3. **④b e2e**: `POST /feedback` a 👎 with `expected_source` → `feedback.jsonl` grows →
   `npm run eval:from-feedback` → `cases.gen.json` gains the case → `eval:answer` includes it.
   Web: click thumbs-down, assert the network call; Playwright suite green.
4. **No-regression**: the existing retrieval `npm run eval` is untouched; chat behavior
   unchanged when no feedback is given.

## Out of scope
- Running the eval in CI (possible follow-up once `eval:answer` is stable).
- LLM-as-judge answer-text quality scoring.
