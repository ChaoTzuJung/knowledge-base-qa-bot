# Plan: Wiki Index Generation

## Context

The README lists "Wiki Index Generation" as a stretch goal:

> Generate `wiki/index.md` from `.kb/index.json` so humans and agents can browse the
> available topics without calling the API.

The repo implements the core `/build-index` + `/chat` flow and several other stretch goals
(streaming, browser UI, multi-format import, paraphrase eval), but there is no `wiki/`
directory and no code references it.

The Markdown KB index already holds everything needed. Each persisted section
(`apps/server/src/lib/types.ts`) has `id` (`<file>#<slug>`), `file`, `heading`, and
`heading_path`. We render those into a browsable, hierarchical `wiki/index.md` that links
back to the source docs.

### Decisions (confirmed with user)
- **Trigger:** generate automatically inside `buildIndex()` so every `POST /build-index`
  refreshes the wiki, **and** ship a standalone `npm run generate:wiki` script that
  regenerates from the existing `.kb/index.json` without rebuilding.
- **Pure core + thin IO**, mirroring `scripts/import-raw.ts`: a pure `generateWikiIndex()`
  returns the Markdown string (unit-testable), a thin `writeWikiIndex()` does the file write.

## What gets built

### 1. EDIT — `apps/server/src/lib/paths.ts`
Add `WIKI_DIR = path.join(ROOT, "wiki")` and `WIKI_INDEX_PATH = path.join(WIKI_DIR, "index.md")`.

### 2. NEW FILE — `apps/server/src/strategies/markdown-kb/wiki.ts`
- `generateWikiIndex(sections: Section[]): string` — **pure**. Group sections by `file`
  (first-seen order; `buildIndex` already sorts by filename then doc order). Per file emit a
  `## <file>` heading then a bullet list, each bullet indented by `heading_path.length - 1`
  levels (2 spaces/level) to reflect hierarchy. Link text = `heading`; target =
  `../docs/<file>#<anchor>` where `<anchor>` is the slug portion of `section.id`. Header has an
  H1 title, a "generated — do not edit" comment, and a `**N documents · M sections**` summary.
  Empty `sections` → header + `_No documents indexed yet._`.
- `writeWikiIndex(sections): void` — `mkdirSync(WIKI_DIR, …)` then write `WIKI_INDEX_PATH`.

### 3. EDIT — `apps/server/src/strategies/markdown-kb/indexer.ts`
Import `writeWikiIndex`; call `writeWikiIndex(state.sections)` after each `writeIndexJson()`
in `buildIndex()` (both the no-`docs/` early-return branch and the normal branch), so the wiki
always tracks the JSON index, including when empty.

### 4. NEW FILE — `apps/server/src/scripts/generate-wiki.ts`
Mirror `scripts/import-raw.ts`: read `INDEX_PATH`; if missing, print a hint to run
`POST /build-index` first and return. Otherwise `JSON.parse` into `PersistedIndex`, call
`writeWikiIndex(payload.sections)`, log counts + output path. Guard `main()` with
`if (process.argv[1] === fileURLToPath(import.meta.url))` so tests can import it.

### 5. EDIT — `apps/server/package.json` and root `package.json`
- Server: add `"generate:wiki": "tsx src/scripts/generate-wiki.ts"`.
- Root: add passthrough `"generate:wiki": "npm --workspace apps/server run generate:wiki"`.

### 6. NEW FILE — `apps/server/src/strategies/markdown-kb/wiki.test.ts`
`node:test` (matches `test:unit`). Cover `generateWikiIndex`: multi-file grouping, hierarchy
nesting by `heading_path`, relative `../docs/<file>#<anchor>` links matching the id slug, and
the empty-sections fallback.

### 7. EDIT — `README.md` (+ `README.zh-TW.md`)
Document the feature: a "Wiki index" subsection under §1, the `generate:wiki` script in the
Scripts list, the `wiki/` entry in the repo-layout tree, and the wiki test in §2 Tests.

## Reused, not rewritten
- `Section` / `PersistedIndex` types — `apps/server/src/lib/types.ts`
- `INDEX_PATH` and the new `WIKI_*` paths — `apps/server/src/lib/paths.ts`
- `state.sections` populated by `buildIndex()` — `strategies/markdown-kb/indexer.ts`
- Script shape (pure core + `import.meta.url` main guard) — `scripts/import-raw.ts`

## Verification
1. `cd apps/server && npm test` (or root `npm run test:unit`) — wiki unit tests pass.
2. `npm run generate:wiki` → inspect `wiki/index.md`: one `##` per doc in `docs/`, nested
   bullets, working `../docs/<file>#<slug>` links, summary `5 documents · 17 sections`.
3. Start the server, `curl -XPOST localhost:8000/build-index`, confirm `wiki/index.md` is
   (re)written to match the current `docs/`.
4. `npm run build` still passes (the new files are typed).

## Note
`.kb/` is gitignored; `wiki/index.md` is left **tracked** so it doubles as a reviewable,
human-browsable snapshot. Add `wiki/` to `.gitignore` later if generated output shouldn't be
committed.
