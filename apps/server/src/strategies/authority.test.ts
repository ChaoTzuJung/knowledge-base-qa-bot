import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRIORITY, priorityForSourceType, rerankByAuthority } from "./authority.js";

test("priorityForSourceType: known types, case-insensitive", () => {
  assert.equal(priorityForSourceType("policy"), 3);
  assert.equal(priorityForSourceType("POLICY"), 3);
  assert.equal(priorityForSourceType("transcript"), 0);
});

test("priorityForSourceType: unknown / missing falls back to default", () => {
  assert.equal(priorityForSourceType("memo"), DEFAULT_PRIORITY);
  assert.equal(priorityForSourceType(undefined), DEFAULT_PRIORITY);
  assert.equal(priorityForSourceType(""), DEFAULT_PRIORITY);
});

const item = (id: string, priority: number) => ({ id, priority });

test("rerankByAuthority: authority breaks a near-tie", () => {
  // transcript(0) is marginally more relevant; policy(3) is just behind → policy wins.
  const out = rerankByAuthority([item("transcript", 0), item("policy", 3)], [1.0, 0.95]);
  assert.equal(out[0].item.id, "policy");
  // The original (unboosted) score is preserved for display.
  assert.equal(out[0].score, 0.95);
});

test("rerankByAuthority: a clear relevance gap is NOT overridden by authority", () => {
  // transcript far more relevant; policy's small boost cannot close the gap.
  const out = rerankByAuthority([item("transcript", 0), item("policy", 3)], [2.0, 0.5]);
  assert.equal(out[0].item.id, "transcript");
});

test("rerankByAuthority: equal authority keeps incoming relevance order (stable)", () => {
  const out = rerankByAuthority([item("a", 1), item("b", 1)], [0.9, 0.8]);
  assert.deepEqual(out.map((o) => o.item.id), ["a", "b"]);
});

test("rerankByAuthority: missing priority uses the default", () => {
  const untagged = { id: "untagged" } as { id: string; priority?: number };
  const out = rerankByAuthority([untagged, { id: "policy", priority: 3 }], [1.0, 0.97]);
  // untagged(default 1) → 1.0×1.05 = 1.05; policy(3) → 0.97×1.15 ≈ 1.116 → policy wins.
  assert.equal(out[0].item.id, "policy");
});
