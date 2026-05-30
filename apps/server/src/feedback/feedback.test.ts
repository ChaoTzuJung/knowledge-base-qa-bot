import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackToCases, type FeedbackEntry } from "./store.js";

const entry = (over: Partial<FeedbackEntry>): FeedbackEntry => ({
  rating: "down",
  query: "q",
  answer: "a",
  sources: [],
  ts: "2026-01-01T00:00:00Z",
  ...over,
});

test("feedbackToCases: down + expected_source → an 'answer' regression case", () => {
  const cases = feedbackToCases([
    entry({ query: "express delivery turnaround time", expected_source: "shipping_faq.md#expedited-shipping" }),
  ]);
  assert.deepEqual(cases, [
    {
      intent: "feedback: express delivery turnaround time",
      paraphrases: ["express delivery turnaround time"],
      expected: ["shipping_faq.md#expedited-shipping"],
      expectedDecision: "answer",
    },
  ]);
});

test("feedbackToCases: down + null → a 'cannot_confirm' case", () => {
  const cases = feedbackToCases([entry({ query: "weather?", expected_source: null })]);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].expectedDecision, "cannot_confirm");
  assert.deepEqual(cases[0].expected, []);
});

test("feedbackToCases: 👍 and target-less 👎 are ignored", () => {
  const cases = feedbackToCases([
    entry({ rating: "up", query: "good one", expected_source: "x.md#y" }),
    entry({ query: "no target" }), // expected_source omitted
  ]);
  assert.deepEqual(cases, []);
});

test("feedbackToCases: dedupes by normalized query, latest wins", () => {
  const cases = feedbackToCases([
    entry({ query: "How long do refunds take?", expected_source: "wrong.md#x" }),
    entry({ query: "  how long DO refunds take?  ", expected_source: "refund_policy.md#refund-timeline" }),
  ]);
  assert.equal(cases.length, 1);
  assert.deepEqual(cases[0].expected, ["refund_policy.md#refund-timeline"]);
});
