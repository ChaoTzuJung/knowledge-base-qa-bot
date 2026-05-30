import { Hono } from "hono";
import { runDream } from "../dream/consolidate.js";

/**
 * POST /dream — run one memory-consolidation pass: cluster repeatedly-asked,
 * grounded questions from the turn log, distill each into a canonical FAQ entry,
 * promote them into docs/_consolidated.md, and rebuild the indexes. Returns a
 * report of what was scanned and promoted.
 */
export const dreamRoute = new Hono().post("/dream", async (c) => {
  try {
    const report = await runDream();
    return c.json(report);
  } catch (err) {
    console.error("[/dream] failed:", err);
    return c.json({ error: "Dream consolidation failed." }, 500);
  }
});
