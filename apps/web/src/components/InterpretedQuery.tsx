import { useAuiState } from "@assistant-ui/react";
import type { RewritePayload } from "@kb/shared";

function isRewritePayload(value: unknown): value is RewritePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { rewritten?: unknown }).rewritten === "string"
  );
}

interface MinimalPart {
  type: string;
  name?: string;
  data?: unknown;
}

interface MinimalMessage {
  role: string;
  parts?: readonly MinimalPart[];
}

function latestRewrite(messages: readonly unknown[]): RewritePayload | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as MinimalMessage | undefined;
    if (!m || m.role !== "assistant") continue;
    const parts = m.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part?.type === "data" && part.name === "rewrite" && isRewritePayload(part.data)) {
        return part.data;
      }
    }
  }
  return null;
}

export function InterpretedQuery() {
  const rewrite = useAuiState((s) =>
    latestRewrite(s.thread.messages as readonly unknown[]),
  );

  if (!rewrite) return null;

  return (
    <div
      data-testid="interpreted-query"
      className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-medium uppercase tracking-wide">Interpreted as</span>
      <div className="mt-1 text-foreground/80">{rewrite.rewritten}</div>
    </div>
  );
}
