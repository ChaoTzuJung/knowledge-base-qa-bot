import type { Section } from "../../lib/types.js";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const TOKEN_RE = /[a-z0-9]+/g;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "from", "how",
  "i", "is", "it", "my", "of", "the", "to", "what", "when", "which",
]);

export function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(TOKEN_RE)) {
    const t = match[0];
    if (!STOP_WORDS.has(t)) tokens.push(t);
  }
  return tokens;
}

export function parseMarkdown(file: string, source: string): Section[] {
  const lines = source.split(/\r?\n/);
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
    sections.push({ id, file, heading, heading_path, content, tokens });
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
