import { useAuiState } from "@assistant-ui/react";
import type { GroundingVerdict } from "@kb/shared";
import { cn } from "@/lib/utils";

function isVerdict(value: unknown): value is GroundingVerdict {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { grounded?: unknown }).grounded === "boolean"
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

function latestGrounding(messages: readonly unknown[]): GroundingVerdict | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as MinimalMessage | undefined;
    if (!m || m.role !== "assistant") continue;
    const parts = m.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part?.type === "data" && part.name === "grounding" && isVerdict(part.data)) {
        return part.data;
      }
    }
  }
  return null;
}

export function GroundingBadge() {
  const verdict = useAuiState((s) =>
    latestGrounding(s.thread.messages as readonly unknown[]),
  );

  if (!verdict) return null;

  return (
    <div
      data-testid="grounding-badge"
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        verdict.grounded
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="font-medium uppercase tracking-wide">Grounding</span>
      {verdict.grounded ? (
        <div className="mt-1">✓ All claims supported by the sources</div>
      ) : (
        <div className="mt-1">
          <div>⚠ Claim{verdict.unsupported.length === 1 ? "" : "s"} not found in the sources:</div>
          <ul className="mt-1 list-disc pl-4">
            {verdict.unsupported.map((claim, i) => (
              <li key={i}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
