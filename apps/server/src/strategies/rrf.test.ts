import { test } from "node:test";
import assert from "node:assert/strict";
import { reciprocalRankFusion } from "./rrf.js";

test("rrf: an item ranked highly by both lists beats single-list items", () => {
  // "b" is rank 2 in list A and rank 1 in list B; nothing else appears twice.
  const fused = reciprocalRankFusion([
    ["a", "b", "c"],
    ["b", "d", "e"],
  ]);
  assert.equal(fused[0].id, "b");
  // "b" score = 1/62 + 1/61 > any single-appearance item (max 1/61).
  assert.ok(fused[0].score > fused[1].score);
});

test("rrf: respects rank order within a single list", () => {
  const fused = reciprocalRankFusion([["x", "y", "z"]]);
  assert.deepEqual(
    fused.map((f) => f.id),
    ["x", "y", "z"],
  );
  assert.ok(fused[0].score > fused[1].score && fused[1].score > fused[2].score);
});

test("rrf: dedupes within a list (best rank wins, no double-count)", () => {
  // "a" appears twice in the same list — must be scored once at its best rank.
  const fused = reciprocalRankFusion([["a", "b", "a"]]);
  assert.equal(fused.length, 2);
  const a = fused.find((f) => f.id === "a");
  const b = fused.find((f) => f.id === "b");
  assert.equal(a?.score, 1 / 61); // rank 1, counted once
  assert.equal(b?.score, 1 / 62); // rank 2
});

test("rrf: K dampens rank influence (larger K → scores converge)", () => {
  const tight = reciprocalRankFusion([["a", "b"]], 1);
  const loose = reciprocalRankFusion([["a", "b"]], 1000);
  const tightGap = tight[0].score - tight[1].score;
  const looseGap = loose[0].score - loose[1].score;
  assert.ok(tightGap > looseGap);
});

test("rrf: empty input yields empty output", () => {
  assert.deepEqual(reciprocalRankFusion([]), []);
  assert.deepEqual(reciprocalRankFusion([[], []]), []);
});
