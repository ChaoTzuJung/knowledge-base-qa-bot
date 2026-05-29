import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceInfo } from "../../lib/types.js";
import { answerSlug, renderAnswersIndex, renderFiledAnswer } from "./answer-filing.js";

function source(partial: Partial<SourceInfo> & { source: string }): SourceInfo {
  return { heading: "H", score: 1, content: "", ...partial };
}

const base = {
  query: "How long do refunds take?",
  answer: "Refunds typically arrive in 5-7 business days [refund_policy.md#refund-timeline].",
  sources: [
    source({ source: "refund_policy.md#refund-timeline", heading: "Refund Policy > Refund timeline", score: 2.152 }),
  ],
  strategy: "markdown_kb" as const,
  filedAt: "2026-05-29T10:00:00.000Z",
};

test("renderFiledAnswer writes machine-readable front matter", () => {
  const md = renderFiledAnswer(base);
  assert.match(md, /^---$/m);
  assert.match(md, /^question: "How long do refunds take\?"$/m);
  assert.match(md, /^strategy: markdown_kb$/m);
  assert.match(md, /^filed_at: 2026-05-29T10:00:00\.000Z$/m);
  assert.match(md, /^slug: how-long-do-refunds-take$/m);
});

test("renderFiledAnswer uses the question as the H1 heading", () => {
  assert.match(renderFiledAnswer(base), /^# How long do refunds take\?$/m);
});

test("renderFiledAnswer rewrites inline citations into docs links", () => {
  const md = renderFiledAnswer(base);
  assert.match(
    md,
    /\[refund_policy\.md#refund-timeline\]\(\.\.\/\.\.\/docs\/refund_policy\.md#refund-timeline\)/,
  );
});

test("renderFiledAnswer does not double-wrap a citation that is already a link", () => {
  const md = renderFiledAnswer({
    ...base,
    answer: "See [refund_policy.md#refund-timeline](../../docs/refund_policy.md#refund-timeline).",
  });
  assert.equal(md.includes(")]("), false);
  assert.equal((md.match(/\]\(\.\.\/\.\.\/docs/g) ?? []).length, 2); // one in body, one in Sources
});

test("renderFiledAnswer lists sources with link and score", () => {
  const md = renderFiledAnswer(base);
  assert.match(md, /^## Sources$/m);
  assert.match(
    md,
    /^- \[Refund Policy > Refund timeline\]\(\.\.\/\.\.\/docs\/refund_policy\.md#refund-timeline\) — score 2\.152$/m,
  );
});

test("renderFiledAnswer falls back when there are no sources", () => {
  const md = renderFiledAnswer({ ...base, sources: [] });
  assert.match(md, /_No sources cited\._/);
});

test("answerSlug slugifies the query and falls back to 'answer'", () => {
  assert.equal(answerSlug("How long do refunds take?"), "how-long-do-refunds-take");
  assert.equal(answerSlug("???"), "answer");
});

test("renderAnswersIndex links to each answer file, newest first", () => {
  const md = renderAnswersIndex([
    { slug: "a", question: "Question A", strategy: "markdown_kb", filed_at: "2026-05-28T09:00:00.000Z" },
    { slug: "b", question: "Question B", strategy: "vector_rag", filed_at: "2026-05-29T09:00:00.000Z" },
  ]);
  assert.match(md, /\*\*2 answers\*\*/);
  assert.match(md, /- \[Question B\]\(b\.md\) — vector_rag, filed 2026-05-29/);
  assert.match(md, /- \[Question A\]\(a\.md\) — markdown_kb, filed 2026-05-28/);
  // newest (B) listed before oldest (A)
  assert.ok(md.indexOf("(b.md)") < md.indexOf("(a.md)"));
});

test("renderAnswersIndex handles the empty case", () => {
  const md = renderAnswersIndex([]);
  assert.match(md, /\*\*0 answers\*\*/);
  assert.match(md, /_No answers filed yet\._/);
});
