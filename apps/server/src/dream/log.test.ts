import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTurn } from "./log.js";
import { INJECTION_REFUSAL } from "../llm/safety.js";

const SOURCES = ["refund_policy.md#refund-timeline"];

test("classifyTurn: grounded answer with sources → VALID", () => {
  assert.equal(classifyTurn("Refunds take 5-7 days.", SOURCES, { grounded: true, unsupported: [] }), "VALID");
  // No grounding verdict supplied (e.g. compare path) but sources present → VALID.
  assert.equal(classifyTurn("Refunds take 5-7 days.", SOURCES, undefined), "VALID");
});

test("classifyTurn: unsupported claims → DEFAULT", () => {
  assert.equal(
    classifyTurn("Refunds take 5-7 days and are free.", SOURCES, { grounded: false, unsupported: ["free"] }),
    "DEFAULT",
  );
});

test("classifyTurn: refusals and empty-source answers → REJECTED", () => {
  assert.equal(classifyTurn("I cannot confirm from the knowledge base.", [], undefined), "REJECTED");
  assert.equal(classifyTurn(INJECTION_REFUSAL, [], undefined), "REJECTED");
  assert.equal(
    classifyTurn("The Hybrid index has not been built yet. Call POST /index first.", [], undefined),
    "REJECTED",
  );
  // An answer with no cited sources is never consolidation-worthy.
  assert.equal(classifyTurn("Some ungrounded answer.", [], { grounded: true, unsupported: [] }), "REJECTED");
});
