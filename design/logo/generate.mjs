// The Flooper creature, drawn from a handful of parameters. This is the single
// source of truth for every logo file. It writes:
//   apps/portal/public/logo.svg               standalone logo (white creature on a black tile)
//   packages/sdk/src/ui/icon.ts               themeable widget icon (colors come from CSS)
//   apps/portal/public/apple-touch-icon.png   180x180, for iOS home screens
//   apps/portal/public/favicon.ico            32x32, for browsers without SVG favicons
//   apps/portal/public/og-image.png           1200x630, for link previews (Slack, iMessage...)
//   design/logo/github-social-preview.png     1280x640, upload in the repo's settings
// Tweak the numbers below and run `pnpm logo`. Don't edit the outputs by hand.
//
// Geometry, on a 512x512 canvas centered at (256,256): the body is a thick arc
// along a circle of radius 156, starting at the head (-30deg, clockwise in SVG
// coordinates) and curling round to a rounded tail. Segments are short arcs
// across the body; the head is a circle on the body line with eyes and antennae.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const LOGO = {
  bodyRadius: 156,
  bodyWidth: 84,
  headAngle: -30,
  tailAngle: 260,
  segments: [25, 85, 145, 205], // angles along the body
  segmentWidth: 25,
  segmentCurve: 51, // radius of each segment arc
  // The head's outline (16 wide, in the background color) covers 8 units of the
  // disc, so r = bodyWidth / 2 + 8 makes the visible head exactly body-width.
  headRadius: 50,
  eyeRadius: 12,
  antennaWidth: 14,
};

const C = 256;
const rad = (deg) => (deg * Math.PI) / 180;
const point = (deg, r) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const n = (x) => Number(x.toFixed(2));
const xy = ([x, y]) => `${n(x)} ${n(y)}`;

// Each part is tagged with a role; the outputs map roles to colors differently.
//   fg / fgStroke = the creature     bg / bgStroke = background-colored details
function parts(L) {
  const out = [];
  const r = L.bodyRadius;
  out.push({
    role: "fgStroke",
    el: `<path fill="none" stroke-width="${L.bodyWidth}" stroke-linecap="round" d="M${xy(point(L.headAngle, r))}A${r} ${r} 0 1 1 ${xy(point(L.tailAngle, r))}"/>`,
  });
  const half = L.bodyWidth / 2 + 10; // overshoot so segments cut cleanly across
  for (const a of L.segments) {
    out.push({
      role: "bgStroke",
      el: `<path fill="none" stroke-width="${L.segmentWidth}" d="M${xy(point(a, r - half))}A${L.segmentCurve} ${L.segmentCurve} 0 0 0 ${xy(point(a, r + half))}"/>`,
    });
  }
  // Eye and antenna positions are proportional to a reference head of radius 44.
  const [hx, hy] = point(L.headAngle, r);
  const s = L.headRadius / 44;
  const at = ([dx, dy]) => [hx + dx * s, hy + dy * s];
  out.push({
    role: "fg bgStroke",
    el: `<circle stroke-width="16" cx="${n(hx)}" cy="${n(hy)}" r="${L.headRadius}"/>`,
  });
  for (const eye of [
    [-23, 1],
    [12, -19],
  ]) {
    const [x, y] = at(eye);
    out.push({ role: "bg", el: `<circle cx="${n(x)}" cy="${n(y)}" r="${L.eyeRadius}"/>` });
  }
  for (const [from, to] of [
    [
      [-42, -31],
      [-30, -10],
    ],
    [
      [-7, -51],
      [5, -30],
    ],
  ]) {
    out.push({
      role: "fgStroke",
      el: `<path stroke-width="${L.antennaWidth}" stroke-linecap="round" d="M${xy(at(from))}L${xy(at(to))}"/>`,
    });
  }
  return out;
}

const withAttrs = (el, attrs) => el.replace(/^<(\w+) /, `<$1 ${attrs} `);

/** The creature's elements, with each element's roles mapped to attributes. */
const creature = (attrsFor) =>
  parts(LOGO)
    .map((p) => withAttrs(p.el, attrsFor(p.role.split(" "))))
    .join("\n");

// Fixed colors, for every file except the themeable widget icon.
const COLORS = {
  fg: 'fill="#fff"',
  fgStroke: 'stroke="#fff"',
  bg: 'fill="#000"',
  bgStroke: 'stroke="#000"',
};
const colored = creature((roles) => roles.map((r) => COLORS[r]).join(" "));

/** The creature scaled to `size`, centered on (cx, cy). */
const placed = (cx, cy, size) => {
  const k = size / 512;
  return `<g transform="translate(${n(cx - 256 * k)} ${n(cy - 256 * k)}) scale(${n(k)})">\n${colored}\n</g>`;
};

const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>`;

// Standalone logo: the creature on a rounded black tile.
const standalone = svgDoc(
  512,
  512,
  `<title>Flooper</title>\n<rect width="512" height="512" rx="90" fill="#000"/>\n${colored}`,
);

// Widget icon: CSS classes, so the widget's theme decides the colors.
const CLASSES = { fg: "w", fgStroke: "ws", bg: "k", bgStroke: "ks" };
const icon = [
  '<svg viewBox="40 40 432 432" aria-hidden="true" focusable="false">',
  creature((roles) => `class="${roles.map((r) => CLASSES[r]).join(" ")}"`),
  "</svg>",
].join("\n");

// iOS rounds the corners itself and dislikes transparency: a full-bleed square.
const touchIcon = svgDoc(
  512,
  512,
  `<rect width="512" height="512" fill="#000"/>\n${placed(256, 256, 440)}`,
);

// Link previews: the logo beside the name and tagline. Text is rendered with
// fonts installed on the machine that runs this script, then baked into the PNG.
function card(w, h) {
  const logo = Math.round(h * 0.56);
  const x = Math.round(w * 0.1);
  const textX = x + logo + Math.round(w * 0.05);
  const font = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const small = Math.round(h * 0.048);
  return svgDoc(
    w,
    h,
    [
      `<rect width="${w}" height="${h}" fill="#000"/>`,
      placed(x + logo / 2, h / 2, logo),
      `<text x="${textX}" y="${h / 2 - 4}" font-family="${font}" font-size="${Math.round(h * 0.16)}" font-weight="700" fill="#fff">Flooper</text>`,
      `<text x="${textX}" y="${h / 2 + Math.round(h * 0.1)}" font-family="${font}" font-size="${small}" fill="#a1a1aa">A tiny, chill feedback widget</text>`,
      `<text x="${textX}" y="${h / 2 + Math.round(h * 0.17)}" font-family="${font}" font-size="${small}" fill="#a1a1aa">for indie websites.</text>`,
    ].join("\n"),
  );
}

const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true } })
    .render()
    .asPng();

/**
 * An .ico is a tiny directory of images, and modern ones may hold PNGs as-is:
 * a 6-byte header, a 16-byte entry per image, then the image bytes.
 */
function ico(pngBytes, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // number of images
  header.writeUInt8(size, 6); // width
  header.writeUInt8(size, 7); // height
  header.writeUInt8(0, 8); // palette size (none)
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(pngBytes.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, pngBytes]);
}

const ICON_TS = `// Generated by design/logo/generate.mjs. Edit that file and run \`pnpm logo\`.
//
// The Flooper creature for the widget button. Colors come from the widget's CSS:
//   .w  = foreground fill    .ws = foreground stroke
//   .k  = background fill    .ks = background stroke
export const LOGO_SVG = \`${icon}\`;
`;

const root = new URL("../../", import.meta.url);
const out = (path, data) => {
  writeFileSync(new URL(path, root), data);
  console.log(`  ${path}`);
};

console.log("Wrote:");
out("apps/portal/public/logo.svg", `${standalone}\n`);
out("packages/sdk/src/ui/icon.ts", ICON_TS);
out("apps/portal/public/apple-touch-icon.png", png(touchIcon, 180));
out("apps/portal/public/favicon.ico", ico(png(standalone, 32), 32));
out("apps/portal/public/og-image.png", png(card(1200, 630), 1200));
out("design/logo/github-social-preview.png", png(card(1280, 640), 1280));
