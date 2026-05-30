/**
 * Answer-level eval: run the FULL pipeline (retrieve → answer → grounding verify)
 * over a curated case set and score citation precision/recall, decision match
 * (answer vs. "I cannot confirm"), and grounding — not just retrieval hit@k.
 *
 * Needs OPENAI_API_KEY (every case runs answerQuery, which embeds + calls the LLM).
 * The fast, key-free retrieval-only eval still lives in `npm run eval`.
 *
 * Usage:
 *   npm run eval:answer        # from apps/server, or from repo root
 *   (build the index first: POST /build-index, or ensure .kb/ exists)
 */
import { answerQuery } from "../strategies/query.js";
import { isIndexed, loadIndexJson } from "../strategies/markdown-kb/indexer.js";
import { isVectorIndexed, loadVectorIndex } from "../strategies/vector-rag/indexer.js";
import { CASES } from "./cases.js";
import {
  baseId,
  computeCaseMetrics,
  decisionOf,
  extractCitations,
  type CaseMetrics,
} from "./metrics.js";

const STRATEGY = "hybrid" as const; // the production default

function pct(n: number | null): string {
  return n === null ? "  n/a" : n.toFixed(2);
}
function mark(b: boolean | null): string {
  return b === null ? "n/a" : b ? "✅" : "❌";
}

function avg(xs: Array<number | null>): number | null {
  const vals = xs.filter((x): x is number => x !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function rate(bs: Array<boolean | null>): string {
  const vals = bs.filter((b): b is boolean => b !== null);
  return `${vals.filter(Boolean).length}/${vals.length}`;
}

async function main(): Promise<void> {
  try {
    const md = loadIndexJson();
    console.log(`[eval] markdown_kb: ${md.sections_indexed} sections from ${md.files_indexed} files`);
  } catch (err) {
    console.error("[eval] failed to load markdown_kb index:", err);
  }
  try {
    const vec = loadVectorIndex();
    console.log(`[eval] vector_rag: ${vec.chunks_indexed} chunks from ${vec.files_indexed} files`);
  } catch (err) {
    console.error("[eval] failed to load vector index:", err);
  }
  if (!isIndexed() && !isVectorIndexed()) {
    console.error("\n[eval] No index found. Build it first: POST /build-index\n");
    process.exit(1);
  }

  const total = CASES.reduce((n, c) => n + c.paraphrases.length, 0);
  console.log(`\nAnswer-level eval — strategy=${STRATEGY}, ${CASES.length} intents, ${total} paraphrases\n`);

  const all: CaseMetrics[] = [];
  const answerOnly: CaseMetrics[] = [];
  const refusalOnly: CaseMetrics[] = [];

  for (const c of CASES) {
    const target = c.expectedDecision === "answer" ? c.expected.join(", ") : "(refuse)";
    console.log(`▸ ${c.intent}   expect: ${c.expectedDecision} / ${target}`);

    const results = await Promise.all(
      c.paraphrases.map(async (q) => {
        const r = await answerQuery(q, STRATEGY, { verify: true });
        const sourceIds = r.sources.map((s) => baseId(s.source));
        const m = computeCaseMetrics(
          { expected: c.expected, expectedDecision: c.expectedDecision },
          {
            decision: decisionOf(r.answer, sourceIds),
            retrieved: sourceIds,
            cited: extractCitations(r.answer),
            grounded: r.grounding?.grounded ?? true,
          },
        );
        return { q, m };
      }),
    );

    for (const { q, m } of results) {
      all.push(m);
      (c.expectedDecision === "answer" ? answerOnly : refusalOnly).push(m);
      console.log(`   "${q}"`);
      if (c.expectedDecision === "answer") {
        console.log(
          `       decision ${mark(m.decision_match)}   recall ${pct(m.retrieval_recall)}  top1 ${mark(m.top1_hit)}` +
            `  cite-recall ${pct(m.citation_recall)}  cite-prec ${pct(m.citation_precision)}  grounded ${mark(m.answer_grounded)}`,
        );
      } else {
        console.log(`       decision ${mark(m.decision_match)}  (must refuse)`);
      }
    }
    console.log("");
  }

  console.log("Summary");
  console.log(`   Decision match (all):     ${rate(all.map((m) => m.decision_match))}`);
  console.log(`   — answer cases —`);
  console.log(`   Retrieval recall (avg):   ${pct(avg(answerOnly.map((m) => m.retrieval_recall)))}`);
  console.log(`   Top-1 hit rate:           ${rate(answerOnly.map((m) => m.top1_hit))}`);
  console.log(`   Citation recall (avg):    ${pct(avg(answerOnly.map((m) => m.citation_recall)))}`);
  console.log(`   Citation precision (avg): ${pct(avg(answerOnly.map((m) => m.citation_precision)))}`);
  console.log(`   Grounded rate:            ${rate(answerOnly.map((m) => m.answer_grounded))}`);
  console.log(`   — refusal cases —`);
  console.log(`   Correctly refused:        ${rate(refusalOnly.map((m) => m.decision_match))}`);
  console.log(
    "\nWatch for: citation precision < 1 (the answer cited a source it wasn't given) and\n" +
      "decision misses (answered when it should have said \"I cannot confirm\").",
  );
  process.exit(0);
}

void main();
