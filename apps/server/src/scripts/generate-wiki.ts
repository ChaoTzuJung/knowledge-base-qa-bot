/**
 * Wiki Index Generation: render wiki/index.md from the persisted .kb/index.json
 * so humans and agents can browse the available topics without calling the API.
 *
 * This reads the existing index — it does NOT rebuild it. Run POST /build-index
 * (or the Build Index button in the web UI) first if .kb/index.json is missing or
 * stale. The same generation also runs automatically at the end of /build-index.
 *
 * Usage:
 *   npm run generate:wiki
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { INDEX_PATH, WIKI_INDEX_PATH } from "../lib/paths.js";
import type { PersistedIndex } from "../lib/types.js";
import { writeWikiIndex } from "../strategies/markdown-kb/wiki.js";

function main(): void {
  if (!fs.existsSync(INDEX_PATH)) {
    console.log(`[generate-wiki] No index found at ${INDEX_PATH}.`);
    console.log("[generate-wiki] Run POST /build-index (or click Build Index) first, then re-run.");
    return;
  }

  const payload = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as PersistedIndex;
  writeWikiIndex(payload.sections);

  const fileCount = new Set(payload.sections.map((s) => s.file)).size;
  console.log(
    `[generate-wiki] Wrote ${WIKI_INDEX_PATH}\n` +
      `[generate-wiki] ${fileCount} documents · ${payload.sections.length} sections.`,
  );
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
