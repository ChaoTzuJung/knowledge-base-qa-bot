import fs from "node:fs";
import { DREAM_DIR, DREAM_LOG_PATH } from "../lib/paths.js";
import { INJECTION_REFUSAL } from "../llm/safety.js";
import type { GroundingVerdict, SourceInfo, Strategy } from "../lib/types.js";

/**
 * Outcome tag for an answered turn, reused by the Dream loop to decide what is
 * safe to consolidate.
 *  - VALID    — grounded answer backed by sources; eligible for consolidation.
 *  - DEFAULT  — answered, but the grounding verifier flagged unsupported claims.
 *  - REJECTED — a refusal (injection guard / "I cannot confirm" / index not built)
 *               or an answer with no sources.
 */
export type TurnStatus = "VALID" | "DEFAULT" | "REJECTED";

export interface LoggedTurn {
  ts: string;
  query: string;
  answer: string;
  strategy: string;
  status: TurnStatus;
  sources: string[];
}

function isRefusal(answer: string): boolean {
  const a = answer.trim();
  return (
    a === INJECTION_REFUSAL ||
    a.startsWith("I cannot confirm") ||
    a.includes("index has not been built")
  );
}

/** Classify a turn's outcome from its answer, cited source ids, and grounding verdict. Pure. */
export function classifyTurn(
  answer: string,
  sources: string[],
  grounding: GroundingVerdict | undefined,
): TurnStatus {
  if (isRefusal(answer) || sources.length === 0) return "REJECTED";
  if (grounding && grounding.grounded === false) return "DEFAULT";
  return "VALID";
}

export interface LogTurnInput {
  ts: string;
  query: string;
  answer: string;
  strategy: Strategy | string;
  sources: SourceInfo[];
  grounding?: GroundingVerdict;
}

/**
 * Append one turn to the JSONL log. Best-effort and synchronous: any failure is
 * swallowed and logged so that turn logging can never break a chat response.
 */
export function logTurn(input: LogTurnInput): void {
  try {
    const sourceIds = input.sources.map((s) => s.source);
    const turn: LoggedTurn = {
      ts: input.ts,
      query: input.query,
      answer: input.answer,
      strategy: input.strategy,
      status: classifyTurn(input.answer, sourceIds, input.grounding),
      sources: sourceIds,
    };
    fs.mkdirSync(DREAM_DIR, { recursive: true });
    fs.appendFileSync(DREAM_LOG_PATH, `${JSON.stringify(turn)}\n`);
  } catch (err) {
    console.error("[dream] logTurn failed (ignored):", err);
  }
}

/** Read the turn log, skipping any malformed lines. Returns [] when absent. */
export function readTurns(): LoggedTurn[] {
  if (!fs.existsSync(DREAM_LOG_PATH)) return [];
  const turns: LoggedTurn[] = [];
  for (const line of fs.readFileSync(DREAM_LOG_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      turns.push(JSON.parse(trimmed) as LoggedTurn);
    } catch {
      // Skip a corrupt line rather than failing the whole run.
    }
  }
  return turns;
}
