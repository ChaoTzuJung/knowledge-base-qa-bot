import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCaseMetrics, decisionOf, extractCitations } from "./metrics.js";

test("extractCitations: extracts ids, dedupes, tolerates a Source: label", () => {
  assert.deepEqual(
    extractCitations("Refunds take 5-7 days [refund_policy.md#refund-timeline]."),
    ["refund_policy.md#refund-timeline"],
  );
  assert.deepEqual(
    extractCitations("a [x.md#a] b [Source: x.md#a] c [y.md#b]"),
    ["x.md#a", "y.md#b"],
  );
  assert.deepEqual(extractCitations("no citations here"), []);
});

test("decisionOf: refusal sentinels and empty sources → cannot_confirm", () => {
  assert.equal(decisionOf("I cannot confirm from the knowledge base.", []), "cannot_confirm");
  assert.equal(decisionOf("Refunds take 5-7 days.", []), "cannot_confirm"); // no sources
  assert.equal(decisionOf("The Hybrid index has not been built yet.", []), "cannot_confirm");
  assert.equal(decisionOf("Refunds take 5-7 days.", ["refund_policy.md#refund-timeline"]), "answer");
});

const ANSWER = { expected: ["refund_policy.md#refund-timeline"], expectedDecision: "answer" as const };

test("computeCaseMetrics: perfect answer case", () => {
  const m = computeCaseMetrics(ANSWER, {
    decision: "answer",
    retrieved: ["refund_policy.md#refund-timeline", "refund_policy.md#how-to-request-a-refund"],
    cited: ["refund_policy.md#refund-timeline"],
    grounded: true,
  });
  assert.equal(m.decision_match, true);
  assert.equal(m.retrieval_recall, 1);
  assert.equal(m.top1_hit, true);
  assert.equal(m.citation_recall, 1);
  assert.equal(m.citation_precision, 1);
  assert.equal(m.answer_grounded, true);
});

test("computeCaseMetrics: hallucinated citation lowers precision, not recall", () => {
  const m = computeCaseMetrics(ANSWER, {
    decision: "answer",
    retrieved: ["refund_policy.md#refund-timeline"],
    cited: ["refund_policy.md#refund-timeline", "made_up.md#nope"], // one cited id wasn't retrieved
    grounded: true,
  });
  assert.equal(m.citation_recall, 1); // expected source was cited
  assert.equal(m.citation_precision, 0.5); // half of cited ids were actually retrieved
});

test("computeCaseMetrics: missing citation → recall 0, precision null", () => {
  const m = computeCaseMetrics(ANSWER, {
    decision: "answer",
    retrieved: ["refund_policy.md#refund-timeline"],
    cited: [],
    grounded: true,
  });
  assert.equal(m.citation_recall, 0);
  assert.equal(m.citation_precision, null);
});

test("computeCaseMetrics: cannot_confirm case scores decision only", () => {
  const refuse = { expected: [], expectedDecision: "cannot_confirm" as const };
  const correct = computeCaseMetrics(refuse, { decision: "cannot_confirm", retrieved: [], cited: [], grounded: true });
  assert.equal(correct.decision_match, true);
  assert.equal(correct.retrieval_recall, null);
  assert.equal(correct.citation_precision, null);
  assert.equal(correct.answer_grounded, null);

  const answeredWhenItShouldRefuse = computeCaseMetrics(refuse, {
    decision: "answer",
    retrieved: ["something.md#x"],
    cited: ["something.md#x"],
    grounded: true,
  });
  assert.equal(answeredWhenItShouldRefuse.decision_match, false);
});
