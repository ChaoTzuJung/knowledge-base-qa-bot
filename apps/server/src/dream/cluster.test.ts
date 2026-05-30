import { test } from "node:test";
import assert from "node:assert/strict";
import { UnionFind, clusterByCosine, cosine, selectClusters } from "./cluster.js";

test("cosine: identical → 1, orthogonal → 0, zero vector → 0", () => {
  assert.equal(cosine([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test("UnionFind: unions form one component", () => {
  const uf = new UnionFind(4);
  uf.union(0, 1);
  uf.union(1, 2);
  assert.equal(uf.find(0), uf.find(2));
  assert.notEqual(uf.find(0), uf.find(3));
});

// a/b/c are near-parallel (cosine ≥ 0.9); d is orthogonal to a.
const a = [1, 0];
const b = [0.96, 0.28]; // cos(a,b) = 0.96
const c = [0.9, 0.4359]; // cos(a,c) ≈ 0.90
const d = [0, 1]; // cos(a,d) = 0

test("clusterByCosine: groups near-duplicates, isolates the outlier", () => {
  const groups = clusterByCosine([a, b, c, d], 0.85);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], [0, 1, 2]); // largest first
  assert.deepEqual(groups[1], [3]); // singleton
});

test("clusterByCosine: a higher threshold splits a loose cluster", () => {
  // cos(a,c) ≈ 0.90, so at 0.95 c separates from a.
  const groups = clusterByCosine([a, c], 0.95);
  assert.equal(groups.length, 2);
});

test("selectClusters: keeps only clusters with >= minSize members", () => {
  assert.deepEqual(selectClusters([[0, 1, 2], [3]], 3), [[0, 1, 2]]);
  assert.deepEqual(selectClusters([[0, 1], [2, 3, 4, 5]], 3), [[2, 3, 4, 5]]);
});
