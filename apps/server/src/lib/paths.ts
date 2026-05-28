import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../../../..");
export const DOCS_DIR = path.join(ROOT, "docs");
export const KB_DIR = path.join(ROOT, ".kb");
export const INDEX_PATH = path.join(KB_DIR, "index.json");
export const VECTOR_DIR = path.join(KB_DIR, "vector_index");
export const VECTOR_META_PATH = path.join(VECTOR_DIR, "metadata.json");
export const VECTOR_HNSW_PATH = path.join(VECTOR_DIR, "hnsw.bin");
