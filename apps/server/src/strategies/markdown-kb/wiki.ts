import fs from "node:fs";
import { WIKI_DIR, WIKI_INDEX_PATH } from "../../lib/paths.js";
import type { Section } from "../../lib/types.js";

/** Anchor for a section: the slug portion of its id (`<file>#<slug>`). */
function anchorOf(section: Section): string {
  const hash = section.id.indexOf("#");
  return hash === -1 ? "" : section.id.slice(hash + 1);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Render `wiki/index.md` from the indexed sections: a browsable, hierarchical
 * table of contents grouped by source file, linking back to `docs/<file>#<anchor>`.
 *
 * Pure — no filesystem access — so it is unit-testable.
 */
export function generateWikiIndex(sections: Section[]): string {
  const fileCount = new Set(sections.map((s) => s.file)).size;
  const header = [
    "# Knowledge Base Index",
    "",
    "<!-- Generated from .kb/index.json by `npm run generate:wiki` and on every POST /build-index. Do not edit by hand. -->",
    "",
    `**${plural(fileCount, "document")} · ${plural(sections.length, "section")}**`,
  ];

  if (sections.length === 0) {
    return [...header, "", "_No documents indexed yet. Run `POST /build-index` first._", ""].join("\n");
  }

  // Group sections by file, preserving first-seen order (buildIndex sorts files
  // by name and keeps each file's sections in document order).
  const byFile = new Map<string, Section[]>();
  for (const s of sections) {
    const list = byFile.get(s.file) ?? [];
    list.push(s);
    byFile.set(s.file, list);
  }

  const blocks: string[] = [];
  for (const [file, fileSections] of byFile) {
    const lines = [`## ${file}`, ""];
    for (const s of fileSections) {
      const indent = "  ".repeat(Math.max(0, s.heading_path.length - 1));
      lines.push(`${indent}- [${s.heading}](../docs/${file}#${anchorOf(s)})`);
    }
    blocks.push(lines.join("\n"));
  }

  return [...header, "", blocks.join("\n\n"), ""].join("\n");
}

/** Write the generated wiki index to `wiki/index.md` (creating `wiki/` if needed). */
export function writeWikiIndex(sections: Section[]): void {
  fs.mkdirSync(WIKI_DIR, { recursive: true });
  fs.writeFileSync(WIKI_INDEX_PATH, generateWikiIndex(sections));
}
