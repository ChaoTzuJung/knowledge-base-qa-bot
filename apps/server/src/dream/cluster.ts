/**
 * Pure clustering primitives for the Dream consolidation loop. No IO, no LLM —
 * fully unit-testable.
 *
 * We group repeatedly-asked questions by embedding similarity: build edges
 * between every pair whose cosine similarity clears a threshold, union them, and
 * read off the connected components. Single-link (union-find) clustering is the
 * right fit here — paraphrases of one intent form a dense neighbourhood, and we
 * only ever want "is this the same question, asked again?".
 */

/** Cosine similarity of two equal-length vectors. Returns 0 for a zero vector. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Minimal union-find (disjoint set) with path compression and union by size. */
export class UnionFind {
  private parent: number[];
  private size: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = new Array(n).fill(1);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    // Path compression.
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
  }
}

/**
 * Cluster vectors by single-link cosine similarity. Returns groups of indices
 * (into `vectors`); every index appears in exactly one group, so a vector with no
 * near-neighbour is a singleton group. Groups are sorted largest-first, ties by
 * smallest leading index, for deterministic output.
 */
export function clusterByCosine(vectors: number[][], threshold = 0.85): number[][] {
  const n = vectors.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosine(vectors[i], vectors[j]) >= threshold) uf.union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const group = byRoot.get(root) ?? [];
    group.push(i);
    byRoot.set(root, group);
  }

  return [...byRoot.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/** Keep only clusters with at least `minSize` members (the "asked repeatedly" gate). */
export function selectClusters(groups: number[][], minSize = 3): number[][] {
  return groups.filter((g) => g.length >= minSize);
}
