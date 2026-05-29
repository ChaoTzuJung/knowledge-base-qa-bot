# Plan: `raw/` Multi-Format Import Script

## Context

The README documents a "Multi-Format Import" extension idea — a pipeline
`raw/*.txt | raw/*.html → docs/*.md → POST /index → retrieval index` — but it
was never implemented. Today both indexers (`markdown-kb/indexer.ts`,
`vector-rag/indexer.ts`) only read `docs/*.md`, and `docs/` must be populated by
hand.

This change adds the **conversion step only**: a small, dependency-free script
that normalizes `raw/*.txt` and `raw/*.html` into clean `docs/*.md`, preserving
the source filename in YAML front matter. Reindexing stays the job of the
existing `POST /build-index` endpoint (which already rebuilds BM25 **and** the
vector index), keeping the script single-purpose and free of any OpenAI/network
dependency.

Decisions confirmed with the user:
- **Script only converts; it does NOT rebuild the index.** User runs
  `POST /build-index` (or clicks *Build Index* in the web UI) afterward.
- **HTML→Markdown is a zero-dependency, minimal regex converter** — matches the
  README's "teach normalization, not parser edge cases" intent. No new deps.

## Key constraints discovered

- `parser.ts:parseMarkdown` **ignores every line before the first heading**
  (`currentHeading === null` → lines skipped). So:
  - YAML front matter at the top of the file is safe — it will never pollute the
    index.
  - **Every converted doc MUST contain at least one `#` heading**, or
    `buildIndex()` produces zero sections for it. For inputs with no detectable
    heading (most `.txt`), the script derives an `# H1` from the filename.
- Existing `docs/*.md` are clean Markdown with no front matter; the citation
  `file` field is just the filename, so provenance already works — front matter
  `source:` only adds the *original raw* filename for traceability.
- Repo runs TypeScript via `tsx` (see `dev` scripts); no build step needed to
  run a script.
- `slugify()` already exists in `parser.ts` and will be reused for output
  filenames.

## Changes

### 1. `apps/server/src/lib/paths.ts`
Add one export next to `DOCS_DIR`:
```ts
export const RAW_DIR = path.join(ROOT, "raw");
```

### 2. New: `apps/server/src/scripts/import-raw.ts`
A `tsx`-runnable script. Behavior:

- If `RAW_DIR` doesn't exist or is empty → print a friendly hint and exit 0.
- Read `raw/*.txt` and `raw/*.html` (case-insensitive ext match), sorted.
- For each file:
  - **`.txt`** → keep text as-is (Markdown treats plain text as paragraphs);
    split into paragraphs on blank lines. No headings detected.
  - **`.html`** → minimal regex normalization (no library):
    - `<h1..h6>…</h1..6>` → `#`..`######` + text
    - `<li>…</li>` → `- text`
    - `<br>` → newline; `</p>`,`</div>` → paragraph break
    - strip all remaining tags
    - decode basic entities: `&amp; &lt; &gt; &quot; &#39; &nbsp;`
    - collapse 3+ blank lines to 1
  - If the converted body has **no `#` heading**, prepend `# <Title>` where
    `<Title>` is the title-cased base filename (guarantees the doc is indexable).
  - Prepend YAML front matter:
    ```
    ---
    source: <original raw filename>
    title: <derived title>
    ---
    ```
  - Output path: `docs/<slugify(basename)>.md` (reuse `slugify` from
    `parser.ts`).
  - **Skip if the target `docs/*.md` already exists**, unless `--force` is
    passed (protects hand-edited canonical copies). Log skipped/written/created.
- Print a summary and the next step: *"Converted N file(s). Run
  `POST /build-index` (or click Build Index in the web UI) to rebuild the
  retrieval index."*

CLI flags: `--force` (overwrite existing docs).

### 3. npm scripts
- `apps/server/package.json` → `"import:raw": "tsx src/scripts/import-raw.ts"`
- root `package.json` → `"import:raw": "npm --workspace apps/server run import:raw"`

### 4. (Optional, for testability) sample raw inputs
Add `raw/example_policy.html` and `raw/quick_notes.txt` so the pipeline is
demonstrable out of the box. `raw/` is not gitignored. Skip if you'd rather keep
the repo clean.

## Out of scope
- No reindexing inside the script (delegated to `POST /build-index`).
- No PDF/spreadsheet/Markdown-in-`raw/` handling (README explicitly defers these).
- README documentation update is external-visible English → handle separately
  via the `polish-english` skill if desired.

## Verification

1. Create sample inputs (or use the optional step 4):
   ```
   raw/quick_notes.txt   (a few plain-text lines, no heading)
   raw/example_policy.html  (with <h1>/<h2>/<p>/<li>)
   ```
2. Run `npm run import:raw` from repo root.
   - Confirm `docs/quick-notes.md` and `docs/example-policy.md` exist.
   - Confirm each has front matter (`source:` = original filename) and at least
     one `#` heading; `.txt` output has a filename-derived H1.
   - Re-run → both reported as "skipped (exists)"; `--force` overwrites.
3. Rebuild + smoke-test retrieval:
   - `npm run dev:server`
   - `curl -X POST localhost:8000/build-index` → `files_indexed` count includes
     the new docs (port from `env.ts` `PORT`, default `8000`).
   - Ask a question whose answer lives only in a converted doc via `/chat`;
     confirm it answers and cites the new `docs/*.md` filename.
4. Type-check: `npm --workspace apps/server run build` succeeds (script compiles
   cleanly under `rootDir: src`).
