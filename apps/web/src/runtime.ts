import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { useRef } from "react";
import type { Strategy } from "./lib/types";

export function useKbRuntime(strategy: Strategy) {
  const strategyRef = useRef(strategy);
  strategyRef.current = strategy;

  return useChatRuntime({
    api: "/chat/stream",
    body: { get strategy() { return strategyRef.current; } } as { strategy: Strategy },
  });
}
