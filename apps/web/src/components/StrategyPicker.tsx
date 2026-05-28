import type { Strategy } from "@kb/shared";
import { cn } from "@/lib/utils";

interface Props {
  value: Strategy;
  onChange: (s: Strategy) => void;
}

const OPTIONS: { value: Strategy; label: string; hint: string }[] = [
  { value: "markdown_kb", label: "Markdown KB", hint: "BM25 over heading sections" },
  { value: "vector_rag", label: "Vector RAG", hint: "Embeddings + HNSW (cosine)" },
];

export function StrategyPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Retrieval Strategy
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm transition",
              value === opt.value
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            <div className="font-medium text-foreground">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
