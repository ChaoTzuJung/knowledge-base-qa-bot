import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../../../..");
export const DOCS_DIR = path.join(ROOT, "docs");
export const RAW_DIR = path.join(ROOT, "raw");
export const KB_DIR = path.join(ROOT, ".kb");
export const INDEX_PATH = path.join(KB_DIR, "index.json");
export const VECTOR_DIR = path.join(KB_DIR, "vector_index");
export const VECTOR_META_PATH = path.join(VECTOR_DIR, "metadata.json");
export const VECTOR_HNSW_PATH = path.join(VECTOR_DIR, "hnsw.bin");
export const WIKI_DIR = path.join(ROOT, "wiki");
export const WIKI_INDEX_PATH = path.join(WIKI_DIR, "index.md");
export const WIKI_ANSWERS_DIR = path.join(WIKI_DIR, "answers");
export const WIKI_ANSWERS_INDEX_PATH = path.join(WIKI_ANSWERS_DIR, "index.md");
