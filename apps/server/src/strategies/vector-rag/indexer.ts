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

function writeMetadata(maxElements: number) {
  ensureDirs();
  const meta: VectorMetadata = {
    dim: EMBEDDING_DIM,
    count: vectorState.chunks.length,
    chunks: vectorState.chunks,
    max_elements: maxElements,
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

export async function buildVectorIndex(): Promise<{
  files_indexed: number;
  chunks_indexed: number;
}> {
  ensureDirs();
  if (!fs.existsSync(DOCS_DIR)) {
    vectorState.index = null;
    vectorState.chunks = [];
    rebuildByLabel();
    writeMetadata(0);
    return { files_indexed: 0, chunks_indexed: 0 };
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  const rawChunks: Omit<Chunk, "label">[] = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    rawChunks.push(...chunkFile(file, source));
  }

  const maxElements = Math.max(rawChunks.length, 16);
  const idx = new HierarchicalNSW("cosine", EMBEDDING_DIM);
  idx.initIndex(maxElements);

  const chunks: Chunk[] = [];
  if (rawChunks.length > 0) {
    const vectors = await embed(rawChunks.map((c) => c.content));
    rawChunks.forEach((c, i) => {
      idx.addPoint(vectors[i], i);
      chunks.push({ ...c, label: i });
    });
  }

  idx.writeIndexSync(VECTOR_HNSW_PATH);
  vectorState.index = idx;
  vectorState.chunks = chunks;
  rebuildByLabel();
  writeMetadata(maxElements);

  const filesIndexed = new Set(chunks.map((c) => c.file)).size;
  return { files_indexed: filesIndexed, chunks_indexed: chunks.length };
}

export function isVectorIndexed(): boolean {
  return vectorState.index !== null && vectorState.chunks.length > 0;
}
