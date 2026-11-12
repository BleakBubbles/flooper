import { defineConfig } from "vite";

// Review mode's overlay, built on its own as dist/review.js: loaded by the
// widget only when the owner opens their site from "View on site", so it's
// outside the widget's 10 KB budget. (A library build can't split one IIFE
// into two files, hence a second build.)
export default defineConfig({
  build: {
    lib: {
      entry: "src/review/index.ts",
      name: "FlooperReviewBundle",
      formats: ["iife"],
      fileName: () => "review.js",
    },
    target: "es2020",
    sourcemap: true,
    // Beside flooper.js, which the main build has just written.
    emptyOutDir: false,
    minify: "terser",
    terserOptions: { format: { comments: false } },
  },
});
