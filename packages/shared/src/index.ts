export type Strategy = "markdown_kb" | "vector_rag" | "hybrid" | "llm_index";

export interface SourceInfo {
  source: string;
  heading: string;
  score: number;
  content: string;
}

/** Result of the post-answer grounding check: is every claim supported by the
 *  retrieved sources, and which claims (if any) were not. */
export interface GroundingVerdict {
  grounded: boolean;
  unsupported: string[];
}

export interface ChatResult {
  answer: string;
  sources: SourceInfo[];
  grounding?: GroundingVerdict;
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

/** A user's rating of an answer, sent to POST /feedback. For a "down" rating,
 *  `expected_source` is the section the answer SHOULD have used (a source id),
 *  or `null` to mean "it should have refused". */
export interface FeedbackInput {
  rating: "up" | "down";
  query: string;
  answer: string;
  sources: SourceInfo[];
  expected_source?: string | null;
}
