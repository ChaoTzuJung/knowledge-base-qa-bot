import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { useMemo, useRef } from "react";
import type { Strategy } from "./lib/types";

export function useKbRuntime(strategy: Strategy) {
  const strategyRef = useRef(strategy);
  strategyRef.current = strategy;

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/chat/stream",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...(body ?? {}), messages, strategy: strategyRef.current },
        }),
      }),
    [],
  );

  return useChatRuntime({ transport });
}
