/**
 * Paraphrase comparison eval: how robust is each retrieval strategy when the
 * SAME intent is phrased with different words?
 *
 * For a curated set of intents, we run several paraphrases through both
 * strategies' RETRIEVAL layer (no LLM answer) and check whether each strategy
 * surfaces the section we expect. This exposes the two classic failure modes:
 *   - BM25 misses synonyms      (e.g. "money back" never matches "refund")
 *   - Vector retrieves a related-but-wrong chunk (e.g. "address" -> shipping)
 *
 * Retrieval-only keeps it fast, cheap, and deterministic on the BM25 side.
 * The vector column embeds each query, so it needs OPENAI_API_KEY; if that is
 * missing the vector cells degrade to "error" and the BM25 column still prints.
 *
 * Usage:
 *   npm run eval                       # from apps/server, or from repo root
 *   (build the index first: POST /build-index, or ensure .kb/ exists)
 */
import type { Strategy } from "../lib/types.js";
import { retrieve } from "../strategies/query.js";
import { isIndexed, loadIndexJson } from "../strategies/markdown-kb/indexer.js";
import { isVectorIndexed, loadVectorIndex } from "../strategies/vector-rag/indexer.js";

interface Probe {
  intent: string;
  /** Expected section id, in the parser's `file#slugify(heading)` format. */
  expected: string;
  /** First is keyword-friendly; the rest lean on synonyms / rephrasing. */
  paraphrases: string[];
}

const PROBES: Probe[] = [
  {
    intent: "refund timing",
    expected: "refund_policy.md#refund-timeline",
    paraphrases: [
      "How long do refunds take?",
      "When will I get my money back?",
      "time until reimbursement is processed",
    ],
  },
  {
    intent: "cancel an order",
    expected: "refund_policy.md#cancellation-window",
    paraphrases: [
      "How do I cancel my order?",
      "Can I call off a purchase I just made?",
      "stop an order before it ships",
    ],
  },
  {
    intent: "expedited shipping speed",
    expected: "shipping_faq.md#expedited-shipping",
    paraphrases: [
      "How fast is expedited shipping?",
      "express delivery turnaround time",
      "quickest way to receive my package",
    ],
  },
  {
    intent: "change email",
    expected: "account_help.md#change-email-address",
    paraphrases: [
      "How do I change my email address?",
      "update the address you send mail to",
      "switch my login email",
    ],
  },
  {
    intent: "reset password",
    expected: "account_help.md#reset-password",
    paraphrases: [
      "How do I reset my password?",
      "I forgot my login credentials",
      "recover access to my account",
    ],
  },
];

type Cell =
  | { kind: "hit1"; top: string; score: number }
  | { kind: "hit3"; top: string; score: number }
  | { kind: "miss"; top: string; score: number }
  | { kind: "cannot" }
  | { kind: "noindex" }
  | { kind: "error"; msg: string };

/** Drop any `::part-N` chunk suffix so vector chunk ids match section ids. */
function baseId(source: string): string {
  return source.split("::")[0];
}

async function evalCell(query: string, strategy: Strategy, expected: string): Promise<Cell> {
  try {
    const r = await retrieve(query, strategy);
    if (r.notIndexed) return { kind: "noindex" };
    if (!r.ok || r.sources.length === 0) return { kind: "cannot" };
    const ids = r.sources.map((s) => baseId(s.source));
    const top = r.sources[0];
    if (ids[0] === expected) return { kind: "hit1", top: ids[0], score: top.score };
    if (ids.includes(expected)) return { kind: "hit3", top: ids[0], score: top.score };
    return { kind: "miss", top: ids[0], score: top.score };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.split("\n")[0].slice(0, 80);
    return { kind: "error", msg };
  }
}

function fmtCell(c: Cell): string {
  switch (c.kind) {
    case "hit1":
      return `✅ ${c.top}  (${c.score.toFixed(3)})`;
    case "hit3":
      return `🔸 in top-3, top=${c.top}  (${c.score.toFixed(3)})`;
    case "miss":
      return `❌ ${c.top}  (${c.score.toFixed(3)})`;
    case "cannot":
      return `⚠️  cannot-confirm (below threshold)`;
    case "noindex":
      return `⛔ index not built`;
    case "error":
      return `⚠️  error: ${c.msg}`;
  }
}

interface Tally {
  hit1: number;
  hit3: number;
}

function bump(t: Tally, c: Cell): void {
  if (c.kind === "hit1") {
    t.hit1 += 1;
    t.hit3 += 1;
  } else if (c.kind === "hit3") {
    t.hit3 += 1;
  }
}

async function main(): Promise<void> {
  // Bootstrap the persisted indexes, exactly like the server does on startup.
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
    console.error(
      "\n[eval] No index found. Build it first: start the server and run\n" +
        "       curl -X POST localhost:8000/build-index\n",
    );
    process.exit(1);
  }

  const total = PROBES.reduce((n, p) => n + p.paraphrases.length, 0);
  const bm25: Tally = { hit1: 0, hit3: 0 };
  const vector: Tally = { hit1: 0, hit3: 0 };

  console.log(`\nParaphrase retrieval eval — ${PROBES.length} intents, ${total} paraphrases`);
  console.log("Legend: ✅ expected is top-1   🔸 expected in top-3   ❌ wrong section\n");

  for (const probe of PROBES) {
    console.log(`▸ ${probe.intent}   →  expect: ${probe.expected}`);
    for (const q of probe.paraphrases) {
      const [mdCell, vecCell] = await Promise.all([
        evalCell(q, "markdown_kb", probe.expected),
        evalCell(q, "vector_rag", probe.expected),
      ]);
      bump(bm25, mdCell);
      bump(vector, vecCell);
      console.log(`   "${q}"`);
      console.log(`       BM25    ${fmtCell(mdCell)}`);
      console.log(`       Vector  ${fmtCell(vecCell)}`);
    }
    console.log("");
  }

  console.log(`Summary (out of ${total} paraphrases)`);
  console.log(`   Markdown KB (BM25):   hit@1 ${bm25.hit1}/${total}    hit@3 ${bm25.hit3}/${total}`);
  console.log(`   Vector RAG:           hit@1 ${vector.hit1}/${total}    hit@3 ${vector.hit3}/${total}`);
  console.log(
    "\nLook for: BM25 ❌ on synonym paraphrases where Vector ✅ (keyword gap), and\n" +
      "Vector returning a different section (semantically related but wrong).",
  );

  process.exit(0);
}

void main();
