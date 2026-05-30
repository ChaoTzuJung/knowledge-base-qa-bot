import { createHash } from "node:crypto";

/** Stable content fingerprint for a source file (raw Markdown text). */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Files whose current content hash matches the previously indexed hash — their
 * chunks and embeddings can be reused verbatim, so they never need re-embedding.
 * New files (absent from `oldHashes`) and changed files are excluded; deleted
 * files simply never appear in `currentHashes`.
 */
export function selectReusableFiles(
  currentHashes: Map<string, string>,
  oldHashes: Record<string, string>,
): Set<string> {
  const reusable = new Set<string>();
  for (const [file, hash] of currentHashes) {
    if (oldHashes[file] !== undefined && oldHashes[file] === hash) {
      reusable.add(file);
    }
  }
  return reusable;
}
