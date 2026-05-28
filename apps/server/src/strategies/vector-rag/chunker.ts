import type { Chunk } from "../../lib/types.js";
import { parseMarkdown } from "../markdown-kb/parser.js";

const MAX_CHARS = 1500;
const OVERLAP_CHARS = 200;

export function chunkFile(file: string, source: string): Omit<Chunk, "label">[] {
  const sections = parseMarkdown(file, source);
  const chunks: Omit<Chunk, "label">[] = [];

  for (const section of sections) {
    if (section.content.trim().length === 0) continue;
    if (section.content.length <= MAX_CHARS) {
      chunks.push({
        id: section.id,
        file: section.file,
        heading: section.heading,
        heading_path: section.heading_path,
        content: section.content,
      });
      continue;
    }
    let start = 0;
    let partIdx = 0;
    while (start < section.content.length) {
      const end = Math.min(start + MAX_CHARS, section.content.length);
      const text = section.content.slice(start, end);
      chunks.push({
        id: `${section.id}::part-${partIdx}`,
        file: section.file,
        heading: section.heading,
        heading_path: section.heading_path,
        content: text,
      });
      partIdx += 1;
      if (end === section.content.length) break;
      start = end - OVERLAP_CHARS;
    }
  }

  return chunks;
}
