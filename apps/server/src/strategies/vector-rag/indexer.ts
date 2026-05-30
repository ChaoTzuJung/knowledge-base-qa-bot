import fs from "node:fs";
import path from "node:path";
import hnswlib from "hnswlib-node";
import {
  DOCS_DIR,
  KB_DIR,
  VECTOR_DIR,
  VECTOR_HNSW_PATH,
  VECTOR_META_PATH,
} from "../../lib/paths.js";
import type { Chunk, VectorMetadata } from "../../lib/types.js";
import { EMBEDDING_DIM, OPENAI_EMBEDDING_MODEL } from "../../env.js";
import { getOpenAI } from "../../llm/client.js";
import { chunkFile } from "./chunker.js";
import { hashContent, selectReusableFiles } from "./incremental.js";

const { HierarchicalNSW } = hnswlib;

export const vectorState: {
  index: InstanceType<typeof HierarchicalNSW> | null;
  chunks: Chunk[];
  byLabel: Map<number, Chunk>;
} = {
  index: null,
  chunks: [],
  byLabel: new Map(),
};

async function embed(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function ensureDirs() {
  fs.mkdirSync(KB_DIR, { recursive: true });
  fs.mkdirSync(VECTOR_DIR, { recursive: true });
}

function writeMetadata(maxElements: number, fileHashes: Record<string, string>) {
  ensureDirs();
  const meta: VectorMetadata = {
    dim: EMBEDDING_DIM,
    count: vectorState.chunks.length,
    chunks: vectorState.chunks,
    max_elements: maxElements,
    embedding_model: OPENAI_EMBEDDING_MODEL,
    file_hashes: fileHashes,
  };
  fs.writeFileSync(VECTOR_META_PATH, JSON.stringify(meta, null, 2));
}

function rebuildByLabel() {
  vectorState.byLabel = new Map();
  for (const c of vectorState.chunks) vectorState.byLabel.set(c.label, c);
}

export function loadVectorIndex(): { files_indexed: number; chunks_indexed: number } {
  if (!fs.existsSync(VECTOR_META_PATH) || !fs.existsSync(VECTOR_HNSW_PATH)) {
    vectorState.index = null;
    vectorState.chunks = [];
    rebuildByLabel();
    return { files_indexed: 0, chunks_indexed: 0 };
  }
  const meta = JSON.parse(fs.readFileSync(VECTOR_META_PATH, "utf-8")) as VectorMetadata;
  const idx = new HierarchicalNSW("cosine", meta.dim);
  idx.readIndexSync(VECTOR_HNSW_PATH);
  vectorState.index = idx;
  vectorState.chunks = meta.chunks;
  rebuildByLabel();
  const files = new Set(meta.chunks.map((c) => c.file));
  return { files_indexed: files.size, chunks_indexed: meta.count };
}

/**
 * Load the existing index + metadata only if its vectors are safe to reuse —
 * i.e. the same embedding model and dimension. Returns null otherwise, so the
 * caller falls back to a full re-embed (this also handles an embedding-model
 * change: never mix vectors from different models).
 */
function loadReusable(): { index: InstanceType<typeof HierarchicalNSW>; meta: VectorMetadata } | null {
  if (!fs.existsSync(VECTOR_META_PATH) || !fs.existsSync(VECTOR_HNSW_PATH)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(VECTOR_META_PATH, "utf-8")) as VectorMetadata;
    if (meta.embedding_model !== OPENAI_EMBEDDING_MODEL || meta.dim !== EMBEDDING_DIM) return null;
    const idx = new HierarchicalNSW("cosine", meta.dim);
    idx.readIndexSync(VECTOR_HNSW_PATH);
    return { index: idx, meta };
  } catch {
    return null;
  }
}

export async function buildVectorIndex(): Promise<{
  files_indexed: number;
  chunks_indexed: number;
}> {
  ensureDirs();
  if (!fs.existsSync(DOCS_DIR)) {
    vectorState.index = null;
    vectorState.chunks = [];
    rebuildByLabel();
    writeMetadata(0, {});
    return { files_indexed: 0, chunks_indexed: 0 };
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  // Hash every current file, then decide which can be reused from the prior index.
  const sources = new Map<string, string>();
  const fileHashes: Record<string, string> = {};
  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    sources.set(file, content);
    fileHashes[file] = hashContent(content);
  }

  const prior = loadReusable();
  const reusableFiles = prior
    ? selectReusableFiles(new Map(Object.entries(fileHashes)), prior.meta.file_hashes ?? {})
    : new Set<string>();

  const oldChunksByFile = new Map<string, Chunk[]>();
  if (prior) {
    for (const c of prior.meta.chunks) {
      const arr = oldChunksByFile.get(c.file) ?? [];
      arr.push(c);
      oldChunksByFile.set(c.file, arr);
    }
  }

  // Reuse vectors for unchanged files (pulled straight from the old HNSW index);
  // queue the rest (changed + new) for embedding.
  const reused: { chunk: Omit<Chunk, "label">; vector: number[] }[] = [];
  const rebuildFiles: string[] = [];
  for (const file of files) {
    if (prior && reusableFiles.has(file) && oldChunksByFile.has(file)) {
      try {
        for (const oc of oldChunksByFile.get(file)!) {
          const vector = prior.index.getPoint(oc.label);
          reused.push({
            chunk: { id: oc.id, file: oc.file, heading: oc.heading, heading_path: oc.heading_path, content: oc.content },
            vector,
          });
        }
        continue;
      } catch {
        // A stored vector was unavailable — drop this file's partial reuse and re-embed it.
        while (reused.length > 0 && reused[reused.length - 1].chunk.file === file) reused.pop();
      }
    }
    rebuildFiles.push(file);
  }

  const rebuildRawChunks: Omit<Chunk, "label">[] = [];
  for (const file of rebuildFiles) {
    rebuildRawChunks.push(...chunkFile(file, sources.get(file) ?? ""));
  }
  const rebuildVectors =
    rebuildRawChunks.length > 0 ? await embed(rebuildRawChunks.map((c) => c.content)) : [];

  // Assemble the combined index with fresh, contiguous labels.
  const chunks: Chunk[] = [];
  const vectors: number[][] = [];
  let label = 0;
  for (const { chunk, vector } of reused) {
    chunks.push({ ...chunk, label });
    vectors.push(vector);
    label += 1;
  }
  rebuildRawChunks.forEach((c, i) => {
    chunks.push({ ...c, label });
    vectors.push(rebuildVectors[i]);
    label += 1;
  });

  const maxElements = Math.max(chunks.length, 16);
  const idx = new HierarchicalNSW("cosine", EMBEDDING_DIM);
  idx.initIndex(maxElements);
  vectors.forEach((v, i) => idx.addPoint(v, chunks[i].label));

  idx.writeIndexSync(VECTOR_HNSW_PATH);
  vectorState.index = idx;
  vectorState.chunks = chunks;
  rebuildByLabel();
  writeMetadata(maxElements, fileHashes);

  console.log(
    `[vector-index] ${prior ? "incremental" : "full"} build: reused ${reused.length} chunk(s) ` +
      `from ${files.length - rebuildFiles.length} file(s); embedded ${rebuildRawChunks.length} ` +
      `chunk(s) from ${rebuildFiles.length} file(s)`,
  );

  const filesIndexed = new Set(chunks.map((c) => c.file)).size;
  return { files_indexed: filesIndexed, chunks_indexed: chunks.length };
}

export function isVectorIndexed(): boolean {
  return vectorState.index !== null && vectorState.chunks.length > 0;
}
