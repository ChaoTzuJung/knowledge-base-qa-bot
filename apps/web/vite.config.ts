import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:8000",
      "/build-index": "http://localhost:8000",
      "/chat": "http://localhost:8000",
      "/compare": "http://localhost:8000",
      "/feedback": "http://localhost:8000",
    },
  },
});
