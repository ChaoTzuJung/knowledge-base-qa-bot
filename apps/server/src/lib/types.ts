export type {
  Strategy,
  SourceInfo,
  ChatResult,
  GroundingVerdict,
  IndexResult,
  SourcesPayload,
  FeedbackInput,
} from "@kb/shared";

export interface Section {
  id: string;
  file: string;
  heading: string;
  heading_path: string[];
  content: string;
  tokens: string[];
  /** Source-authority priority from the file's front matter (see authority.ts). */
  priority: number;
}

export interface IndexStats {
  files_indexed: number;
  sections_indexed: number;
  avg_doc_len: number;
  doc_freq: Record<string, number>;
}

export interface PersistedIndex {
  sections: Section[];
  stats: IndexStats;
}

export interface Chunk {
  id: string;
  file: string;
  heading: string;
  heading_path: string[];
  content: string;
  label: number;
  /** Source-authority priority inherited from the parent section's file. */
  priority: number;
}

export interface VectorMetadata {
  dim: number;
  count: number;
  chunks: Chunk[];
  max_elements: number;
  /** Embedding model the stored vectors were produced with. A mismatch forces a
   *  full re-embed (never mix vectors from different models). */
  embedding_model: string;
  /** Per-file SHA-256 of the indexed source, for incremental rebuilds. */
  file_hashes: Record<string, string>;
}

export interface RetrievalHit {
  section: Section | Chunk;
  score: number;
}
