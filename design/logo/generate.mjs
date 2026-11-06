// The Flooper creature, drawn from a handful of parameters. This is the single
// source of truth for every logo file. It writes:
//   apps/portal/public/logo.svg               standalone logo (white creature on a black tile)
//   packages/sdk/src/ui/icon.ts               themeable widget icon (colors come from CSS)
//   apps/portal/public/apple-touch-icon.png   180x180, for iOS home screens
//   apps/portal/public/favicon.ico            32x32, for browsers without SVG favicons
//   apps/portal/public/og-image.png           1200x630, for link previews (Slack, iMessage...)
//   design/logo/github-social-preview.png     1280x640, upload in the repo's settings
//   design/logo/github-oauth-logo.png         512x512, upload in the GitHub OAuth app's settings
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
  // Each segment is a half-moon: a semicircular stroke across the body. Its
  // inner (concave) edge must be exactly as wide as the body, so the stroke's
  // ends sit just outside both edges instead of poking their corners into it.
  const arc = L.bodyWidth / 2 + L.segmentWidth / 2;
  for (const a of L.segments) {
    out.push({
      role: "bgStroke",
      el: `<path fill="none" stroke-width="${L.segmentWidth}" d="M${xy(point(a, r - arc))}A${arc} ${arc} 0 0 0 ${xy(point(a, r + arc))}"/>`,
    });
  }
  // Eye positions and antenna tips are proportional to a reference head of radius 44.
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
  // Antennae: parallel stalks from the tips back to the head's visible edge, so
  // they join the head without reaching into it (and over the eyes).
  const visibleHead = L.headRadius - 8;
  const [dx, dy] = [12 / Math.hypot(12, 21), 21 / Math.hypot(12, 21)];
  for (const tipOffset of [
    [-42, -31],
    [-7, -51],
  ]) {
    const [tx, ty] = at(tipOffset);
    // Walk from the tip toward the head until we reach its visible edge.
    const ox = tx - hx;
    const oy = ty - hy;
    const b = ox * dx + oy * dy;
    const t = -b - Math.sqrt(b * b - (ox * ox + oy * oy - visibleHead ** 2));
    out.push({
      role: "fgStroke",
      el: `<path stroke-width="${L.antennaWidth}" stroke-linecap="round" d="M${xy([tx, ty])}L${xy([tx + t * dx, ty + t * dy])}"/>`,
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

// iOS (and GitHub's OAuth app page) round the corners themselves and dislike
// transparency: a full-bleed square.
const touchIcon = svgDoc(
  512,
  512,
  `<rect width="512" height="512" fill="#000"/>\n${placed(256, 256, 440)}`,
);

// Link previews: the logo beside the name, centered together. Text is rendered
// with fonts installed on the machine that runs this script, then baked into the PNG.
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const fontOptions = { font: { loadSystemFonts: true } };

/** The rendered width of `text`, measured with the same fonts the PNG will use. */
function textWidth(text, size) {
  const svg = svgDoc(
    4000,
    size * 2,
    `<text x="0" y="${size}" font-family="${FONT}" font-size="${size}" font-weight="700">${text}</text>`,
  );
  return new Resvg(svg, fontOptions).innerBBox()?.width ?? 0;
}

function card(w, h) {
  const logo = Math.round(h * 0.5);
  const size = Math.round(h * 0.2);
  const gap = Math.round(h * 0.06);
  const left = (w - (logo + gap + textWidth("Flooper", size))) / 2;
  return svgDoc(
    w,
    h,
    [
      `<rect width="${w}" height="${h}" fill="#000"/>`,
      placed(left + logo / 2, h / 2, logo),
      // dominant-baseline centers the text on the logo's middle line.
      `<text x="${n(left + logo + gap)}" y="${h / 2}" dominant-baseline="central" font-family="${FONT}" font-size="${size}" font-weight="700" fill="#fff">Flooper</text>`,
    ].join("\n"),
  );
}

const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: "width", value: width }, ...fontOptions }).render().asPng();

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
out("design/logo/github-oauth-logo.png", png(touchIcon, 512));
