import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDistillation } from "./distill.js";

test("parseDistillation: plain JSON", () => {
  const out = parseDistillation('{"question":"How long do refunds take?","answer":"5-7 days [refund_policy.md#refund-timeline]."}');
  assert.deepEqual(out, {
    question: "How long do refunds take?",
    answer: "5-7 days [refund_policy.md#refund-timeline].",
  });
});

test("parseDistillation: tolerates a ```json fence", () => {
  const out = parseDistillation('```json\n{"question":"Q","answer":"A"}\n```');
  assert.deepEqual(out, { question: "Q", answer: "A" });
});

test("parseDistillation: malformed JSON → null (cluster skipped)", () => {
  assert.equal(parseDistillation("not json at all"), null);
});

test("parseDistillation: missing or empty fields → null", () => {
  assert.equal(parseDistillation('{"question":"Q"}'), null);
  assert.equal(parseDistillation('{"question":"","answer":"A"}'), null);
  assert.equal(parseDistillation('{"question":"Q","answer":"   "}'), null);
});
