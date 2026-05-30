import { useEffect, useMemo, useRef, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import type { SourceInfo } from "@kb/shared";
import { sendFeedback } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MinimalPart {
  type: string;
  name?: string;
  text?: string;
  data?: unknown;
}

interface MinimalMessage {
  role: string;
  parts?: readonly MinimalPart[];
}

interface Exchange {
  query: string;
  answer: string;
  sources: SourceInfo[];
}

function isSourcesPayload(value: unknown): value is { sources: SourceInfo[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { sources?: unknown }).sources)
  );
}

function textOf(parts: readonly MinimalPart[]): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim();
}

/** The latest answered exchange: the last assistant message's answer + retrieved
 *  sources, paired with the user question just before it. Null until an answer exists. */
function latestExchange(messages: readonly unknown[]): Exchange | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as MinimalMessage | undefined;
    if (!m || m.role !== "assistant") continue;
    const parts = m.parts ?? [];
    const answer = textOf(parts);
    if (!answer) return null;

    let sources: SourceInfo[] = [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      if (p?.type === "data" && p.name === "sources" && isSourcesPayload(p.data)) {
        sources = p.data.sources;
        break;
      }
    }

    let query = "";
    for (let k = i - 1; k >= 0; k--) {
      const u = messages[k] as MinimalMessage | undefined;
      if (u?.role === "user") {
        query = textOf(u.parts ?? []);
        break;
      }
    }

    return { query, answer, sources };
  }
  return null;
}

const REFUSE = "__refuse__"; // select sentinel for "should have refused"

export function FeedbackPanel() {
  // Select the stable messages slice, then derive the exchange with useMemo — the
  // useAuiState selector must return a stable reference (returning a freshly-built
  // object each call violates useSyncExternalStore's snapshot caching).
  const messages = useAuiState((s) => s.thread.messages as readonly unknown[]);
  const exchange = useMemo(() => latestExchange(messages), [messages]);

  const [picking, setPicking] = useState(false);
  const [expected, setExpected] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  // Reset the panel whenever a new answer arrives.
  const answerKey = exchange?.answer ?? null;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (answerKey !== lastKey.current) {
      lastKey.current = answerKey;
      setPicking(false);
      setExpected("");
      setStatus("idle");
    }
  }, [answerKey]);

  if (!exchange) return null;

  const send = async (rating: "up" | "down", expected_source?: string | null) => {
    setStatus("sending");
    try {
      await sendFeedback({
        rating,
        query: exchange.query,
        answer: exchange.answer,
        sources: exchange.sources,
        expected_source,
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div data-testid="feedback-panel" className="rounded-md border border-border bg-card px-3 py-2 text-xs">
      <div className="font-medium uppercase tracking-wide text-muted-foreground">Was this answer right?</div>

      {status === "done" ? (
        <div data-testid="feedback-recorded" className="mt-2 text-emerald-700">
          ✓ Thanks — feedback recorded.
        </div>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="feedback-up"
              disabled={status === "sending"}
              onClick={() => void send("up")}
              className="rounded-md border border-border px-2 py-1 transition hover:bg-accent disabled:opacity-50"
            >
              👍 Good
            </button>
            <button
              type="button"
              data-testid="feedback-down"
              disabled={status === "sending"}
              onClick={() => setPicking(true)}
              className={cn(
                "rounded-md border px-2 py-1 transition hover:bg-accent disabled:opacity-50",
                picking ? "border-amber-400 bg-amber-50" : "border-border",
              )}
            >
              👎 Wrong
            </button>
          </div>

          {picking && (
            <div className="mt-2 space-y-2">
              <label className="block text-muted-foreground">
                Which source should it have used?
              </label>
              <select
                data-testid="feedback-expected"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1"
              >
                <option value="">Pick a source…</option>
                {exchange.sources.map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source}
                  </option>
                ))}
                <option value={REFUSE}>None — it should have refused</option>
              </select>
              <button
                type="button"
                data-testid="feedback-submit"
                disabled={!expected || status === "sending"}
                onClick={() => void send("down", expected === REFUSE ? null : expected)}
                className="rounded-md bg-primary px-2 py-1 text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="mt-2 text-destructive">Could not send feedback. Try again.</div>
          )}
        </>
      )}
    </div>
  );
}
