/**
 * Multi-format import: normalize raw/*.txt and raw/*.html into clean docs/*.md.
 *
 * Pipeline: raw/*.txt | raw/*.html -> docs/*.md -> POST /build-index -> index
 *
 * This script ONLY does the conversion step. Rebuilding the retrieval index is
 * delegated to the existing POST /build-index endpoint (or the Build Index
 * button in the web UI), which rebuilds both the BM25 and vector indexes.
 *
 * Usage:
 *   npm run import:raw            # convert, skip docs that already exist
 *   npm run import:raw -- --force # overwrite existing docs/*.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_DIR, RAW_DIR } from "../lib/paths.js";
import { slugify } from "../strategies/markdown-kb/parser.js";

const SUPPORTED_EXT = new Set([".txt", ".html", ".htm"]);
const HEADING_RE = /^#{1,6}\s+\S/m;

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function titleFromFilename(base: string): string {
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Minimal, dependency-free HTML -> Markdown. Not a full parser by design. */
export function htmlToMarkdown(html: string): string {
  let out = html;

  // Drop non-content blocks entirely.
  out = out.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "");

  // Headings: <h1>..<h6> -> #..######
  out = out.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    const hashes = "#".repeat(Number(level));
    return `\n\n${hashes} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`;
  });

  // List items -> "- text"
  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => {
    return `\n- ${inner.replace(/<[^>]+>/g, "").trim()}`;
  });

  // Line breaks and paragraph/section boundaries.
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div|section|article|ul|ol|tr)>/gi, "\n\n");

  // Strip every remaining tag, then decode entities.
  out = out.replace(/<[^>]+>/g, "");
  out = decodeEntities(out);

  // Tidy whitespace: trim each line (source indentation is not meaningful here),
  // then collapse 3+ blank lines to one.
  out = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

/** Plain text passes through as-is (Markdown renders it as paragraphs). */
export function txtToMarkdown(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildFrontMatter(source: string, title: string): string {
  return ["---", `source: ${source}`, `title: ${title}`, "---"].join("\n");
}

/**
 * Convert one raw file's contents into a complete docs/*.md string:
 * pick a converter by extension, guarantee at least one heading, and prepend
 * front matter. Pure — no filesystem access — so it is unit-testable.
 */
export function convertRaw(filename: string, raw: string): string {
  const base = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename).toLowerCase();
  const title = titleFromFilename(base);

  let body = ext === ".txt" ? txtToMarkdown(raw) : htmlToMarkdown(raw);

  // Every doc needs at least one heading, or the indexer skips its content.
  if (!HEADING_RE.test(body)) {
    body = `# ${title}\n\n${body}`;
  }

  return `${buildFrontMatter(filename, title)}\n\n${body}\n`;
}

/** Output filename for a given raw file: docs/<slug>.md */
export function outputName(filename: string): string {
  return `${slugify(path.basename(filename, path.extname(filename)))}.md`;
}

function main(): void {
  const force = process.argv.slice(2).includes("--force");

  if (!fs.existsSync(RAW_DIR)) {
    console.log(`[import-raw] No raw/ directory found at ${RAW_DIR}.`);
    console.log("[import-raw] Create it and drop .txt or .html files in, then re-run.");
    return;
  }

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => SUPPORTED_EXT.has(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.log(`[import-raw] No .txt or .html files in ${RAW_DIR}. Nothing to do.`);
    return;
  }

  fs.mkdirSync(DOCS_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const file of files) {
    const outName = outputName(file);
    const outPath = path.join(DOCS_DIR, outName);

    if (fs.existsSync(outPath) && !force) {
      console.log(`[import-raw] skip   ${file} -> docs/${outName} (exists; use --force)`);
      skipped++;
      continue;
    }

    const raw = fs.readFileSync(path.join(RAW_DIR, file), "utf-8");
    fs.writeFileSync(outPath, convertRaw(file, raw));
    console.log(`[import-raw] write  ${file} -> docs/${outName}`);
    written++;
  }

  console.log(
    `\n[import-raw] Done. ${written} written, ${skipped} skipped.\n` +
      "[import-raw] Next: run POST /build-index (or click Build Index in the web UI) to rebuild the retrieval index.",
  );
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
