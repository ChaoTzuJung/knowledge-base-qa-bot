/**
 * Answer-level eval metrics. The paraphrase eval (paraphrase.ts) only scores
 * RETRIEVAL (did the right section come back?). These metrics score the whole
 * pipeline's behaviour, separating axes that retrieval-only is blind to:
 *
 *  - retrieval_recall    — were the expected section(s) retrieved at all?
 *  - top1_hit            — was an expected section the top retrieved result?
 *  - citation_recall     — of the expected sources, how many did the ANSWER cite?
 *  - citation_precision  — of what the answer cited, how much was actually retrieved?
 *                          (< 1 means the model cited something it wasn't given —
 *                          a hallucinated citation the retrieval metric can't see.)
 *  - decision_match      — did the system answer-vs-refuse as expected? (covers the
 *                          "should say I cannot confirm" cases.)
 *  - answer_grounded     — the post-answer grounding verdict.
 *
 * All pure — no IO, no LLM — so they unit-test cleanly.
 */

/** Inline citation as the LLM emits it, with or without a `Source:` label. Mirrors
 *  the [filename.md#heading-slug] format the system prompt mandates. */
const CITATION_RE = /\[(?:source:\s*)?([a-z0-9_-]+\.md#[a-z0-9-]+)\]/gi;

/** Distinct source ids cited inline in an answer (lowercased, deduped). */
export function extractCitations(answer: string): string[] {
  const ids = new Set<string>();
  for (const m of answer.matchAll(CITATION_RE)) ids.add(m[1].toLowerCase());
  return [...ids];
}

/** A vector chunk id equals its parent section id, optionally suffixed "::part-N". */
export function baseId(source: string): string {
  return source.split("::")[0];
}

export type Decision = "answer" | "cannot_confirm";

/** Whether the system answered or refused, derived from its answer + sources. */
export function decisionOf(answer: string, sources: string[]): Decision {
  const a = answer.trim();
  if (sources.length === 0 || a.startsWith("I cannot confirm") || a.includes("index has not been built")) {
    return "cannot_confirm";
  }
  return "answer";
}

export interface CaseExpectation {
  /** Expected section ids (empty for a cannot_confirm case). */
  expected: string[];
  expectedDecision: Decision;
}

export interface CaseObservation {
  decision: Decision;
  /** Retrieved source ids, in rank order (base ids, no ::part suffix). */
  retrieved: string[];
  /** Source ids cited inline in the answer. */
  cited: string[];
  /** grounding.grounded (default true when no verdict was produced). */
  grounded: boolean;
}

export interface CaseMetrics {
  decision_match: boolean;
  retrieval_recall: number | null;
  top1_hit: boolean | null;
  citation_recall: number | null;
  citation_precision: number | null;
  answer_grounded: boolean | null;
}

/** Count of `a`'s items that are also in `b`. */
function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.reduce((n, x) => n + (set.has(x) ? 1 : 0), 0);
}

export function computeCaseMetrics(exp: CaseExpectation, obs: CaseObservation): CaseMetrics {
  const decision_match = obs.decision === exp.expectedDecision;

  // For "should refuse" cases, only the decision matters; retrieval/citation axes
  // are not applicable.
  if (exp.expectedDecision === "cannot_confirm") {
    return {
      decision_match,
      retrieval_recall: null,
      top1_hit: null,
      citation_recall: null,
      citation_precision: null,
      answer_grounded: null,
    };
  }

  return {
    decision_match,
    retrieval_recall: exp.expected.length ? overlap(exp.expected, obs.retrieved) / exp.expected.length : null,
    top1_hit: obs.retrieved.length ? exp.expected.includes(obs.retrieved[0]) : false,
    citation_recall: exp.expected.length ? overlap(exp.expected, obs.cited) / exp.expected.length : null,
    citation_precision: obs.cited.length ? overlap(obs.cited, obs.retrieved) / obs.cited.length : null,
    answer_grounded: obs.grounded,
  };
}
