# Plan: Feedback → eval-case loop (④b)

## Context

Feature ④a added an answer-level eval over a hand-written case set. ④b (the last
peer-learned feature, from gary9630) closes the production→regression loop: a user
rates an answer in the UI, and a 👎 — with the source it *should* have used — becomes
a permanent `answer-eval` case. Real misses grow the eval set from actual usage, not
just hand-authored probes.

### Decisions (confirmed with user)
- **Sidebar `FeedbackPanel`** for the latest answer — mirrors `GroundingBadge` /
  `SourcesPanel` (`useAuiState` + a `latestX(messages)` reader). The app has no
  per-message toolbar, so a sidebar panel is the consistent, low-risk fit.
- **👎 reveals a picker of the retrieved sources** (+ "None — it should have refused")
  to capture `expected_source`, so the loop runs end-to-end from the UI.
- **Single PR** (server + web + e2e).

## What gets built

### Server + shared
- **`packages/shared/src/index.ts`** — `FeedbackInput { rating: "up"|"down"; query;
  answer; sources: SourceInfo[]; expected_source?: string | null }` (`null` = "should
  have refused"). Re-exported from `apps/server/src/lib/types.ts`.
- **`apps/server/src/lib/paths.ts`** — `FEEDBACK_DIR` / `FEEDBACK_LOG_PATH`
  (`.kb/feedback/feedback.jsonl`, gitignored).
- **`apps/server/src/feedback/store.ts`** — `recordFeedback` (best-effort JSONL append,
  mirrors `dream/log.ts`), `readFeedback`, and the **pure** `feedbackToCases`:
  keep `rating === "down"`, dedupe by normalized query (latest wins),
  `expected_source` → an "answer" case expecting that section, `null` →
  a `cannot_confirm` case. 👍 is logged but not turned into a case.
- **`apps/server/src/routes/feedback.ts`** — `POST /feedback`, zod-validated (mirrors
  `routes/fileAnswer.ts`), returns `{ recorded: true }`. Mounted in `app.ts`
  (`.route("/", feedbackRoute)` → auto-extends `AppType` → RPC client).
- **`apps/server/src/eval/cases.ts`** — `loadGeneratedCases()` (reads
  `cases.gen.json` next to the file; `[]` if absent/malformed) + `loadAllCases()`.
  **`answer-eval.ts`** iterates `loadAllCases()` so generated cases score every run.
- **`apps/server/src/eval/cases.gen.json`** — tracked regression corpus, seeded `[]`.
- **`apps/server/src/scripts/eval-from-feedback.ts`** + `"eval:from-feedback"` script.

### Web
- **`apps/web/src/components/FeedbackPanel.tsx`** — sidebar panel. A `latestExchange`
  reader pulls the last assistant message's answer (its `text` parts) + sources (its
  `data-sources` part) and the preceding user query. 👍 / 👎; 👎 → `<select>` of
  source ids + a "should have refused" option → Submit. `data-testid`s:
  `feedback-panel`, `feedback-up`, `feedback-down`, `feedback-expected`,
  `feedback-submit`, `feedback-recorded`.
  - **Gotcha (caught in e2e):** the `useAuiState` selector must return a STABLE
    reference. Returning a freshly-built object each call breaks `useSyncExternalStore`
    snapshot caching and the panel never renders — so it selects the `messages` slice
    and derives the exchange with `useMemo` (the existing panels return `part.data`,
    a stable nested ref).
- **`apps/web/src/lib/api.ts`** — `sendFeedback()` via the typed `client.feedback.$post`.
- **`apps/web/src/App.tsx`** — mount `<FeedbackPanel />` in the `<aside>`.
- **`apps/web/vite.config.ts`** — proxy `/feedback` → :8000.

### e2e
- **`apps/e2e/tests/feedback/thumbs-down-records-feedback.spec.ts`** — ask → 👎 → pick a
  source → submit; intercept `POST /feedback` (assert `rating: "down"` + a concrete
  `expected_source`) then `route.continue()`; assert `feedback-recorded`.

## Reused, not rewritten
- `routes/fileAnswer.ts` (route template), `useAuiState` + `latestX` reader
  (`SourcesPanel`/`GroundingBadge`), the typed Hono `client` (`lib/api.ts`),
  `EvalCase`/`Decision` + the ④a driver, the JSONL append/read shape (`dream/log.ts`),
  and the e2e network-intercept pattern (`index-management`).

## Verification
1. **Unit + types**: `feedback/feedback.test.ts` (`feedbackToCases`) — 94 server tests
   pass; `tsc --noEmit` clean (server + web).
2. **e2e**: the new feedback spec passes; full suite **15/15** green.
3. **Loop end-to-end** (verified): UI 👎 (`expected_source: refund_policy.md#refund-timeline`)
   → `feedback.jsonl` grows → `npm run eval:from-feedback` → `cases.gen.json` gains the
   case → `answer-eval` loads it. The committed corpus is reset to `[]`; the feedback log
   stays local to `.kb/`.
4. **No-regression**: with no feedback, `cases.gen.json` is `[]` and `eval:answer` ==
   ④a behavior; chat is unchanged.

## Out of scope
- 👍 → "lock in good answer" cases (logged only); CI eval; an admin UI for feedback.
