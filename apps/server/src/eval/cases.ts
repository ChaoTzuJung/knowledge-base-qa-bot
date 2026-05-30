import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Decision } from "./metrics.js";

export interface EvalCase {
  intent: string;
  /** Same intent phrased several ways; the first is keyword-friendly. */
  paraphrases: string[];
  /** Expected section ids (parser `file#slugify(heading)` format). Empty for refusals. */
  expected: string[];
  expectedDecision: Decision;
}

/**
 * Answer-level eval set. The "answer" cases reuse section ids validated by the
 * retrieval eval (paraphrase.ts); the "cannot_confirm" cases are deliberately
 * outside the knowledge base, so a correct system must refuse rather than invent.
 */
export const CASES: EvalCase[] = [
  {
    intent: "refund timing",
    expected: ["refund_policy.md#refund-timeline"],
    expectedDecision: "answer",
    paraphrases: [
      "How long do refunds take?",
      "When will I get my money back?",
      "time until reimbursement is processed",
    ],
  },
  {
    intent: "cancel an order",
    expected: ["refund_policy.md#cancellation-window"],
    expectedDecision: "answer",
    paraphrases: ["How do I cancel my order?", "stop an order before it ships"],
  },
  {
    intent: "expedited shipping speed",
    expected: ["shipping_faq.md#expedited-shipping"],
    expectedDecision: "answer",
    paraphrases: ["How fast is expedited shipping?", "express delivery turnaround time"],
  },
  {
    intent: "change email",
    expected: ["account_help.md#change-email-address"],
    expectedDecision: "answer",
    paraphrases: ["How do I change my email address?", "switch my login email"],
  },
  {
    intent: "out of scope: nearby restaurants",
    expected: [],
    expectedDecision: "cannot_confirm",
    paraphrases: ["Which restaurants are nearby?", "recommend a good place to eat"],
  },
  {
    intent: "out of scope: executive pay",
    expected: [],
    expectedDecision: "cannot_confirm",
    paraphrases: ["What is the CEO's salary?", "how much does your chief executive earn"],
  },
  {
    intent: "out of scope: weather",
    expected: [],
    expectedDecision: "cannot_confirm",
    paraphrases: ["What's the weather tomorrow?"],
  },
];

/** Path to the generated regression cases produced by `npm run eval:from-feedback`. */
const GENERATED_PATH = fileURLToPath(new URL("./cases.gen.json", import.meta.url));

/** Read the feedback-generated regression cases. Returns [] when absent/malformed. */
export function loadGeneratedCases(): EvalCase[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(GENERATED_PATH, "utf-8"));
    return Array.isArray(parsed) ? (parsed as EvalCase[]) : [];
  } catch {
    return [];
  }
}

/** The curated cases plus any feedback-generated regression cases. */
export function loadAllCases(): EvalCase[] {
  return [...CASES, ...loadGeneratedCases()];
}
