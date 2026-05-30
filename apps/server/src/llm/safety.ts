/** Fixed reply when a query is blocked as a prompt-injection / role-hijack attempt. */
export const INJECTION_REFUSAL = "I can only answer questions about the knowledge base.";

// Patterns target clear instruction-override / prompt-leak / role-hijack attempts.
// They deliberately avoid plain keywords ("password", "api key") so legitimate
// support questions (e.g. "How do I reset my password?") are never blocked.
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|system|instructions?)\b/i,
  /\boverride\s+(your\s+|the\s+)?(instructions?|rules?|system)\b/i,
  /\b(reveal|show|print|repeat|output|display|leak|expose)\b[^.?!]*\b(system\s+prompt|your\s+(prompt|instructions|rules)|the\s+prompt)\b/i,
  /\bsystem\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\bpretend\s+(to\s+be|you\s+are|that)\b/i,
];

/** True when the query looks like a prompt-injection / role-hijack attempt. */
export function detectInjection(query: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(query));
}

// Matches an inline citation, with or without a leading "Source:" label, capturing
// the source id. Mirrors the [filename.md#heading-slug] format the prompt mandates.
const CITATION_RE = /\s*\[(?:source:\s*)?([a-z0-9_-]+\.md#[a-z0-9-]+)\]/gi;

/**
 * Defend citation integrity on a generated answer:
 *  - strip inline citations whose id is NOT in the retrieved set (hallucinated), and
 *  - if no valid citation remains, backfill the top retrieved source.
 * Pure; safe to run on any answer string.
 */
export function sanitizeCitations(answer: string, validIds: string[]): string {
  const valid = new Set(validIds);
  let kept = 0;
  let out = answer.replace(CITATION_RE, (match, id: string) => {
    if (valid.has(id)) {
      kept += 1;
      return match;
    }
    return ""; // drop the hallucinated citation (and its leading space)
  });
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
  if (kept === 0 && validIds.length > 0 && out.length > 0) {
    out = `${out} [${validIds[0]}]`;
  }
  return out;
}
