import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In production the Worker serves the portal and /api from one origin. The
    // proxy recreates that locally, so cookies and same-origin rules behave the
    // same in dev as in prod.
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
