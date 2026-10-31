// Ship the SDK's script-tag bundle inside the portal build, at /sdk/flooper.js.
// One deploy then serves the portal, the API *and* the widget script, which
// also makes self-hosting a single step.
import { copyFileSync, mkdirSync } from "node:fs";

const from = new URL("../../../packages/sdk/dist/", import.meta.url);
const to = new URL("../dist/sdk/", import.meta.url);

mkdirSync(to, { recursive: true });
for (const file of ["flooper.js", "flooper.js.map"]) {
  copyFileSync(new URL(file, from), new URL(file, to));
}
console.log("Copied SDK bundle to dist/sdk/");
