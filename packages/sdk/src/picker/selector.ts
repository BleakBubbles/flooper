// Turning "the element the visitor clicked" into something we can store and
// find again later. Pure functions over the DOM, so they're easy to test.
//
// The approach, deliberately simple:
//   1. Pick a sensible target: clicks on tiny inline bits (a <span> inside a
//      button, a <path> inside an icon) move up to the meaningful element.
//   2. Build a selector from the nearest stable anchor (an id or data-testid)
//      down to the target, using tag names and :nth-of-type positions.
//   3. Never use class names: on many sites they're generated (`css-1x9f2k`)
//      or utility soup (`flex px-4 ...`), which makes selectors fragile.
//
// Selectors will still break when a site's structure changes. That's why we
// also keep a short text snippet: a human can always tell what was meant.

/** Elements (and their contents) with this attribute can never be picked. */
export const IGNORE_ATTR = "data-flooper-ignore";

/** Inline-ish tags that are rarely what someone means when they click them. */
const PASS_THROUGH = new Set([
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "mark",
  "abbr",
  "sub",
  "sup",
  "time",
  "kbd",
  "br",
  "wbr",
]);

const ANCHOR_ATTRS = ["data-testid", "data-test", "data-cy"];
const MAX_DEPTH = 25;
const TEXT_MAX = 100;

/**
 * The element we should record for a click on `hit`, or null if it can't be
 * picked (inside an ignored region, or the whole page).
 */
export function resolveTarget(hit: Element): Element | null {
  if (hit.closest(`[${IGNORE_ATTR}]`)) return null;

  // Anything inside an SVG means the SVG (icons are made of many tiny shapes).
  let el: Element = hit.closest("svg") ?? hit;
  // Clicking inside a link or button means the link or button.
  el = el.closest("a, button") ?? el;
  while (PASS_THROUGH.has(tag(el)) && !stableAnchor(el) && el.parentElement) {
    el = el.parentElement;
  }
  if (el === document.body || el === document.documentElement) return null;
  return el;
}

/** A CSS selector that matches `el` (and, at the time of capture, only `el`). */
export function cssSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < MAX_DEPTH; depth++) {
    const anchor = stableAnchor(cur);
    if (anchor && cur.ownerDocument.querySelectorAll(anchor).length === 1) {
      parts.unshift(anchor);
      break;
    }
    if (cur === cur.ownerDocument.body) {
      parts.unshift("body");
      break;
    }
    parts.unshift(positional(cur));
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

/**
 * Up to 100 characters describing the element, for humans. Uses `textContent`,
 * which never includes what a visitor typed into form fields (that lives in
 * their `value`, which we don't read).
 */
export function textSnippet(el: Element): string | undefined {
  const raw =
    el.getAttribute("aria-label") ??
    (tag(el) === "img" ? el.getAttribute("alt") : null) ??
    el.textContent ??
    "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text;
}

function stableAnchor(el: Element): string | null {
  if (el.id && looksStable(el.id)) return `#${cssEscape(el.id)}`;
  for (const attr of ANCHOR_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) return `[${attr}="${value.replace(/["\\]/g, "\\$&")}"]`;
  }
  return null;
}

/** Reject ids that frameworks generate (`:r3:`, `ember123`, `a1b2c3d4e5f6`). */
function looksStable(id: string): boolean {
  return /^[A-Za-z][\w-]{0,63}$/.test(id) && !/\d{3,}/.test(id) && !/^[a-f0-9-]{10,}$/i.test(id);
}

function positional(el: Element): string {
  const name = tag(el);
  const siblings = el.parentElement
    ? [...el.parentElement.children].filter((s) => s.tagName === el.tagName)
    : [el];
  return siblings.length > 1 ? `${name}:nth-of-type(${siblings.indexOf(el) + 1})` : name;
}

const tag = (el: Element) => el.tagName.toLowerCase();

const cssEscape = (value: string) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;
