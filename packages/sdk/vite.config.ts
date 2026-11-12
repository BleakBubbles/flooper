import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
    __DEFAULT_API_URL__: JSON.stringify(process.env.FLOOPER_API_URL ?? "http://localhost:8787"),
  },
  plugins: [compactIcons(), shortCssVariables()],
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
    // The widget's CSS already needs :focus-visible and :is() (Safari 15.4,
    // 2022). Targeting those browsers drops fallbacks that only old ones
    // would use: every :is() rule repeated as :-webkit-any(), and rule lists
    // split in two around :focus-visible, a -moz- prefix. About 30 bytes gzipped.
    cssTarget: ["chrome90", "edge90", "firefox94", "safari15.4"],
    sourcemap: true,
    // Terser over Vite's default (esbuild): slower, but it squeezes out a few
    // hundred more bytes, and the widget has a 10 KB budget (scripts/check-size.mjs).
    minify: "terser",
    terserOptions: { compress: { passes: 2 }, format: { comments: false } },
  },
  test: {
    environment: "happy-dom",
  },
});

/**
 * The widget's CSS keeps readable custom property names (--border-strong,
 * --launcher-shadow...); the shipped file gets short ones (--a, --b...), which
 * is worth about 60 bytes of the 10 KB budget. Only widget.css's own
 * variables, all defined on its :host, and no code reads them by name.
 */
function shortCssVariables(): Plugin {
  return {
    name: "short-css-variables",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]ui[\\/]widget\.css/.test(id)) return null;
      // Longest first, so --surface-raised isn't caught as --surface.
      const names = [...new Set(code.match(/--[a-z][\w-]*/g) ?? [])].sort(
        (a, b) => b.length - a.length,
      );
      let out = code;
      names.forEach((name, i) => {
        out = out.replace(new RegExp(`${name}(?![\\w-])`, "g"), `--${i.toString(36)}`);
      });
      return out;
    },
  };
}

/**
 * Lucide's icons arrive as pretty-printed SVG strings. Squeeze them before they
 * ship: one line, no xmlns (HTML parsing puts <svg> in the SVG namespace
 * anyway), no width/height or fill/stroke (widget.css sizes and draws every
 * svg.lucide) and just the shared "lucide" class. A few hundred bytes the 10 KB budget can use.
 */
function compactIcons(): Plugin {
  return {
    name: "compact-lucide-icons",
    transform(code, id) {
      if (!/lucide-static[\\/].*icons[\\/]/.test(id)) return null;
      return code.replace(/`([^`]*)`/, (_, svg: string) =>
        JSON.stringify(
          svg
            .trim()
            .replace(/\s*\n\s*/g, " ")
            // widget.css draws every svg.lucide (fill, stroke and its width, caps, joins).
            .replace(/ (xmlns|width|height|fill|stroke[a-z-]*)="[^"]*"/g, "")
            .replace(/class="lucide [^"]*"/, 'class="lucide"')
            .replace(/ ?(\/?>) ?/g, "$1"),
        ),
      );
    },
  };
}
