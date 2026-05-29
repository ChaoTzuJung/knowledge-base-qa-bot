import { useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/Thread";
import { StrategyPicker } from "@/components/StrategyPicker";
import { IndexButton } from "@/components/IndexButton";
import { SourcesPanel } from "@/components/SourcesPanel";
import { InterpretedQuery } from "@/components/InterpretedQuery";
import { CompareView } from "@/components/CompareView";
import { useKbRuntime } from "@/runtime";
import type { Strategy } from "@kb/shared";
import { cn } from "@/lib/utils";

type Mode = "chat" | "compare";

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [strategy, setStrategy] = useState<Strategy>("hybrid");
  const runtime = useKbRuntime(strategy);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">Knowledge Base Q&amp;A Bot</h1>
          <p className="text-xs text-muted-foreground">
            Grounded answers over local Markdown docs. Sources are streamed first, then tokens.
          </p>
        </div>
        <div className="flex rounded-md border border-border bg-card p-1 text-sm">
          {(["chat", "compare"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1 transition",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {m === "chat" ? "Chat" : "Compare"}
            </button>
          ))}
        </div>
      </header>

      {mode === "chat" ? (
        <AssistantRuntimeProvider runtime={runtime}>
          <div className="grid flex-1 grid-cols-[1fr_320px] overflow-hidden">
            <div className="flex h-full flex-col overflow-hidden">
              <Thread />
            </div>
            <aside className="overflow-y-auto border-l border-border bg-muted/20 p-4 space-y-4">
              <IndexButton />
              <StrategyPicker value={strategy} onChange={setStrategy} />
              <InterpretedQuery />
              <SourcesPanel />
            </aside>
          </div>
        </AssistantRuntimeProvider>
      ) : (
        <CompareView />
      )}
    </div>
  );
}
