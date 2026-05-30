import { openai } from "@ai-sdk/openai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { OPENAI_MODEL } from "../env.js";
import { contextualizeQuery, type Turn } from "../llm/contextualize.js";
import { verifyGrounding } from "../llm/grounding.js";
import { INJECTION_REFUSAL, detectInjection } from "../llm/safety.js";
import { SYSTEM_PROMPT } from "../llm/prompts.js";
import { retrieve } from "../strategies/query.js";

const MessagePart = z.object({ type: z.string() }).passthrough();

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  parts: z.array(MessagePart).optional(),
  content: z.union([z.string(), z.array(MessagePart)]).optional(),
});

const StreamBody = z
  .object({
    query: z.string().optional(),
    messages: z.array(UIMessageSchema).optional(),
    strategy: z.enum(["markdown_kb", "vector_rag", "hybrid", "llm_index"]).optional(),
  })
  .refine((v) => v.query || (v.messages && v.messages.length > 0), {
    message: "Provide either query or messages.",
  });

type StreamBodyType = z.infer<typeof StreamBody>;
type MessagePartType = z.infer<typeof MessagePart>;

function partText(p: MessagePartType): string | null {
  if (p.type !== "text") return null;
  const text = (p as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

function extractQuery(body: StreamBodyType): string {
  if (body.query) return body.query;
  const msgs = body.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== "user") continue;
    const candidates: MessagePartType[] = m.parts ?? (Array.isArray(m.content) ? m.content : []);
    const texts = candidates.map(partText).filter((t): t is string => t !== null);
    if (texts.length > 0) return texts.join(" ");
    if (typeof m.content === "string" && m.content.length > 0) return m.content;
  }
  return "";
}

function messageText(m: z.infer<typeof UIMessageSchema>): string {
  const candidates: MessagePartType[] = m.parts ?? (Array.isArray(m.content) ? m.content : []);
  const texts = candidates.map(partText).filter((t): t is string => t !== null);
  if (texts.length > 0) return texts.join(" ");
  if (typeof m.content === "string") return m.content;
  return "";
}

// Prior conversation turns, EXCLUDING the final user message (the current question).
// Used as short memory so the follow-up can be rewritten into a standalone query.
function extractHistory(body: StreamBodyType): Turn[] {
  const msgs = body.messages ?? [];
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx <= 0) return [];
  const turns: Turn[] = [];
  for (const m of msgs.slice(0, lastUserIdx)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = messageText(m).trim();
    if (text) turns.push({ role: m.role, text });
  }
  return turns;
}

function writeText(writer: UIMessageStreamWriter, id: string, text: string) {
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export const chatStreamRoute = new Hono().post(
  "/chat/stream",
  zValidator("json", StreamBody, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid body. Expect { query | messages, strategy? }" }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const body = c.req.valid("json");
    const strategy = body.strategy ?? "hybrid";
    const question = extractQuery(body);
    if (!question) return c.json({ error: "Empty query" }, 400);

    // Injection guard: refuse role-hijack / prompt-leak attempts before any
    // rewrite, retrieval, or LLM call.
    if (detectInjection(question)) {
      const refusalStream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "data-sources", id: "sources", data: { strategy, sources: [] } });
          writeText(writer, "refusal-text", INJECTION_REFUSAL);
        },
      });
      return createUIMessageStreamResponse({ stream: refusalStream });
    }

    // Conversation memory: rewrite the follow-up into a standalone query using
    // recent turns, then retrieve with that. Answer generation stays grounded on
    // the retrieved sources below.
    const history = extractHistory(body);
    const query = await contextualizeQuery(history, question);

    const retrieved = await retrieve(query, strategy);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({
          type: "data-sources",
          id: "sources",
          data: {
            strategy,
            sources: retrieved.sources,
          },
        });

        if (query !== question) {
          writer.write({
            type: "data-rewrite",
            id: "rewrite",
            data: { original: question, rewritten: query },
          });
        }

        if (retrieved.notIndexed) {
          const which =
            strategy === "markdown_kb" || strategy === "llm_index"
              ? "Markdown KB"
              : strategy === "vector_rag"
                ? "Vector"
                : "Hybrid";
          writeText(
            writer,
            "fallback-text",
            `The ${which} index has not been built yet. Call POST /index first.`,
          );
          return;
        }

        if (!retrieved.ok || !retrieved.prompt) {
          writeText(writer, "fallback-text", "I cannot confirm from the knowledge base.");
          return;
        }

        const result = streamText({
          model: openai(OPENAI_MODEL),
          system: SYSTEM_PROMPT,
          prompt: retrieved.prompt,
          temperature: 0,
        });
        writer.merge(
          result.toUIMessageStream({
            messageMetadata: () => ({ strategy, sources: retrieved.sources }),
            onFinish: ({ responseMessage }) => {
              console.log(
                `[/chat/stream] finished strategy=${strategy} parts=${responseMessage.parts.length}`,
              );
            },
          }),
        );

        // Once the answer is complete, verify it against the retrieved context and
        // emit a trailing grounding verdict. Awaiting result.text here keeps the
        // stream open until the data-grounding part is written.
        const fullText = await result.text;
        const grounding = await verifyGrounding(fullText, retrieved.context ?? "");
        writer.write({ type: "data-grounding", id: "grounding", data: grounding });
      },
      onError: (err) => {
        console.error("[/chat/stream] error:", err);
        return err instanceof Error ? err.message : "Stream error";
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);
