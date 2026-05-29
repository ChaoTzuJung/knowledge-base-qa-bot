import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertRaw,
  decodeEntities,
  htmlToMarkdown,
  outputName,
  titleFromFilename,
  txtToMarkdown,
} from "./import-raw.js";

test("decodeEntities decodes the basic HTML entities", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; it&#39;s&nbsp;x"), 'a & b <c> "d" it\'s x');
});

test("titleFromFilename turns a slug-ish base name into Title Case", () => {
  assert.equal(titleFromFilename("warranty_policy"), "Warranty Policy");
  assert.equal(titleFromFilename("quick-notes"), "Quick Notes");
  assert.equal(titleFromFilename("FAQ"), "FAQ");
});

test("outputName slugifies the base name and adds .md", () => {
  assert.equal(outputName("Example Policy.HTML"), "example-policy.md");
  assert.equal(outputName("quick_notes.txt"), "quick-notes.md");
});

test("htmlToMarkdown converts headings, paragraphs, and lists", () => {
  const html = `
    <h1>Title</h1>
    <p>First paragraph.</p>
    <h2>Sub</h2>
    <ul><li>one</li><li>two</li></ul>
  `;
  const md = htmlToMarkdown(html);
  assert.match(md, /^# Title$/m);
  assert.match(md, /^## Sub$/m);
  assert.match(md, /^First paragraph\.$/m);
  assert.match(md, /^- one$/m);
  assert.match(md, /^- two$/m);
});

test("htmlToMarkdown drops script/style blocks and decodes entities", () => {
  const html = `<style>p { color: red }</style><h1>Hi &amp; Bye</h1><script>alert(1)</script><p>Body</p>`;
  const md = htmlToMarkdown(html);
  assert.equal(md.includes("color: red"), false);
  assert.equal(md.includes("alert(1)"), false);
  assert.match(md, /^# Hi & Bye$/m);
});

test("htmlToMarkdown collapses 3+ blank lines and trims line indentation", () => {
  const md = htmlToMarkdown("<p>a</p>\n\n\n\n<p>b</p>");
  assert.equal(md.includes("\n\n\n"), false);
  // no leading indentation leaked onto content lines
  assert.equal(/^[ \t]+\S/m.test(md), false);
});

test("txtToMarkdown normalizes newlines and trims", () => {
  assert.equal(txtToMarkdown("  line one\r\n\r\n\r\n\r\nline two  "), "line one\n\nline two");
});

test("convertRaw prepends front matter with the original source filename", () => {
  const out = convertRaw("warranty_policy.html", "<h1>Warranty</h1><p>Body</p>");
  assert.match(out, /^---\nsource: warranty_policy\.html\ntitle: Warranty Policy\n---\n/);
});

test("convertRaw injects an H1 from the filename when the body has no heading", () => {
  const out = convertRaw("quick_notes.txt", "just some plain text with no heading");
  // front matter, then an injected heading, then the body
  assert.match(out, /---\n\n# Quick Notes\n\njust some plain text/);
});

test("convertRaw keeps the existing heading when one is already present", () => {
  const out = convertRaw("policy.html", "<h1>Real Heading</h1><p>x</p>");
  assert.equal(out.includes("# Policy\n"), false); // no filename-derived heading injected
  assert.match(out, /^# Real Heading$/m);
});

test("convertRaw always ends with a single trailing newline", () => {
  const out = convertRaw("notes.txt", "hello");
  assert.equal(out.endsWith("\n"), true);
  assert.equal(out.endsWith("\n\n"), false);
});
