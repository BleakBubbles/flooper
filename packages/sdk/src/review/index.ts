import { REACTION_EMOJI, type Reaction } from "@flooper/shared";
import type { ReviewElement, ReviewNote, ReviewPage } from "@flooper/shared/schemas";
import STYLES from "./review.css?inline";

// Review mode, the overlay: loaded as its own script (sdk/review.js) only when
// the owner opens their site from "View on site" in Flooper, so visitors never
// download it. The widget's loader (startReview in ../index.ts) calls
// window.FlooperReview with the site's ingest URL and the link's token.
//
// It highlights each element notes point at with a pink fill (stronger the
// more notes; translucent, so nested ones stack darker). Like DevTools'
// element picker: hovering an area outlines the element a click would open
// and shows its counts by the pointer, and clicking opens its notes there.
// The bar at the top switches review mode off (to use the page as normal) and
// on again, counts the notes here against the whole site's, and exits.

/** Where the widget's loader keeps the token for this tab. */
const STORAGE_KEY = "flooper-review";
/** Highlights switched off in this tab ("1"). */
const HIDDEN_KEY = "flooper-review-hidden";
const NO_REACTION = "💬";
// Lucide's scan-eye (review mode, the same as "View on site" in Flooper) and
// the speech bubble Flooper uses for notes. Stroked by the bar's CSS.
const REVIEW_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></svg>';
const NOTES_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
/** How far each highlight reaches past its element: the outer element's own edge, even when a child fills it. */
const EDGE = 3;
/** Elements within this many pixels of each other's box, on every side, count as the same space. */
const SAME_SPACE = 6;

declare global {
  interface Window {
    FlooperReview?: (ingestUrl: string, token: string) => void;
  }
}

let started = false;
// A site that sets the widget up again, like a single-page app moving between
// pages, loads this script again each time. Keep the first copy (it follows
// the address by itself), so there's only ever one overlay and Exit ends it.
window.FlooperReview ??= (ingestUrl, token) => {
  if (started) return;
  started = true;
  new Review(ingestUrl, token).start();
};

/** How much less fill each level of nesting gets, so a deep stack of highlights stays see-through. */
const DEPTH_FADE = 0.75;
/** The busiest highlight's fill opacity (outermost level). */
const MAX_FILL = 0.4;

/** One highlight: an element, or several filling (nearly) the same space. */
interface Mark {
  /** The elements here, innermost first. */
  elements: ReviewElement[];
  /** The outermost of them: what the highlight covers. */
  target: Element;
  area: HTMLButtonElement;
  /** The highlight's box on screen (the element's, plus EDGE all round). */
  box: DOMRect;
}

class Review {
  private readonly host = document.createElement("flooper-review");
  private readonly root = this.host.attachShadow({ mode: "open" });
  private readonly bar = el("div", "bar");
  private readonly layer = el("div", "layer");
  /** The counts by the pointer while hovering an area. */
  private readonly label = el("div", "label");
  private marks: Mark[] = [];
  private card: HTMLElement | null = null;
  private page: ReviewPage | null = null;
  private resized = 0;
  private hidden = remember(HIDDEN_KEY) === "1";
  private path = location.pathname;
  private frame = 0;
  private watch = 0;
  /** Flooper's own address, for links to each note there. */
  private readonly app: string;

  constructor(
    private readonly ingestUrl: string,
    private readonly token: string,
  ) {
    this.app = new URL(ingestUrl).origin;
  }

  start(): void {
    const style = document.createElement("style");
    style.textContent = STYLES;
    this.label.hidden = true;
    this.root.append(style, this.layer, this.label, this.bar);
    document.documentElement.append(this.host);
    this.layer.addEventListener("click", this.click);
    addEventListener("pointermove", this.hover, { passive: true });
    addEventListener("scroll", this.schedule, { capture: true, passive: true });
    addEventListener("resize", this.resize);
    addEventListener("keydown", this.escape);
    // Single-page sites change pages without loading one: follow along.
    this.watch = window.setInterval(() => {
      if (location.pathname !== this.path) {
        this.path = location.pathname;
        void this.load();
      } else {
        this.schedule();
      }
    }, 1000);
    void this.load();
  }

  private stop(): void {
    forget(STORAGE_KEY);
    forget(HIDDEN_KEY);
    removeEventListener("pointermove", this.hover);
    removeEventListener("scroll", this.schedule, { capture: true });
    removeEventListener("resize", this.resize);
    clearTimeout(this.resized);
    removeEventListener("keydown", this.escape);
    clearInterval(this.watch);
    cancelAnimationFrame(this.frame);
    this.host.remove();
    started = false;
  }

  private async load(): Promise<void> {
    this.say("Loading…");
    let res: Response;
    try {
      res = await fetch(`${this.ingestUrl}/review?path=${encodeURIComponent(this.path)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        credentials: "omit",
      });
    } catch {
      this.say("Couldn't reach Flooper.");
      return;
    }
    if (res.status === 401) {
      forget(STORAGE_KEY);
      this.say("This review link has expired. Open a new one from Flooper.");
      return;
    }
    if (!res.ok) {
      this.say("Couldn't load this page's notes.");
      return;
    }
    this.draw((await res.json()) as ReviewPage);
  }

  /**
   * The bar: review mode's icon and name (with its on/off switch, once there's
   * something to show), a message or the note counts, and Exit.
   */
  private say(status: string | HTMLElement, withSwitch = false): void {
    const title = el("span", "title");
    title.innerHTML = REVIEW_ICON;
    title.append(text("Review mode"));
    let shown = status;
    if (typeof status === "string") {
      shown = el("span", "status");
      shown.append(text(status));
    }
    let first: HTMLElement = title;
    if (withSwitch) {
      // An on/off switch named "Review mode": off hides the highlights (the
      // bar stays, to switch back); Exit leaves review mode altogether.
      const toggle = el("button", "switch");
      toggle.type = "button";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", String(!this.hidden));
      toggle.append(title, el("span", "track"));
      toggle.addEventListener("click", () => this.setHidden(!this.hidden));
      first = toggle;
    }
    const exit = el("button", "exit");
    exit.append(text("Exit"));
    exit.type = "button";
    exit.addEventListener("click", () => this.stop());
    this.bar.replaceChildren(first, shown as HTMLElement, exit);
  }

  /** Highlights off: the page as it is, to use as normal. Remembered for the tab. */
  private setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) remember(HIDDEN_KEY, "1");
    else forget(HIDDEN_KEY);
    this.layer.hidden = hidden;
    this.closeCard();
    this.outline([]);
    this.bar.querySelector(".switch")?.setAttribute("aria-checked", String(!hidden));
    this.place();
  }

  private draw(page: ReviewPage): void {
    this.closeCard();
    this.layer.replaceChildren();
    this.page = page;
    // Worked out once per page (and again after a resize), not while scrolling.
    this.marks = group(page.elements);
    const total = (m: Mark) => m.elements.reduce((n, e) => n + e.total, 0);
    const top = Math.max(1, ...this.marks.map(total));
    for (const mark of this.marks) {
      // A button, so the keyboard can reach it too (Tab, then Enter).
      mark.area.className = "area";
      mark.area.type = "button";
      mark.area.setAttribute(
        "aria-label",
        `${plural(total(mark), "note")} on ${mark.elements.map(describe).join(" and ")}`,
      );
      // 0 to 1: this highlight's share of the busiest one here, on a square-root
      // curve so one with a few notes still shows beside one with many.
      mark.area.style.setProperty("--heat", String(Math.sqrt(total(mark) / top)));
      // Each level of nesting inside other highlights gets less fill, so a deep
      // stack still lets the page through.
      const depth = this.marks.filter(
        (m) => m !== mark && m.target !== mark.target && m.target.contains(mark.target),
      ).length;
      mark.area.style.setProperty("--max", String(MAX_FILL * DEPTH_FADE ** depth));
      this.layer.append(mark.area);
    }

    // The notes on this page / on the whole site, beside a note icon.
    const notes = page.elements.reduce((n, e) => n + e.total, 0) + page.unpinned.length;
    const here = `${notes}${page.truncated ? "+" : ""}`;
    const count = el("span", "status count");
    count.innerHTML = NOTES_ICON;
    count.append(text(`${here}/${page.siteTotal}`));
    count.title = `${here} of this site's ${plural(page.siteTotal, "note")} are on this page`;
    count.setAttribute("aria-label", count.title);
    this.layer.hidden = this.hidden;
    this.say(count, this.marks.length > 0);
    this.place();
  }

  /**
   * A resize can change which elements share a space: follow at once, then
   * regroup once it settles (not on every step of a drag).
   */
  private resize = (): void => {
    this.schedule();
    clearTimeout(this.resized);
    this.resized = window.setTimeout(() => {
      if (this.page && !this.card) this.draw(this.page);
    }, 250);
  };

  /** Reposition on the next frame (scrolling and resizing call this a lot). */
  private schedule = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.place();
    });
  };

  /** Each highlight over its element, reaching EDGE past it all round. */
  private place(): void {
    for (const mark of this.marks) {
      const r = mark.target.getBoundingClientRect();
      const gone = !mark.target.isConnected || r.width === 0 || r.height === 0;
      mark.area.hidden = gone;
      mark.box = gone
        ? new DOMRect()
        : new DOMRect(r.left - EDGE, r.top - EDGE, r.width + 2 * EDGE, r.height + 2 * EDGE);
      if (gone) continue;
      Object.assign(mark.area.style, {
        left: `${mark.box.left}px`,
        top: `${mark.box.top}px`,
        width: `${mark.box.width}px`,
        height: `${mark.box.height}px`,
      });
    }
  }

  /**
   * What a click at (x, y) opens, by DevTools' rules: the innermost highlight
   * there, or where highlights overlap without nesting, the one on top.
   * (Elements filling the same space share a highlight, so open together.)
   */
  private pick(x: number, y: number): Mark[] {
    const under = this.marks.filter(({ box, area }) => !area.hidden && within(box, x, y));
    if (under.length === 0) return [];
    // Innermost: drop any that contains another one here.
    let candidates = under.filter(
      (a) => !under.some((b) => b !== a && a.target.contains(b.target)),
    );
    if (candidates.length > 1) {
      // Not nested, but overlapping: the one painted on top at this point.
      const stack = document.elementsFromPoint(x, y).filter((e) => e !== this.host);
      const rank = (m: Mark) => {
        const i = stack.findIndex((e) => m.target === e || m.target.contains(e));
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      };
      const area = (m: Mark) => m.box.width * m.box.height;
      candidates = [...candidates].sort((a, b) => rank(a) - rank(b) || area(a) - area(b));
    }
    // Elements sharing a space are one highlight already, so they open together.
    return [candidates[0] as Mark];
  }

  /** Hovering: outline what a click would open, and show its counts by the pointer. */
  private hover = (event: PointerEvent): void => {
    if (this.hidden || this.card) return;
    const onArea = event
      .composedPath()
      .some((t) => t instanceof HTMLElement && t.classList.contains("area"));
    const picked = onArea ? this.pick(event.clientX, event.clientY) : [];
    this.outline(picked);
    if (picked.length === 0) return;
    this.label.textContent = counts(picked.flatMap((m) => m.elements));
    this.label.hidden = false;
    const x = Math.min(innerWidth - this.label.offsetWidth - 8, event.clientX + 14);
    const y = Math.min(innerHeight - this.label.offsetHeight - 8, event.clientY + 18);
    Object.assign(this.label.style, { left: `${x}px`, top: `${y}px` });
  };

  private click = (event: MouseEvent): void => {
    const area = (event.target as HTMLElement).closest(".area");
    if (!area) return;
    event.stopPropagation();
    // Enter on a focused area (no pointer position): that element, at its corner.
    const keyboard = event.detail === 0;
    const mark = this.marks.find((m) => m.area === area);
    const picked = keyboard ? (mark ? [mark] : []) : this.pick(event.clientX, event.clientY);
    if (picked.length === 0) return;
    const at =
      keyboard && mark
        ? { x: mark.box.left, y: mark.box.bottom }
        : { x: event.clientX, y: event.clientY };
    this.openCard(picked, at.x, at.y);
  };

  /** Esc: close the notes. */
  private escape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.closeCard();
  };

  /** These areas outlined; the rest not. */
  private outline(marks: Mark[]): void {
    for (const m of this.marks) m.area.classList.toggle("on", marks.includes(m));
    if (marks.length === 0) this.label.hidden = true;
  }

  /** The notes for these elements (one section each), at the click. */
  private openCard(marks: Mark[], x: number, y: number): void {
    this.closeCard();
    this.label.hidden = true;
    this.outline(marks);
    const card = el("div", "card");
    for (const element of marks.flatMap((m) => m.elements)) {
      const section = el("section", "card-section");
      // The element, with its reactions to the right.
      const head = el("div", "card-head");
      head.append(
        el("p", "card-title", describe(element)),
        el("span", "card-counts", counts([element])),
      );
      section.append(head);
      const list = el("ul", "notes");
      for (const note of element.notes) list.append(noteItem(note, this.app));
      section.append(list);
      card.append(section);
    }
    this.layer.append(card);
    this.card = card;
    // Beside the click, kept on screen.
    const left = Math.min(innerWidth - card.offsetWidth - 8, Math.max(8, x + 8));
    const top = Math.min(innerHeight - card.offsetHeight - 8, Math.max(8, y + 8));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    // A click anywhere else closes it (in the overlay or on the page).
    const close = (event: Event) => {
      if (event.composedPath().includes(card)) {
        document.addEventListener("click", close, { once: true, capture: true });
        return;
      }
      this.closeCard();
    };
    setTimeout(() => document.addEventListener("click", close, { once: true, capture: true }));
  }

  private closeCard(): void {
    if (!this.card) return;
    this.card.remove();
    this.card = null;
    this.outline([]);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Words in the bar, lifted to line up with the icons beside them (see .t). */
function text(words: string): HTMLElement {
  return el("span", "t", words);
}

/** sessionStorage, which can be off (private windows, blocked storage). */
function remember(key: string, value?: string): string | null {
  try {
    if (value !== undefined) sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function forget(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

/** The element on this page, if the selector still finds one. */
function find(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function within(box: DOMRect, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function sameSpace(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.left - b.left) <= SAME_SPACE &&
    Math.abs(a.top - b.top) <= SAME_SPACE &&
    Math.abs(a.right - b.right) <= SAME_SPACE &&
    Math.abs(a.bottom - b.bottom) <= SAME_SPACE
  );
}

/** "🐛 3 · 🤔 1": each reaction these elements got, most first. */
function counts(elements: ReviewElement[]): string {
  const total: Partial<Record<Reaction | "none", number>> = {};
  for (const e of elements) {
    for (const [r, n] of Object.entries(e.counts) as [Reaction | "none", number][]) {
      total[r] = (total[r] ?? 0) + n;
    }
  }
  return (Object.entries(total) as [Reaction | "none", number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r === "none" ? NO_REACTION : REACTION_EMOJI[r]} ${n}`)
    .join(" · ");
}

/** What the element is, in words: its text if it had any, else its selector. */
function describe(element: ReviewElement): string {
  return element.text ? `“${element.text}”` : element.selector;
}

const STATUS: Record<ReviewNote["status"], string> = {
  new: "New",
  seen: "Read",
  done: "Done",
  archived: "Archived",
};

function noteItem(note: ReviewNote, app: string): HTMLElement {
  const item = el("li", "note");
  const emoji = note.reaction ? REACTION_EMOJI[note.reaction] : NO_REACTION;
  // The note itself opens it in Flooper, in a new tab.
  const text = el("a", "note-text", note.message || "(no message)");
  text.href = `${app}/?note=${encodeURIComponent(note.id)}`;
  text.target = "_blank";
  text.rel = "noopener";
  text.title = "Open in Flooper";
  item.append(
    el("span", "note-emoji", emoji),
    text,
    el("span", "note-meta", `${STATUS[note.status]} · ${ago(note.createdAt)}`),
  );
  return item;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "5 min ago", "3 days ago": rough is fine here. */
function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, "hr")} ago`;
  return `${plural(Math.round(hours / 24), "day")} ago`;
}

/**
 * The page's elements as highlights: those whose boxes are (nearly) the same,
 * like a card and the one child filling it, share one, innermost first, since
 * no spot would be only one of theirs and stacked fills would hide the page.
 */
function group(elements: ReviewElement[]): Mark[] {
  const found = elements.flatMap((element) => {
    const target = find(element.selector);
    return target ? [{ element, target, box: target.getBoundingClientRect() }] : [];
  });
  const size = (b: DOMRect) => b.width * b.height;
  // Outermost first, so each group's first element is the one it covers.
  found.sort((a, b) => size(b.box) - size(a.box));
  const groups: (typeof found)[] = [];
  for (const f of found) {
    const shown = f.box.width > 0 && f.box.height > 0;
    const same = shown
      ? groups.find(
          (g) =>
            (g[0] as (typeof found)[number]).box.width > 0 &&
            sameSpace((g[0] as (typeof found)[number]).box, f.box),
        )
      : undefined;
    if (same) same.push(f);
    else groups.push([f]);
  }
  return groups.map((g) => ({
    elements: [...g].reverse().map((f) => f.element),
    target: (g[0] as (typeof found)[number]).target,
    area: el("button"),
    box: new DOMRect(),
  }));
}
