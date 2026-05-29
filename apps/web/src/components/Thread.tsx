import { memo } from "react";
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { SendHorizontalIcon } from "lucide-react";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Render assistant text as Markdown (bold, lists, etc.) instead of showing raw
// "**" markers. memo() mirrors assistant-ui's canonical markdown-text component so
// streaming re-renders don't re-parse already-rendered messages. Styling comes from
// the `prose` container; we skip the registry's code-block components since KB
// answers are short prose without code blocks.
const MarkdownTextImpl = () => <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} />;
const MarkdownText = memo(MarkdownTextImpl);

const WELCOME_SUGGESTIONS = [
  "How long do refunds take?",
  "Can I change my email address?",
  "How fast is expedited shipping?",
  "Which restaurants are nearby?",
];

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport
        autoScroll
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <ThreadPrimitive.Empty>
          <WelcomeBlock />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
            SystemMessage: () => null,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function WelcomeBlock() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12">
      <h2 className="text-center text-lg font-medium text-foreground">
        Ask me anything from the indexed knowledge base.
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WELCOME_SUGGESTIONS.map((text) => (
          <ThreadPrimitive.Suggestion
            key={text}
            prompt={text}
            method="replace"
            autoSend
            className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-accent"
          >
            {text}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mx-auto max-w-3xl py-3">
      <div className="flex justify-end">
        <div
          data-testid="user-message"
          className="max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mx-auto max-w-3xl py-3">
      <div className="flex gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold">
          A
        </div>
        <div className="prose prose-sm max-w-none flex-1 break-words text-sm leading-relaxed text-foreground">
          <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <div className="border-t border-border bg-card px-6 py-4">
      <ComposerPrimitive.Root
        className={cn(
          "mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-border bg-background p-2",
          "focus-within:ring-2 focus-within:ring-ring",
        )}
      >
        <ComposerPrimitive.Input
          autoFocus
          placeholder="Write a message..."
          rows={1}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send asChild>
            <button
              type="submit"
              className="rounded-md p-2 text-primary transition hover:bg-accent disabled:opacity-50"
              aria-label="Send"
            >
              <SendHorizontalIcon className="h-4 w-4" />
            </button>
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className="rounded-md p-2 text-destructive transition hover:bg-accent"
              aria-label="Stop"
            >
              ◼
            </button>
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>
    </div>
  );
}
