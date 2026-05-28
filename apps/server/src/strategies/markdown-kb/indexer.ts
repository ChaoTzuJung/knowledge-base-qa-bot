import fs from "node:fs";
import path from "node:path";
import { DOCS_DIR, INDEX_PATH, KB_DIR } from "../../lib/paths.js";
import type { PersistedIndex, Section } from "../../lib/types.js";
import { parseMarkdown } from "./parser.js";

export const state: {
  sections: Section[];
  doc_freq: Record<string, number>;
  avg_doc_len: number;
  files_indexed: number;
} = {
  sections: [],
  doc_freq: {},
  avg_doc_len: 0,
  files_indexed: 0,
};

function rebuildStats() {
  const files = new Set(state.sections.map((s) => s.file));
  state.files_indexed = files.size;

  const doc_freq: Record<string, number> = {};
  let totalLen = 0;
  for (const section of state.sections) {
    totalLen += section.tokens.length;
    const seen = new Set<string>();
    for (const t of section.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      doc_freq[t] = (doc_freq[t] ?? 0) + 1;
    }
  }
  state.doc_freq = doc_freq;
  state.avg_doc_len = state.sections.length > 0 ? totalLen / state.sections.length : 0;
}

function writeIndexJson() {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  const payload: PersistedIndex = {
    sections: state.sections,
    stats: {
      files_indexed: state.files_indexed,
      sections_indexed: state.sections.length,
      avg_doc_len: state.avg_doc_len,
      doc_freq: state.doc_freq,
    },
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(payload, null, 2));
}

export function loadIndexJson(): { files_indexed: number; sections_indexed: number } {
  if (!fs.existsSync(INDEX_PATH)) {
    state.sections = [];
    rebuildStats();
    return { files_indexed: 0, sections_indexed: 0 };
  }
  const payload = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as PersistedIndex;
  state.sections = payload.sections;
  rebuildStats();
  return { files_indexed: state.files_indexed, sections_indexed: state.sections.length };
}

export function buildIndex(): { files_indexed: number; sections_indexed: number } {
  fs.mkdirSync(KB_DIR, { recursive: true });

  if (!fs.existsSync(DOCS_DIR)) {
    state.sections = [];
    rebuildStats();
    writeIndexJson();
    return { files_indexed: 0, sections_indexed: 0 };
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  const sections: Section[] = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
    sections.push(...parseMarkdown(file, source));
  }

  state.sections = sections;
  rebuildStats();
  writeIndexJson();
  return { files_indexed: state.files_indexed, sections_indexed: state.sections.length };
}

export function isIndexed(): boolean {
  return state.sections.length > 0;
}
