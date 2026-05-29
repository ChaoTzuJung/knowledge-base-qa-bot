# Plan: Conversation Memory

## Context

The README lists "Conversation Memory" as a stretch goal:

> Add short conversation memory for follow-up questions. Memory should help interpret the
> query, but it must not override retrieved sources or citation requirements.

The repo implements the core `/index` + `/chat` + `/chat/stream` flow and several other
stretch goals (streaming, browser UI, compare), but follow-up questions are **not** handled.
The web client already POSTs the full conversation `messages` array to `/chat/stream`
(`apps/web/src/runtime.ts:13`), yet the server's `extractQuery()`
(`apps/server/src/routes/chatStream.ts:43`) keeps **only the last user message** and discards
all prior turns. So a follow-up like "How do I start **one**?" loses the antecedent and
retrieves poorly.

The infrastructure to carry history is already in place — no session store is needed. The
conversation is held client-side by assistant-ui and re-sent on every request.

### Decisions (confirmed with user)
- **Approach: query rewriting (contextualization).** Use the recent turns to rewrite the
  follow-up into a standalone question, then retrieve with the rewritten query. Answer
  generation still grounds **only** on retrieved context and keeps the citation rules — memory
  influences *what we search for*, never *what the answer is based on*. This is the
  README-aligned reading ("help interpret the query… must not override sources").
- **Scope: `/chat/stream` only.** That is the endpoint the web app actually uses. `/chat`
  (one-shot curl) and `/compare` are left unchanged.
- **Transparency: show the rewritten query in the UI** via a stream data part, so the
  interpreted question is visible (useful for learning/debugging and for e2e assertions).
- **Pure core + thin IO + fail-open**, mirroring `apps/server/src/llm/answer.ts`: the rewrite
  is a small non-streaming LLM call; on the first turn (no history) or on any error it returns
  the original question unchanged, so chat never breaks.

## What gets built

### 1. EDIT — `apps/server/src/llm/prompts.ts`
Add `CONTEXTUALIZE_SYSTEM_PROMPT`. Rules: resolve pronouns / implicit references
(it / that / one / "the previous…") using the chat history and rewrite into a standalone
question; if it is already standalone, return it **unchanged**; output **only** the rewritten
question (no preamble, quotes, or explanation); do not answer it; do not add information not
implied by the history.

### 2. NEW FILE — `apps/server/src/llm/contextualize.ts`
- `export interface Turn { role: "user" | "assistant"; text: string }`
- `contextualizeQuery(history: Turn[], question: string): Promise<string>`
  - `history.length === 0` → return `question` (skip the LLM call on the first turn).
  - Keep only `history.slice(-6)` ("short" memory ≈ last 3 turns); render as
    `User: …\nAssistant: …` transcript.
  - Call OpenAI via `getOpenAI()` + `OPENAI_MODEL`, `temperature: 0`, system =
    `CONTEXTUALIZE_SYSTEM_PROMPT`, user = transcript + follow-up + `Standalone question:`.
  - Return the trimmed completion if non-empty, else `question`. Wrap in `try/catch` and
    return `question` on error (**fail open**).
  - Mirrors the shape of `apps/server/src/llm/answer.ts` (same client + model, non-streaming).

### 3. EDIT — `apps/server/src/routes/chatStream.ts`
- Add `extractHistory(body): Turn[]` — convert `body.messages` to ordered turns **excluding
  the final user message** (the current question): find the last `role === "user"` index,
  `messages.slice(0, idx)`, map each via the existing `partText()` helper (line 37), drop
  empties.
- In the handler (lines 72–77), insert the memory step before retrieval:
  ```ts
  const question = extractQuery(body);
  if (!question) return c.json({ error: "Empty query" }, 400);
  const history = extractHistory(body);
  const query = await contextualizeQuery(history, question);   // ← memory lives here
  const retrieved = await retrieve(query, strategy);
  ```
- In `execute`, after the existing `data-sources` write, emit the rewrite when it changed:
  ```ts
  if (query !== question) {
    writer.write({ type: "data-rewrite", id: "rewrite",
      data: { original: question, rewritten: query } });
  }
  ```
  A server `data-<name>` part arrives on the client as `{ type:"data", name:"<name>", data }`,
  same convention `SourcesPanel.tsx:31` relies on for `data-sources`.

### 4. EDIT — `@kb/shared` (same module that exports `SourcesPayload`)
Add and export `export interface RewritePayload { original: string; rewritten: string }`.
`apps/server/src/lib/types.ts` already re-exports `@kb/shared`, and the web app imports from
it directly.

### 5. NEW FILE — `apps/web/src/components/InterpretedQuery.tsx`
Mirror `SourcesPanel.tsx`'s `latestSources` helper: scan the latest assistant message for a
part where `part.type === "data" && part.name === "rewrite"`, typed as `RewritePayload`.
Render a small muted line `Interpreted as: <rewritten>`; render nothing when absent. Add
`data-testid="interpreted-query"` (per preference: e2e targets data-testid, not fragile text).

### 6. EDIT — `apps/web/src/App.tsx`
Mount `<InterpretedQuery />` near the thread / above `SourcesPanel`.

### 7. NEW FILE — `apps/e2e/tests/chat-followup/followup-resolves-pronoun-via-memory.spec.ts`
Multi-turn scenario: build index → ask "How long do refunds take?" and wait for the citation
→ ask follow-up "How do I start one?" → assert `getByTestId("interpreted-query")` text
contains "refund" and the answer / sources point at `refund_policy.md`.

### 8. EDIT (optional) — `apps/e2e/specs/qa-bot.plan.md`
Document the new multi-turn scenario alongside the existing 6.

## Reused, not rewritten
- OpenAI client + model — `getOpenAI()` / `OPENAI_MODEL` (`apps/server/src/llm/answer.ts`,
  `apps/server/src/llm/client.ts`, `apps/server/src/env.ts`).
- `partText()` text extraction — `apps/server/src/routes/chatStream.ts:37`.
- `retrieve()` retrieval + prompt build — `apps/server/src/strategies/query.ts` (unchanged;
  it just receives the rewritten query).
- Stream data-part convention + client consumer pattern — `SourcesPanel.tsx`
  (`latestSources`, `part.type === "data" && part.name === …`).
- Shared payload types live in `@kb/shared` next to `SourcesPayload`.

## Verification
1. `POST /index`, then a multi-turn `curl` to `/chat/stream`:
   ```bash
   curl -s localhost:8000/chat/stream -H 'content-type: application/json' -d '{
     "strategy":"markdown_kb",
     "messages":[
       {"role":"user","parts":[{"type":"text","text":"How long do refunds take?"}]},
       {"role":"assistant","parts":[{"type":"text","text":"Refunds take 5-7 business days [refund_policy.md#refund-timeline]."}]},
       {"role":"user","parts":[{"type":"text","text":"How do I start one?"}]}
     ]
   }'
   ```
   Expect a `data-rewrite` part whose `rewritten` is roughly "How do I start a refund?", and
   sources/answer about the refund process — not a generic fallback.
2. Run the new e2e: the follow-up resolves via memory and `interpreted-query` is visible.
3. The existing 6 single-turn tests (incl. the exact out-of-scope
   "I cannot confirm from the knowledge base.") stay green — turn 1 has `history.length === 0`,
   so behavior is identical to today.
4. `npm run build` still passes (new files are typed).

## Notes / cost
- Each follow-up adds one small LLM call (skipped on turn 1); requires `OPENAI_API_KEY`.
- Rewrite failures fail open to the original question, so chat is never blocked by this step.
