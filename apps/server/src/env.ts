import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[env] OPENAI_API_KEY is not set. /chat and /chat/stream will fail until you export it."
  );
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;
export const PORT = Number(process.env.PORT ?? 8000);
