import { REACTION_EMOJI, REACTIONS, type Reaction } from "@flooper/shared";
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
/** The filter menu's choices for this tab, kept from page to page. */
const FILTER_KEY = "flooper-review-filter";
const NO_REACTION = "💬";
// Lucide's scan-eye (review mode, the same as "View on site" in Flooper) and
// the speech bubble Flooper uses for notes. Stroked by the bar's CSS.
const REVIEW_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></svg>';
// Lucide's rotate-ccw: a filter section's Reset.
const RESET_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const NOTES_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
/** A note's reaction, or "none" for a note with only words. */
type Kind = Reaction | "none";
const KINDS: Kind[] = [...REACTIONS, "none"];
const KIND_LABELS: Record<Kind, string> = {
  love: "Love it",
  idea: "Ideas",
  confused: "Confusing",
  bug: "Broken",
  none: "No reaction",
};
const emoji = (kind: Kind) => (kind === "none" ? NO_REACTION : REACTION_EMOJI[kind]);

/**
 * The statuses review mode loads (archived notes are left out), with the
 * app's icons for them: an envelope closed and open, and a check.
 */
type Status = "new" | "seen" | "done";
const STATUSES: Status[] = ["new", "seen", "done"];
const STATUS_ICONS: Record<Status, string> = {
  new: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>',
  seen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
};

/**
 * Which notes to hide: every reaction and status is on to begin with, and
 * these are the ones switched off.
 */
interface Filter {
  hiddenKinds: Kind[];
  hiddenStatuses: Status[];
}
const NO_FILTER: Filter = { hiddenKinds: [], hiddenStatuses: [] };

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
  /** The pointer's last position, for hovering again after a scroll. */
  private pointer: { x: number; y: number } | null = null;
  /** Where the open card sits relative to its highlight, so it scrolls with it. */
  private pin: { mark: Mark; dx: number; dy: number } | null = null;
  private page: ReviewPage | null = null;
  private resized = 0;
  private hidden = remember(HIDDEN_KEY) === "1";
  private filter: Filter = readFilter();
  /** The filter menu, while it's open. */
  private menu: HTMLElement | null = null;
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
    document.documentElement.addEventListener("pointerleave", this.leave);
    addEventListener("scroll", this.schedule, { capture: true, passive: true });
    addEventListener("resize", this.resize);
    addEventListener("keydown", this.escape);
    addEventListener("pointerdown", this.outside, true);
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
    forget(FILTER_KEY);
    removeEventListener("pointermove", this.hover);
    document.documentElement.removeEventListener("pointerleave", this.leave);
    removeEventListener("scroll", this.schedule, { capture: true });
    removeEventListener("resize", this.resize);
    clearTimeout(this.resized);
    removeEventListener("keydown", this.escape);
    removeEventListener("pointerdown", this.outside, true);
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
   * The bar: review mode's icon and name (with its on/off switch once the
   * page's notes are in), a message or the note counts, and Exit. The switch
   * is there on every page, so the bar looks the same everywhere; with
   * nothing here to highlight, it's off and greyed out, and says why.
   */
  private say(
    status: string | HTMLElement,
    withSwitch = false,
    empty = false,
    filtering = false,
  ): void {
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
      toggle.setAttribute("aria-checked", String(!this.hidden && !empty));
      toggle.append(title, el("span", "track"));
      if (empty) {
        toggle.disabled = true;
        toggle.title = filtering
          ? "Nothing on this page matches the filter"
          : "Nothing on this page to highlight";
      }
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
    // Only the notes the filter lets through, counted again: the highlights,
    // their heat and the cards are all about those.
    const view = applyFilter(page, this.filter);
    // Worked out once per page (and again after a resize), not while scrolling.
    this.marks = group(view.elements);
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

    // The notes on this page / on the whole site, beside a note icon; with a
    // filter on, the ones it lets through, in pink. A button: it opens the
    // filter menu.
    const more = page.truncated ? "+" : "";
    const all = noteCount(page);
    const shown = noteCount(view);
    const filtering = isFiltering(this.filter);
    const count = el("button", filtering ? "status count filtered" : "status count");
    count.type = "button";
    count.innerHTML = NOTES_ICON;
    count.append(text(`${shown}${more}/${page.siteTotal}`));
    count.title = filtering
      ? `${shown} of the ${all}${more} notes on this page match the filter. ` +
        `The site has ${plural(page.siteTotal, "note")}.`
      : `${all}${more} of this site's ${plural(page.siteTotal, "note")} are on this page`;
    count.setAttribute("aria-label", `${count.title} Filter`);
    count.setAttribute("aria-haspopup", "true");
    count.setAttribute("aria-expanded", String(this.menu !== null));
    count.addEventListener("click", () => (this.menu ? this.closeMenu() : this.openMenu()));
    this.layer.hidden = this.hidden;
    this.say(count, true, this.marks.length === 0, filtering);
    this.place();
    if (this.menu) this.openMenu();
  }

  /**
   * The filter menu, under the count: a toggle per reaction on this page and
   * per status, all on until you switch one off (a × beside "Reactions"
   * turns them all back on). It stays open while you pick, and each pick
   * redraws the page at once.
   */
  private openMenu(): void {
    const page = this.page;
    if (!page) return;
    this.menu?.remove();
    const menu = el("div", "menu");
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "Filter notes");
    // Each side counted with the other side's filter applied, so the
    // numbers add up to what shows.
    // Each chip's count with no filter on, too: the most it can show, which
    // its number keeps room for so the chips don't shift as counts change.
    const byKind = new Map<Kind, number>();
    const byStatus = new Map<Status, number>();
    const most = new Map<Kind | Status, number>();
    const add = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
    const { hiddenKinds, hiddenStatuses } = this.filter;
    for (const note of pageNotes(page)) {
      const kind = note.reaction ?? "none";
      const status = note.status as Status;
      add(most, kind);
      add(most, status);
      if (!hiddenStatuses.includes(status)) add(byKind, kind);
      if (!hiddenKinds.includes(kind)) add(byStatus, status);
    }
    const chips = el("div", "chips");
    for (const kind of KINDS) {
      const n = byKind.get(kind) ?? 0;
      const on = !hiddenKinds.includes(kind);
      // Only the reactions on this page, and any switched off (to switch back).
      if (n === 0 && on) continue;
      chips.append(
        chip(emoji(kind), n, most.get(kind) ?? n, `${KIND_LABELS[kind]}, ${n}`, on, () =>
          this.setFilter({
            ...this.filter,
            hiddenKinds: on ? [...hiddenKinds, kind] : hiddenKinds.filter((k) => k !== kind),
          }),
        ),
      );
    }
    menu.append(
      heading("Reactions", hiddenKinds.length > 0, () =>
        this.setFilter({ ...this.filter, hiddenKinds: [] }),
      ),
      chips,
    );
    if (chips.childElementCount === 0) chips.append(el("span", "menu-empty", "No notes here"));
    const statuses = el("div", "chips");
    for (const status of STATUSES) {
      const n = byStatus.get(status) ?? 0;
      const on = !hiddenStatuses.includes(status);
      const toggle = chip(
        STATUS_ICONS[status],
        n,
        most.get(status) ?? n,
        `${STATUS[status]}, ${n}`,
        on,
        () =>
          this.setFilter({
            ...this.filter,
            hiddenStatuses: on
              ? [...hiddenStatuses, status]
              : hiddenStatuses.filter((s) => s !== status),
          }),
      );
      toggle.title = STATUS[status];
      toggle.disabled = n === 0 && on;
      statuses.append(toggle);
    }
    menu.append(
      heading("Status", hiddenStatuses.length > 0, () =>
        this.setFilter({ ...this.filter, hiddenStatuses: [] }),
      ),
      statuses,
    );
    this.root.append(menu);
    this.menu = menu;
    this.bar.querySelector(".count")?.setAttribute("aria-expanded", "true");
    // Under the count, kept on screen.
    const anchor = this.bar.querySelector(".count")?.getBoundingClientRect();
    const bar = this.bar.getBoundingClientRect();
    const middle = anchor ? anchor.left + anchor.width / 2 : innerWidth / 2;
    const left = Math.min(
      innerWidth - menu.offsetWidth - 8,
      Math.max(8, middle - menu.offsetWidth / 2),
    );
    Object.assign(menu.style, { left: `${left}px`, top: `${bar.bottom + 8}px` });
  }

  private closeMenu(): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.bar.querySelector(".count")?.setAttribute("aria-expanded", "false");
  }

  /** A new filter: kept for the tab, and the page drawn again with it. */
  private setFilter(filter: Filter): void {
    this.filter = filter;
    if (isFiltering(filter)) remember(FILTER_KEY, JSON.stringify(filter));
    else forget(FILTER_KEY);
    if (this.page) this.draw(this.page);
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
    // The pointer may be over something else now: whatever's on top there
    // (a highlight, or the bar above one).
    if (this.pointer) {
      const top = this.root.elementFromPoint?.(this.pointer.x, this.pointer.y);
      this.hoverAt(top instanceof HTMLElement && top.classList.contains("area"));
    }
    // The open card stays where it was put against its element, so it moves
    // with the page; it goes if the element does.
    if (this.card && this.pin) {
      const { mark, dx, dy } = this.pin;
      if (mark.area.hidden) this.closeCard();
      else {
        this.card.style.left = `${mark.box.left + dx}px`;
        this.card.style.top = `${mark.box.top + dy}px`;
      }
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
    this.pointer = { x: event.clientX, y: event.clientY };
    const onArea = event
      .composedPath()
      .some((t) => t instanceof HTMLElement && t.classList.contains("area"));
    this.hoverAt(onArea);
  };

  /** The pointer left the window: nothing is hovered. */
  private leave = (): void => {
    this.pointer = null;
    if (!this.card) this.outline([]);
  };

  /**
   * What's under the pointer now. Scrolling moves the page under a still
   * pointer, so place() asks again, or the outline and counts would stay
   * on an element that has scrolled away.
   */
  private hoverAt(onArea: boolean): void {
    if (this.hidden || this.card || !this.pointer) return;
    const { x, y } = this.pointer;
    const picked = onArea ? this.pick(x, y) : [];
    this.outline(picked);
    if (picked.length === 0) return;
    this.label.textContent = counts(picked.flatMap((m) => m.elements));
    this.label.hidden = false;
    const left = Math.min(innerWidth - this.label.offsetWidth - 8, x + 14);
    const top = Math.min(innerHeight - this.label.offsetHeight - 8, y + 18);
    Object.assign(this.label.style, { left: `${left}px`, top: `${top}px` });
  }

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

  /** Esc: close the filter menu, or else the notes. */
  private escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.menu) this.closeMenu();
    else this.closeCard();
  };

  /** A press anywhere but the menu or the count (which toggles it) closes the menu. */
  private outside = (event: PointerEvent): void => {
    if (!this.menu) return;
    const path = event.composedPath();
    if (
      path.includes(this.menu) ||
      path.some((t) => t instanceof HTMLElement && t.classList.contains("count"))
    )
      return;
    this.closeMenu();
  };

  /** These areas outlined; the rest not. */
  private outline(marks: Mark[]): void {
    for (const m of this.marks) m.area.classList.toggle("on", marks.includes(m));
    if (marks.length === 0) this.label.hidden = true;
  }

  /** The notes for these elements (one section each), at the click. */
  private openCard(marks: Mark[], atX: number, atY: number): void {
    const at = { x: atX, y: atY };
    this.closeCard();
    this.label.hidden = true;
    this.outline(marks);
    const card = el("div", "card");
    const x = el("button", "card-x");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.innerHTML = CLOSE_ICON;
    x.addEventListener("click", () => this.closeCard());
    const body = el("div", "card-body");
    card.append(x, body);
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
      body.append(section);
    }
    this.layer.append(card);
    this.card = card;
    // Beside the click, kept on screen, then pinned there against the element.
    const left = Math.min(innerWidth - card.offsetWidth - 8, Math.max(8, at.x + 8));
    const top = Math.min(innerHeight - card.offsetHeight - 8, Math.max(8, at.y + 8));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    const mark = marks[0] as Mark;
    this.pin = { mark, dx: left - mark.box.left, dy: top - mark.box.top };
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
    this.pin = null;
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

/** The tab's filter, if one was set on an earlier page. */
function readFilter(): Filter {
  try {
    const saved = JSON.parse(remember(FILTER_KEY) ?? "null") as Partial<Filter> | null;
    return {
      hiddenKinds: Array.isArray(saved?.hiddenKinds)
        ? saved.hiddenKinds.filter((k) => KINDS.includes(k))
        : [],
      hiddenStatuses: Array.isArray(saved?.hiddenStatuses)
        ? saved.hiddenStatuses.filter((s) => STATUSES.includes(s))
        : [],
    };
  } catch {
    return NO_FILTER;
  }
}

function isFiltering(filter: Filter): boolean {
  return filter.hiddenKinds.length > 0 || filter.hiddenStatuses.length > 0;
}

/** The page with only the notes the filter lets through, each element counted again. */
function applyFilter(page: ReviewPage, filter: Filter): ReviewPage {
  if (!isFiltering(filter)) return page;
  const keep = (note: ReviewNote) =>
    !filter.hiddenStatuses.includes(note.status as Status) &&
    !filter.hiddenKinds.includes(note.reaction ?? "none");
  const elements = page.elements.flatMap((element) => {
    const notes = element.notes.filter(keep);
    if (notes.length === 0) return [];
    const counts = { love: 0, idea: 0, confused: 0, bug: 0, none: 0 };
    for (const note of notes) counts[note.reaction ?? "none"]++;
    return [{ ...element, notes, total: notes.length, counts }];
  });
  return { ...page, elements, unpinned: page.unpinned.filter(keep) };
}

/** Every note on the page: on elements, and on nothing. */
function pageNotes(page: ReviewPage): ReviewNote[] {
  return [...page.elements.flatMap((e) => e.notes), ...page.unpinned];
}

function noteCount(page: ReviewPage): number {
  return page.elements.reduce((n, e) => n + e.total, 0) + page.unpinned.length;
}

/** A section's heading in the filter menu, with a Reset (↺) once anything in it is off. */
function heading(label: string, changed: boolean, reset: () => void): HTMLElement {
  const head = el("div", "menu-head");
  head.append(el("p", "menu-label", label));
  if (changed) {
    const button = el("button", "menu-reset");
    button.type = "button";
    button.innerHTML = RESET_ICON;
    button.title = "Reset";
    button.setAttribute("aria-label", `Reset ${label.toLowerCase()}`);
    button.addEventListener("click", reset);
    head.append(button);
  }
  return head;
}

/** A toggle in the filter menu. */
function chip(
  lead: string,
  n: number,
  most: number,
  name: string,
  on: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", "chip");
  // An emoji or an icon, then the count, as wide as its widest so far.
  button.innerHTML = lead;
  const count = el("span", "chip-n", String(n));
  count.style.minWidth = `${String(Math.max(n, most)).length}ch`;
  button.append(count);
  button.type = "button";
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", name);
  button.addEventListener("click", onClick);
  return button;
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
