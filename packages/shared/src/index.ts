export type Strategy = "markdown_kb" | "vector_rag" | "hybrid" | "llm_index";

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

export interface IndexResult {
  files_indexed: number;
  sections_indexed: number;
  chunks_indexed: number;
  vector_files_indexed: number;
}

export interface SourcesPayload {
  type: "sources";
  strategy: Strategy;
  sources: SourceInfo[];
}

export interface RewritePayload {
  original: string;
  rewritten: string;
}
