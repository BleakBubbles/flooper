// Size budget for the script-tag bundle. It loads on every page of every site
// that uses Flooper, so growth should be a conscious decision, not an accident.
// If you need to raise the budget, raise it here deliberately, in its own commit.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET_GZIP_BYTES = 10 * 1024;
const file = new URL("../dist/flooper.js", import.meta.url);

const raw = readFileSync(file);
const gzipped = gzipSync(raw, { level: 9 }).byteLength;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;

console.log(
  `flooper.js: ${kb(raw.byteLength)} raw, ${kb(gzipped)} gzipped (budget ${kb(BUDGET_GZIP_BYTES)})`,
);
if (gzipped > BUDGET_GZIP_BYTES) {
  console.error("Over budget!");
  process.exit(1);
}
