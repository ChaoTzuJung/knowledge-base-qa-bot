import { test } from "node:test";
import assert from "node:assert/strict";
import type { Section } from "../../lib/types.js";
import { buildCatalog, parseSelection } from "./router.js";

function section(id: string, heading_path: string[]): Section {
  return { id, file: id.split("#")[0], heading: heading_path.at(-1) ?? "", heading_path, content: "", tokens: [] };
}

test("buildCatalog: one line per section with id and breadcrumb", () => {
  const catalog = buildCatalog([
    section("refund_policy.md#refund-timeline", ["Refund Policy", "Refund Timeline"]),
    section("account_help.md#change-email-address", ["Account Help", "Change Email Address"]),
  ]);
  assert.equal(
    catalog,
    "- refund_policy.md#refund-timeline — Refund Policy > Refund Timeline\n" +
      "- account_help.md#change-email-address — Account Help > Change Email Address",
  );
});

const VALID = new Set(["a.md#x", "b.md#y", "c.md#z", "d.md#w"]);

test("parseSelection: keeps valid ids in order", () => {
  assert.deepEqual(parseSelection('["b.md#y", "a.md#x"]', VALID), ["b.md#y", "a.md#x"]);
});

test("parseSelection: tolerates a ```json fence", () => {
  assert.deepEqual(parseSelection('```json\n["a.md#x"]\n```', VALID), ["a.md#x"]);
});

test("parseSelection: drops hallucinated ids not in the catalog", () => {
  assert.deepEqual(parseSelection('["a.md#x", "made-up.md#nope"]', VALID), ["a.md#x"]);
});

test("parseSelection: dedupes and caps at 3", () => {
  assert.deepEqual(
    parseSelection('["a.md#x", "a.md#x", "b.md#y", "c.md#z", "d.md#w"]', VALID),
    ["a.md#x", "b.md#y", "c.md#z"],
  );
});

test("parseSelection: malformed or non-array output yields []", () => {
  assert.deepEqual(parseSelection("not json", VALID), []);
  assert.deepEqual(parseSelection('{"id":"a.md#x"}', VALID), []);
  assert.deepEqual(parseSelection("[]", VALID), []);
});
