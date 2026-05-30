import assert from "node:assert/strict";
import { test } from "node:test";
import type { Section } from "../../lib/types.js";
import { generateWikiIndex } from "./wiki.js";

function section(file: string, heading: string, heading_path: string[]): Section {
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { id: `${file}#${slug}`, file, heading, heading_path, content: "", tokens: [], priority: 1 };
}

test("generateWikiIndex groups sections under one heading per file", () => {
  const md = generateWikiIndex([
    section("refund_policy.md", "Refund Policy", ["Refund Policy"]),
    section("account_help.md", "Account Help", ["Account Help"]),
  ]);
  assert.match(md, /^## refund_policy\.md$/m);
  assert.match(md, /^## account_help\.md$/m);
});

test("generateWikiIndex nests sub-sections by heading_path depth", () => {
  const md = generateWikiIndex([
    section("refund_policy.md", "Refund Policy", ["Refund Policy"]),
    section("refund_policy.md", "Refund timeline", ["Refund Policy", "Refund timeline"]),
  ]);
  // Top-level heading: no indentation. Nested heading: two-space indent.
  assert.match(md, /^- \[Refund Policy\]/m);
  assert.match(md, /^ {2}- \[Refund timeline\]/m);
});

test("generateWikiIndex links back to docs with the section's id slug as anchor", () => {
  const md = generateWikiIndex([
    section("account_help.md", "Change email address", ["Account Help", "Change email address"]),
  ]);
  assert.match(md, /\(\.\.\/docs\/account_help\.md#change-email-address\)/);
});

test("generateWikiIndex reports document and section counts", () => {
  const md = generateWikiIndex([
    section("a.md", "A", ["A"]),
    section("a.md", "A sub", ["A", "A sub"]),
    section("b.md", "B", ["B"]),
  ]);
  assert.match(md, /\*\*2 documents · 3 sections\*\*/);
});

test("generateWikiIndex falls back to a placeholder when nothing is indexed", () => {
  const md = generateWikiIndex([]);
  assert.match(md, /\*\*0 documents · 0 sections\*\*/);
  assert.match(md, /_No documents indexed yet\./);
  assert.equal(md.includes("## "), false);
});
