export type Strategy = "markdown_kb" | "vector_rag";

export interface Section {
  id: string;
  file: string;
  heading: string;
  heading_path: string[];
  content: string;
  tokens: string[];
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
}

export interface VectorMetadata {
  dim: number;
  count: number;
  chunks: Chunk[];
  max_elements: number;
}

export interface SourceInfo {
  source: string;
  heading: string;
  score: number;
  content: string;
}

export interface ChatResult {
  answer: string;
  sources: SourceInfo[];
}

export interface RetrievalHit {
  section: Section | Chunk;
  score: number;
}
