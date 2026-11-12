import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In production the Worker serves the portal, /api and /sdk from one
    // origin. The proxy recreates that locally, so cookies and same-origin
    // rules behave the same in dev as in prod, and review mode on the landing
    // page can load /sdk/review.js (built into the Worker's assets by
    // `pnpm --filter @flooper/portal build`).
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/sdk": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
