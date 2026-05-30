import { loadIndexJson } from "../strategies/markdown-kb/indexer.js";
import { loadVectorIndex } from "../strategies/vector-rag/indexer.js";
import { runDream } from "../dream/consolidate.js";

/** CLI entry for the Dream consolidation loop: `npm run dream`. */
async function main() {
  // Load existing indexes so the post-consolidation incremental rebuild can
  // reuse unchanged vectors instead of re-embedding everything.
  try {
    loadIndexJson();
    loadVectorIndex();
  } catch (err) {
    console.error("[dream] failed to load existing indexes (continuing):", err);
  }

  const report = await runDream();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("[dream] run failed:", err);
  process.exit(1);
});
