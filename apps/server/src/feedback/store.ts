import fs from "node:fs";
import { FEEDBACK_DIR, FEEDBACK_LOG_PATH } from "../lib/paths.js";
import type { FeedbackInput } from "../lib/types.js";
import type { EvalCase } from "../eval/cases.js";

export type FeedbackEntry = FeedbackInput & { ts: string };

/**
 * Append one feedback entry to the JSONL log. Best-effort and synchronous — any
 * failure is swallowed so feedback can never break the request that triggered it
 * (mirrors dream/log.ts).
 */
export function recordFeedback(input: FeedbackInput, ts: string): void {
  try {
    const entry: FeedbackEntry = { ...input, ts };
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
    fs.appendFileSync(FEEDBACK_LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.error("[feedback] recordFeedback failed (ignored):", err);
  }
}

/** Read the feedback log, skipping malformed lines. Returns [] when absent. */
export function readFeedback(): FeedbackEntry[] {
  if (!fs.existsSync(FEEDBACK_LOG_PATH)) return [];
  const out: FeedbackEntry[] = [];
  for (const line of fs.readFileSync(FEEDBACK_LOG_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as FeedbackEntry);
    } catch {
      // skip a corrupt line
    }
  }
  return out;
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Turn 👎 feedback into eval cases (pure). A thumbs-down records the answer as a
 * MISS, so each becomes a regression case:
 *  - with an `expected_source` → an "answer" case expecting that section,
 *  - with `expected_source === null` → a "cannot_confirm" case (it should have refused).
 * Entries with no `expected_source` field are skipped (can't form a target).
 * Deduped by normalized query, latest wins. 👍 is ignored here.
 */
export function feedbackToCases(entries: FeedbackEntry[]): EvalCase[] {
  const byQuery = new Map<string, FeedbackEntry>();
  for (const e of entries) {
    if (e.rating !== "down") continue;
    byQuery.set(normalize(e.query), e); // later entries overwrite → latest wins
  }

  const cases: EvalCase[] = [];
  for (const e of byQuery.values()) {
    if (e.expected_source === undefined) continue; // no target → can't build a case
    if (e.expected_source === null) {
      cases.push({
        intent: `feedback: ${e.query}`,
        paraphrases: [e.query],
        expected: [],
        expectedDecision: "cannot_confirm",
      });
    } else {
      cases.push({
        intent: `feedback: ${e.query}`,
        paraphrases: [e.query],
        expected: [e.expected_source],
        expectedDecision: "answer",
      });
    }
  }
  return cases;
}
