import { useThread } from "@assistant-ui/react";
import type { SourceInfo, SourcesPayload, Strategy } from "@/lib/types";

function isSourcesPayload(value: unknown): value is SourcesPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "sources" &&
    Array.isArray((value as { sources?: unknown }).sources)
  );
}

function latestSources(messages: readonly { role: string; metadata?: { unstable_data?: readonly unknown[] } }[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const data = m.metadata?.unstable_data ?? [];
    for (let j = data.length - 1; j >= 0; j--) {
      const part = data[j];
      if (isSourcesPayload(part)) return part;
    }
  }
  return null;
}

export function SourcesPanel() {
  const payload = useThread((s) =>
    latestSources(s.messages as readonly { role: string; metadata?: { unstable_data?: readonly unknown[] } }[]),
  );

  const sources: SourceInfo[] = payload?.sources ?? [];
  const strategy: Strategy | undefined = payload?.strategy;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sources
        </div>
        {strategy && (
          <div className="text-xs text-muted-foreground">{strategy}</div>
        )}
      </div>
      {sources.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          Sources will appear here after you ask a question.
        </div>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.source}
              className="rounded-md border border-border bg-card px-3 py-2 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2">
                <code className="font-mono text-[11px] text-foreground">{s.source}</code>
                <span className="text-[10px] text-muted-foreground">
                  score {s.score.toFixed(3)}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">{s.heading}</div>
              <div className="mt-1 text-foreground/80">{s.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
