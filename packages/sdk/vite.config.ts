import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
    __DEFAULT_API_URL__: JSON.stringify(process.env.FLOOPER_API_URL ?? "http://localhost:8787"),
  },
  // `pnpm dev` serves index.html: a fake personal site for trying the widget.
  server: { port: 5174, strictPort: true },
  build: {
    // Two builds of the same code:
    //   flooper.js   IIFE for <script> tags; exposes window.Flooper and auto-inits
    //   flooper.mjs  ES module for bundlers: import { init } from "@flooper/sdk"
    lib: {
      entry: "src/index.ts",
      name: "Flooper",
      formats: ["iife", "es"],
      fileName: (format) => (format === "es" ? "flooper.mjs" : "flooper.js"),
    },
    target: "es2020",
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
  },
});
