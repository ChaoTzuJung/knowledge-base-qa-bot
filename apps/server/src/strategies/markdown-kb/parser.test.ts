import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter, parseMarkdown, slugify, tokenize } from "./parser.js";
import { DEFAULT_PRIORITY } from "../authority.js";

test("tokenize: English words, lowercased, stopwords removed", () => {
  assert.deepEqual(tokenize("How do I reset my password"), ["reset", "password"]);
});

test("tokenize: CJK emits character unigrams + adjacent bigrams", () => {
  // Regression: the old ASCII-only /[a-z0-9]+/ regex dropped CJK entirely,
  // returning [] for any Chinese query so markdown_kb/hybrid could never match.
  assert.deepEqual(tokenize("退款政策"), [
    "退", "退款", "款", "款政", "政", "政策", "策",
  ]);
});

test("tokenize: mixed CJK + ASCII keeps both", () => {
  assert.deepEqual(tokenize("退款 refund"), ["退", "退款", "款", "refund"]);
});

test("tokenize: CJK query is never empty", () => {
  assert.ok(tokenize("如何申請退款？").length > 0);
});

test("slugify: ASCII heading unchanged from before", () => {
  assert.equal(slugify("How to Request a Refund"), "how-to-request-a-refund");
});

test("slugify: CJK characters are preserved, not stripped", () => {
  assert.equal(slugify("退款政策"), "退款政策");
});

test("slugify: distinct CJK headings produce distinct slugs (no collision)", () => {
  // Regression: both used to strip to "" → "section" → identical ids.
  assert.notEqual(slugify("退款政策"), slugify("帳號設定"));
});

test("slugify: mixed CJK + ASCII", () => {
  assert.equal(slugify("退款 Policy"), "退款-policy");
});

test("slugify: punctuation-only still falls back to 'section'", () => {
  assert.equal(slugify("！？，。"), "section");
});

test("parseFrontMatter: source_type maps to a priority and is stripped from the body", () => {
  const { priority, body } = parseFrontMatter("---\nsource_type: policy\n---\n# Title\nBody");
  assert.equal(priority, 3);
  assert.equal(body, "# Title\nBody");
});

test("parseFrontMatter: explicit numeric priority overrides source_type", () => {
  assert.equal(parseFrontMatter("---\npriority: 2\nsource_type: chat\n---\nx").priority, 2);
});

test("parseFrontMatter: no front matter → default priority, body unchanged", () => {
  const { priority, body } = parseFrontMatter("# Title\nBody");
  assert.equal(priority, DEFAULT_PRIORITY);
  assert.equal(body, "# Title\nBody");
});

test("parseMarkdown: sections inherit the file's front-matter priority", () => {
  const sections = parseMarkdown("policy.md", "---\nsource_type: policy\n---\n# A\nx\n\n# B\ny");
  assert.equal(sections.length, 2);
  assert.ok(sections.every((s) => s.priority === 3));
});

test("parseMarkdown: untagged file → default priority", () => {
  const sections = parseMarkdown("notes.md", "# A\nx");
  assert.equal(sections[0].priority, DEFAULT_PRIORITY);
});

test("parseMarkdown: CJK-headed sections get distinct ids and non-empty tokens", () => {
  const md = ["# 退款政策", "我們在七天內處理退款。", "", "# 帳號設定", "你可以變更電子郵件。"].join("\n");
  const sections = parseMarkdown("help.md", md);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].id, "help.md#退款政策");
  assert.equal(sections[1].id, "help.md#帳號設定");
  assert.notEqual(sections[0].id, sections[1].id);
  assert.ok(sections[0].tokens.length > 0);
  assert.ok(sections[0].tokens.includes("退款"));
});
