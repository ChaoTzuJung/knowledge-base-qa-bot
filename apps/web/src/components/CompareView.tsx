import { useState } from "react";
import { compareQuery } from "@/lib/api";
import type { ChatResult } from "@kb/shared";
import { cn } from "@/lib/utils";

interface CompareState {
  loading: boolean;
  error: string | null;
  markdown_kb: ChatResult | null;
  vector_rag: ChatResult | null;
  llm_index: ChatResult | null;
  lastQuery: string | null;
}

const EMPTY: CompareState = {
  loading: false,
  error: null,
  markdown_kb: null,
  vector_rag: null,
  llm_index: null,
  lastQuery: null,
};

export function CompareView() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<CompareState>(EMPTY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setState({ ...EMPTY, loading: true, lastQuery: query });
    try {
      const r = await compareQuery(query);
      setState({
        loading: false,
        error: null,
        markdown_kb: r.markdown_kb,
        vector_rag: r.vector_rag,
        llm_index: r.llm_index,
        lastQuery: query,
      });
    } catch (e) {
      setState({
        ...EMPTY,
        error: e instanceof Error ? e.message : String(e),
        lastQuery: query,
      });
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the same question against both strategies…"
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={state.loading}
          className={cn(
            "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition",
            state.loading ? "opacity-60" : "hover:opacity-90",
          )}
        >
          {state.loading ? "Comparing…" : "Compare"}
        </button>
      </form>

      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
        <ResultColumn title="Markdown KB (BM25)" result={state.markdown_kb} />
        <ResultColumn title="Vector RAG (HNSW)" result={state.vector_rag} />
        <ResultColumn title="LLM Index (router)" result={state.llm_index} rankMode />
      </div>
    </div>
  );
}

function ResultColumn({
  title,
  result,
  rankMode = false,
}: {
  title: string;
  result: ChatResult | null;
  rankMode?: boolean;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3 text-sm font-semibold">
        {title}
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {result ? (
          <>
            <div className="whitespace-pre-wrap leading-relaxed">{result.answer}</div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sources
              </div>
              {result.sources.length === 0 ? (
                <div className="text-xs text-muted-foreground">(none)</div>
              ) : (
                <ul className="space-y-2">
                  {result.sources.map((s) => (
                    <li key={s.source} className="rounded-md border border-border px-3 py-2 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <code className="font-mono text-[11px]">{s.source}</code>
                        <span className="text-[10px] text-muted-foreground">
                          {rankMode ? `rank ${s.score}` : `score ${s.score.toFixed(3)}`}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{s.heading}</div>
                      <div className="mt-1 text-foreground/80">{s.content}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No result yet.</div>
        )}
      </div>
    </section>
  );
}
