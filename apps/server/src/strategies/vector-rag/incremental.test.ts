import { test } from "node:test";
import assert from "node:assert/strict";
import { hashContent, selectReusableFiles } from "./incremental.js";

test("hashContent: deterministic, content-sensitive", () => {
  assert.equal(hashContent("hello"), hashContent("hello"));
  assert.notEqual(hashContent("hello"), hashContent("hello!"));
  assert.match(hashContent("x"), /^[0-9a-f]{64}$/); // sha256 hex
});

test("selectReusableFiles: reuses only files whose hash is unchanged", () => {
  const current = new Map([
    ["a.md", "h1"], // unchanged
    ["b.md", "h2-new"], // changed
    ["c.md", "h3"], // new file
  ]);
  const old = { "a.md": "h1", "b.md": "h2-old", "d.md": "h4" }; // d.md was deleted
  const reusable = selectReusableFiles(current, old);
  assert.deepEqual([...reusable].sort(), ["a.md"]);
  // changed (b), new (c), and deleted (d) are never reusable
  assert.ok(!reusable.has("b.md"));
  assert.ok(!reusable.has("c.md"));
  assert.ok(!reusable.has("d.md"));
});

test("selectReusableFiles: no prior index → nothing reusable (full rebuild)", () => {
  const current = new Map([["a.md", "h1"], ["b.md", "h2"]]);
  assert.equal(selectReusableFiles(current, {}).size, 0);
});

test("selectReusableFiles: all unchanged → everything reusable (no embedding)", () => {
  const current = new Map([["a.md", "h1"], ["b.md", "h2"]]);
  const old = { "a.md": "h1", "b.md": "h2" };
  assert.equal(selectReusableFiles(current, old).size, 2);
});
