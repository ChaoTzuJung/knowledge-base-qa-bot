# Plan: Answer Filing

## Context

The README lists "Answer Filing" as a stretch goal:

> Write useful Q&A results back into `wiki/` after review. Keep filed answers source-grounded
> and preserve citations back to the original Markdown sections.

The repo already has Wiki Index Generation (`wiki/index.md` from `.kb/index.json`) but no way
to persist an answered question. This adds that: after a human reviews a `/chat` answer, the
client POSTs the approved result back and the server writes a source-grounded Markdown file
into `wiki/answers/`, plus a regenerated `wiki/answers/index.md` so filed answers are
browsable without calling the API.

Facts from exploration:
- A chat result is `ChatResult = { answer, sources }` (`packages/shared/src/index.ts`).
  `SourceInfo = { source, heading, score, content }`, where `source` is `<file>#<slug>` and
  `heading` is the `>`-joined breadcrumb.
- The LLM answer already contains **inline citations** `[<file>.md#<slug>]` (enforced by
  `SYSTEM_PROMPT` in `apps/server/src/llm/prompts.ts`). Preserving citations = rewriting those
  bare tokens into links back to `docs/<file>#<slug>`.
- `slugify()` is exported from `strategies/markdown-kb/parser.ts` (already reused by
  `scripts/import-raw.ts`).
- Routes are chained on one Hono app (`apps/server/src/app.ts`) exporting `AppType`; adding a
  route extends the typed RPC client automatically.

### Decisions (confirmed with user)
- **Trigger:** `POST /file-answer` accepts the already-reviewed payload
  `{ query, answer, sources, strategy? }` and writes it verbatim — faithful to "after review",
  no re-run of retrieval or the LLM.
- **Discoverability:** every file operation regenerates `wiki/answers/index.md` listing all
  filed answers; the answers directory is the source of truth (survives manual deletes).
- **Pure core + thin IO**, mirroring `wiki.ts` / `scripts/import-raw.ts`.

## What gets built

### 1. EDIT — `apps/server/src/lib/paths.ts`
Add `WIKI_ANSWERS_DIR = path.join(WIKI_DIR, "answers")` and
`WIKI_ANSWERS_INDEX_PATH = path.join(WIKI_ANSWERS_DIR, "index.md")`.

### 2. NEW FILE — `apps/server/src/strategies/markdown-kb/answer-filing.ts`
Co-located with `wiki.ts` (shares the `<file>#<slug>` → `docs/...` anchor convention).
- `answerSlug(query): string` — `slugify(query)`, fallback `"answer"`.
- `renderFiledAnswer({ query, answer, sources, strategy, filedAt }): string` — **pure**.
  Front matter (`question` JSON-encoded so quotes/colons are safe, plus `strategy`, `filed_at`,
  `slug`), then `# <query>`, then the answer body with inline `[<file>.md#<slug>]` tokens (not
  already a link) rewritten to `[<file>.md#<slug>](../../docs/<file>.md#<slug>)` (`../../`
  because the file lives at `wiki/answers/<slug>.md`), then a `## Sources` list
  `- [<heading>](../../docs/<file>#<anchor>) — score <score>` (`_No sources cited._` if empty).
- `renderAnswersIndex(entries): string` — **pure**. `# Filed Answers`, generated-note comment,
  count, bullets `- [<question>](<slug>.md) — <strategy>, filed <date>` sorted by `filed_at` desc.
- `fileAnswer(input): { slug, file }` — `mkdirSync(WIKI_ANSWERS_DIR)`, write
  `wiki/answers/<slug>.md`, then `regenerateAnswersIndex()`. Returns repo-relative `file`.
- `regenerateAnswersIndex(): void` — read `WIKI_ANSWERS_DIR`, parse each `*.md` (skip
  `index.md`) front matter, write `WIKI_ANSWERS_INDEX_PATH` via `renderAnswersIndex`.

### 3. NEW FILE — `apps/server/src/routes/fileAnswer.ts`
`POST /file-answer` with `@hono/zod-validator`, mirroring `routes/chat.ts`:
```ts
const FileAnswerBody = z.object({
  query: z.string().min(1),
  answer: z.string().min(1),
  sources: z.array(z.object({
    source: z.string(), heading: z.string(), score: z.number(), content: z.string(),
  })).default([]),
  strategy: z.enum(["markdown_kb", "vector_rag"]).optional(),
});
```
Handler: `fileAnswer({ ...body, strategy: body.strategy ?? "markdown_kb", filedAt: new Date().toISOString() })`, return `{ filed: true, slug, file }`.

### 4. EDIT — `apps/server/src/app.ts`
Import `fileAnswerRoute`, add `.route("/", fileAnswerRoute)` to the chain (extends `AppType`).

### 5. NEW FILE — `apps/server/src/strategies/markdown-kb/answer-filing.test.ts`
`node:test`, covering the pure functions: front matter keys, `# <query>` heading, inline
citation → `../../docs/...` link (and no double-wrap when already a link), Sources list +
empty fallback, `answerSlug` slugify + fallback, `renderAnswersIndex` links/sort/empty.

### 6. EDIT — `README.md` + `README.zh-TW.md`
"Answer filing" subsection under §1 with a curl example (chat → review → file-answer); add
`POST /file-answer` to the API surface table; note `wiki/answers/` in the repo-layout tree;
mention `answer-filing.test.ts` in §2 Tests.

## Reused, not rewritten
- `SourceInfo` / `Strategy` / `ChatResult` — `packages/shared/src/index.ts`
- `slugify()` — `apps/server/src/strategies/markdown-kb/parser.ts`
- `WIKI_DIR` + new `WIKI_ANSWERS_*` — `apps/server/src/lib/paths.ts`
- Route + zod-validator shape — `routes/chat.ts`; chained `AppType` wiring — `app.ts`
- Inline-citation format `[<file>.md#<slug>]` — `apps/server/src/llm/prompts.ts`

## Verification
1. `cd apps/server && npm test` (or root `npm run test:unit`) — answer-filing tests pass.
2. `npm run build` typechecks (route extends `AppType` cleanly).
3. End-to-end: start server, `POST /build-index`, `POST /chat` for "How long do refunds take?",
   then `POST /file-answer` with its `{query, answer, sources}`. Confirm
   `wiki/answers/how-long-do-refunds-take.md` (front matter correct, inline citations now
   `../../docs/refund_policy.md#refund-timeline` links, Sources list present) and that
   `wiki/answers/index.md` lists it. File a second answer → index lists both, newest first.

## Notes
- `wiki/` is gitignored, so filed answers stay local (consistent with `wiki/index.md`).
- The endpoint trusts the reviewed payload by design — it persists exactly what the human
  approved.
