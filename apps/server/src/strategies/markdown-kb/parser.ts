import type { Section } from "../../lib/types.js";
import { DEFAULT_PRIORITY, priorityForSourceType } from "../authority.js";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
// Leading YAML-ish front matter: a `---` fence, key: value lines, a closing `---`.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// CJK characters we keep as meaningful tokens: CJK ideographs (+ Extension A and
// compatibility forms), Japanese kana, and Hangul syllables. All are in the BMP,
// so indexing/slicing a JS string by code unit is safe (no surrogate pairs).
const CJK = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\uac00-\\ud7af";
const CJK_CHAR_RE = new RegExp(`[${CJK}]`);
// A token run is either an ASCII alphanumeric word OR a maximal CJK run. The two
// never mix, so the first character of a run tells us which branch to take.
const TOKEN_RE = new RegExp(`[a-z0-9]+|[${CJK}]+`, "g");
// Slug-safe characters: ASCII alphanumerics plus CJK. Anything else collapses to "-".
const SLUG_STRIP_RE = new RegExp(`[^a-z0-9${CJK}]+`, "g");

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "from", "how",
  "i", "is", "it", "my", "of", "the", "to", "what", "when", "which",
]);

export function slugify(text: string): string {
  // Keep CJK characters in the slug. Without this, an all-CJK heading (e.g.
  // "退款政策") would strip to "" and fall back to "section", so every CJK-headed
  // section would collide on the id "<file>#section" — breaking citations,
  // incremental-index reuse, and llm_index id mapping.
  const slug = text.toLowerCase().replace(SLUG_STRIP_RE, "-").replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(TOKEN_RE)) {
    const run = match[0];
    if (CJK_CHAR_RE.test(run[0])) {
      // CJK text has no spaces between words. Emit character unigrams plus
      // adjacent bigrams: unigrams keep recall high, bigrams capture short
      // compounds (e.g. "退款" within "退款政策") and lift retrieval precision.
      for (let i = 0; i < run.length; i++) {
        tokens.push(run[i]);
        if (i + 1 < run.length) tokens.push(run.slice(i, i + 2));
      }
    } else if (!STOP_WORDS.has(run)) {
      tokens.push(run);
    }
  }
  return tokens;
}

/**
 * Strip a leading front-matter block and derive the file's authority priority
 * from it. Supports an explicit numeric `priority:` or a named `source_type:`
 * (mapped via authority.ts). Files without front matter use the default priority.
 */
export function parseFrontMatter(source: string): { priority: number; body: string } {
  const m = source.match(FRONT_MATTER_RE);
  if (!m) return { priority: DEFAULT_PRIORITY, body: source };

  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }

  const explicit = Number(fields.priority);
  const priority = Number.isFinite(explicit) && fields.priority !== undefined
    ? explicit
    : priorityForSourceType(fields.source_type);

  return { priority, body: source.slice(m[0].length) };
}

export function parseMarkdown(file: string, source: string): Section[] {
  const { priority, body } = parseFrontMatter(source);
  const lines = body.split(/\r?\n/);
  const sections: Section[] = [];

  let headingStack: { level: number; text: string }[] = [];
  let currentHeading: string | null = null;
  let currentHeadingPath: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const content = buffer.join("\n").trim();
    const heading = currentHeading;
    const heading_path = [...currentHeadingPath];
    const id = `${file}#${slugify(heading)}`;
    const tokens = tokenize(`${heading_path.join(" ")} ${content}`);
    sections.push({ id, file, heading, heading_path, content, tokens, priority });
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      const level = m[1].length;
      const text = m[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      currentHeading = text;
      currentHeadingPath = headingStack.map((h) => h.text);
      buffer = [];
    } else {
      if (currentHeading !== null) buffer.push(line);
    }
  }
  flush();

  return sections;
}
