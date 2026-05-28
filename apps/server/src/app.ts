import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { indexRoute } from "./routes/index.js";
import { chatRoute } from "./routes/chat.js";
import { chatStreamRoute } from "./routes/chatStream.js";
import { compareRoute } from "./routes/compare.js";

export const app = new Hono()
  .use("*", cors())
  .route("/", healthRoute)
  .route("/", indexRoute)
  .route("/", chatRoute)
  .route("/", chatStreamRoute)
  .route("/", compareRoute);

export type AppType = typeof app;
