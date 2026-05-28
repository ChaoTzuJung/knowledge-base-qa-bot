import { useState } from "react";
import { buildIndex } from "@/lib/api";
import type { IndexResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IndexButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<IndexResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState("loading");
    setError(null);
    try {
      const r = await buildIndex();
      setResult(r);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Index
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "loading"}
        className={cn(
          "w-full rounded-md border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition",
          state === "loading" ? "opacity-60" : "hover:opacity-90",
        )}
      >
        {state === "loading" ? "Indexing…" : "Build Index"}
      </button>
      {result && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div>Markdown KB: {result.files_indexed} files, {result.sections_indexed} sections</div>
          <div>Vector: {result.vector_files_indexed} files, {result.chunks_indexed} chunks</div>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
