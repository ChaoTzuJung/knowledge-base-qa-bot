import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { feedbackToCases, readFeedback } from "../feedback/store.js";

/**
 * Turn 👎 feedback (`.kb/feedback/feedback.jsonl`) into regression eval cases,
 * written to `eval/cases.gen.json` which `answer-eval` loads alongside the
 * curated cases. Idempotent — regenerated from the log each run.
 *
 * Usage: npm run eval:from-feedback
 */
const OUT = fileURLToPath(new URL("../eval/cases.gen.json", import.meta.url));

const entries = readFeedback();
const cases = feedbackToCases(entries);
fs.writeFileSync(OUT, `${JSON.stringify(cases, null, 2)}\n`);

const down = entries.filter((e) => e.rating === "down").length;
console.log(
  `[eval:from-feedback] ${entries.length} feedback entries (${down} 👎) → ${cases.length} regression cases`,
);
console.log(`wrote ${OUT}`);
