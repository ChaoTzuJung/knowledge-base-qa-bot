import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "./grounding.js";

test("parseVerdict: grounded answer", () => {
  assert.deepEqual(parseVerdict('{"grounded": true, "unsupported": []}'), {
    grounded: true,
    unsupported: [],
  });
});

test("parseVerdict: ungrounded answer lists the unsupported claims", () => {
  assert.deepEqual(
    parseVerdict('{"grounded": false, "unsupported": ["refunds take 2 days", "free shipping"]}'),
    { grounded: false, unsupported: ["refunds take 2 days", "free shipping"] },
  );
});

test("parseVerdict: tolerates a ```json fence", () => {
  assert.deepEqual(parseVerdict('```json\n{"grounded": true, "unsupported": []}\n```'), {
    grounded: true,
    unsupported: [],
  });
});

test("parseVerdict: drops non-string entries in unsupported", () => {
  assert.deepEqual(parseVerdict('{"grounded": false, "unsupported": ["a", 5, null, "b"]}'), {
    grounded: false,
    unsupported: ["a", "b"],
  });
});

test("parseVerdict: fails OPEN on malformed / missing fields", () => {
  assert.deepEqual(parseVerdict("not json"), { grounded: true, unsupported: [] });
  assert.deepEqual(parseVerdict('{"unsupported": ["x"]}'), { grounded: true, unsupported: [] });
  assert.deepEqual(parseVerdict("[]"), { grounded: true, unsupported: [] });
});
