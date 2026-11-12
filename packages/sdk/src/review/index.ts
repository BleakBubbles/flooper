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
/** Where the side panel was dragged and how big it was made, for this tab. */
const SIDE_KEY = "flooper-review-side";
const NO_REACTION = "💬";
// Lucide's scan-eye (review mode, the same as "View on site" in Flooper) and
// the speech bubble Flooper uses for notes. Stroked by the bar's CSS.
const REVIEW_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></svg>';
// Lucide's eye-off (notes the page can't show) and chevron-down (the pages list).
const OFF_PAGE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
// The app's archive icon: a note's Archive action.
const ARCHIVE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>';
// Lucide's rotate-ccw: a filter section's Reset, and a note's Reopen.
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

/**
 * The side panel's height to begin with, at most: its header, then a group
 * title and ten notes (36px each, 10px apart), and a bit of the next. It can
 * be made bigger (or smaller) from its corner.
 */
const SIDE_MAX = 560;

/** The side panel's place and size, once it's been dragged or resized. */
interface SideBox {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}
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
  /** The open menu under the bar (the filter, or the pages list), if any. */
  private menu: HTMLElement | null = null;
  private menuKind: "filter" | "pages" | null = null;
  /** The side panel of notes the page can't show, if it's open. */
  private side: HTMLElement | null = null;
  /** The open card's elements, to open it again after a note changes. */
  private cardSelectors: string[] = [];
  /** Closes the open card on a click anywhere else. */
  private cardCloser: ((event: Event) => void) | null = null;
  /** A short message at the bottom, when an action didn't work. */
  private readonly toast = el("div", "toast");
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
    this.toast.hidden = true;
    this.toast.setAttribute("role", "status");
    this.root.append(style, this.layer, this.label, this.bar, this.toast);
    document.documentElement.append(this.host);
    this.layer.addEventListener("click", this.click);
    // The bar's buttons look the same hovered as open, so one just closed by
    // a click would still look open under the pointer: it drops the hover
    // look until the pointer leaves it. (After the button's own click handler.)
    this.bar.addEventListener("click", (event) => {
      const button = (event.target as Element).closest("button[aria-expanded]");
      // Closed: shown closed. Opened again: shown open.
      button?.classList.toggle("settled", button.getAttribute("aria-expanded") === "false");
    });
    this.bar.addEventListener("pointerout", (event) => {
      const button = (event.target as Element).closest(".settled");
      if (button && !button.contains(event.relatedTarget as Node | null)) {
        button.classList.remove("settled");
      }
    });
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
    forget(SIDE_KEY);
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
    status: string | HTMLElement[],
    withSwitch = false,
    empty = false,
    filtering = false,
  ): void {
    const title = el("span", "title");
    title.innerHTML = REVIEW_ICON;
    title.append(text("Review mode"));
    let shown: HTMLElement[];
    if (typeof status === "string") {
      const message = el("span", "status");
      message.append(text(status));
      shown = [message];
    } else shown = status;
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
    this.bar.replaceChildren(first, ...shown, exit);
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
    count.setAttribute("aria-expanded", String(this.menuKind === "filter"));
    count.addEventListener("click", () =>
      this.menuKind === "filter" ? this.closeMenu() : this.openFilter(),
    );

    // The page you're on, as a button: it lists the site's pages with notes.
    const where = el("button", "status where");
    where.type = "button";
    where.append(el("span", "where-path", page.path));
    where.insertAdjacentHTML("beforeend", CHEVRON_ICON);
    where.title = "Pages with notes";
    where.setAttribute("aria-label", `${page.path}. Pages with notes`);
    where.setAttribute("aria-haspopup", "true");
    where.setAttribute("aria-expanded", String(this.menuKind === "pages"));
    where.addEventListener("click", () =>
      this.menuKind === "pages" ? this.closeMenu() : this.openPages(),
    );

    // The notes the page can't show (on no element, or one that's gone), if
    // any: a button that opens them in a panel at the side.
    const items = [where, count];
    const off = offPage(view);
    const offCount = off.unpinned.length + off.missing.reduce((n, e) => n + e.total, 0);
    if (offCount > 0) {
      const button = el("button", "status off");
      button.type = "button";
      button.innerHTML = OFF_PAGE_ICON;
      button.append(text(String(offCount)));
      button.title = `${plural(offCount, "note")} not on anything shown here`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-expanded", String(this.side !== null));
      button.addEventListener("click", () => (this.side ? this.closeSide() : this.openSide()));
      items.push(button);
    }
    this.layer.hidden = this.hidden;
    this.say(items, true, this.marks.length === 0, filtering);
    this.place();
    if (this.menuKind === "filter") this.openFilter();
    if (this.menuKind === "pages") this.openPages();
    if (this.side) {
      if (offCount > 0) this.openSide();
      else this.closeSide();
    }
  }

  /**
   * The filter menu, under the count: a toggle per reaction on this page and
   * per status, all on until you switch one off (a × beside "Reactions"
   * turns them all back on). It stays open while you pick, and each pick
   * redraws the page at once.
   */
  private openFilter(): void {
    const page = this.page;
    if (!page) return;
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
    this.showMenu(menu, "filter", ".count");
  }

  /**
   * The pages list, under the path: the site's pages with notes, busiest
   * first. Picking one goes there; the tab stays in review mode.
   */
  private openPages(): void {
    const page = this.page;
    if (!page) return;
    const menu = el("div", "menu pages");
    menu.setAttribute("aria-label", "Pages with notes");
    const list = el("ul", "page-list");
    for (const { path, total } of page.pages) {
      const row = el("button", "page-row");
      row.type = "button";
      row.append(el("span", "page-path", path), el("span", "page-total", String(total)));
      row.title = path;
      if (path === page.path) row.setAttribute("aria-current", "page");
      row.addEventListener("click", () => {
        this.closeMenu();
        if (path !== location.pathname) location.assign(path);
      });
      const item = el("li");
      item.append(row);
      list.append(item);
    }
    if (page.pages.length === 0) list.append(el("li", "menu-empty", "No notes on this site yet"));
    menu.append(list);
    this.showMenu(menu, "pages", ".where");
  }

  /** A menu under its button in the bar, kept on screen. One at a time. */
  private showMenu(menu: HTMLElement, kind: "filter" | "pages", anchor: string): void {
    this.menu?.remove();
    this.root.append(menu);
    this.menu = menu;
    this.menuKind = kind;
    const button = this.bar.querySelector(anchor);
    button?.setAttribute("aria-expanded", "true");
    const box = button?.getBoundingClientRect();
    const bar = this.bar.getBoundingClientRect();
    const middle = box ? box.left + box.width / 2 : innerWidth / 2;
    const left = Math.min(
      innerWidth - menu.offsetWidth - 8,
      Math.max(8, middle - menu.offsetWidth / 2),
    );
    Object.assign(menu.style, { left: `${left}px`, top: `${bar.bottom + 8}px` });
  }

  /**
   * A note's action (read or unread, done or reopened, archived): saved,
   * then the page drawn again with it, the open card and panel kept open.
   * Archived notes leave review mode, as they do everywhere.
   */
  private act = async (note: ReviewNote, status: ReviewNote["status"]): Promise<void> => {
    let res: Response | null = null;
    try {
      res = await fetch(`${this.ingestUrl}/review/notes/${encodeURIComponent(note.id)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "omit",
      });
    } catch {}
    if (res?.status === 401) {
      forget(STORAGE_KEY);
      this.say("This review link has expired. Open a new one from Flooper.");
      return;
    }
    if (!res?.ok || !this.page) {
      this.notify("Couldn't change that note. Try again.");
      return;
    }
    if (status === "archived") archive(this.page, note.id);
    else note.status = status;
    this.refresh();
  };

  /** The page drawn again after a change, with the card that was open opened again. */
  private refresh(): void {
    if (!this.page) return;
    const card = this.card;
    const kept = card
      ? {
          selectors: this.cardSelectors,
          left: Number.parseFloat(card.style.left),
          top: Number.parseFloat(card.style.top),
        }
      : null;
    this.draw(this.page);
    if (!kept) return;
    const marks = this.marks.filter((m) =>
      m.elements.some((e) => kept.selectors.includes(e.selector)),
    );
    if (marks.length > 0) this.openCard(marks, kept.left - 8, kept.top - 8);
  }

  /** A message at the bottom for a few seconds. */
  private notify(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, 4000);
  }
  private toastTimer = 0;

  private closeMenu(): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.menuKind = null;
    for (const b of this.bar.querySelectorAll(".count, .where")) {
      b.setAttribute("aria-expanded", "false");
    }
  }

  /**
   * The notes this page can't show, in a panel at the right: those on no
   * element, and those whose element isn't on the page (any more). The
   * filter applies here too.
   */
  private openSide(): void {
    const page = this.page;
    if (!page) return;
    const { unpinned, missing } = offPage(applyFilter(page, this.filter));
    const side = el("aside", "side");
    side.setAttribute("aria-label", "Other notes");
    // A header to drag it by, with the way to close it.
    const head = el("div", "side-head");
    head.append(el("p", "side-name", "Other notes"));
    const close = el("button", "side-x");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = CLOSE_ICON;
    close.addEventListener("click", () => this.closeSide());
    head.append(close);
    this.draggable(side, head);
    const body = el("div", "card-body");
    if (unpinned.length > 0) {
      const section = el("section", "card-section");
      section.append(el("p", "side-title", `Not on an element · ${unpinned.length}`));
      const list = el("ul", "notes");
      for (const note of unpinned) list.append(noteItem(note, this.app, this.act));
      section.append(list);
      body.append(section);
    }
    if (missing.length > 0) {
      const section = el("section", "card-section");
      const n = missing.reduce((sum, e) => sum + e.total, 0);
      section.append(el("p", "side-title", `Element not found · ${n}`));
      for (const element of missing) {
        const head = el("div", "card-head");
        head.append(
          el("p", "card-title", describe(element)),
          el("span", "card-counts", counts([element])),
        );
        const list = el("ul", "notes");
        for (const note of element.notes) list.append(noteItem(note, this.app, this.act));
        section.append(head, list);
      }
      body.append(section);
    }
    side.append(head, body);
    // Drawn again (a note changed, or the filter): where the list was scrolled to.
    const scrolled = this.side?.querySelector(".card-body")?.scrollTop ?? 0;
    this.side?.remove();
    this.root.append(side);
    this.side = side;
    this.placeSide(side);
    body.scrollTop = scrolled;
    this.bar.querySelector(".off")?.setAttribute("aria-expanded", "true");
  }

  /**
   * Where the side panel goes: where it was dragged and at the size it was
   * made, if it was, kept on screen. Otherwise at the right under the bar,
   * about ten notes tall at most, and on short windows ending above the
   * widget's button (48px, 20px from the corner).
   */
  private placeSide(side: HTMLElement): void {
    const saved = readSide();
    const top = this.bar.getBoundingClientRect().bottom + 8;
    if (saved.width) side.style.width = `${Math.min(saved.width, innerWidth - 16)}px`;
    const height = saved.height
      ? Math.min(saved.height, innerHeight - 16)
      : Math.max(160, Math.min(SIDE_MAX, innerHeight - top - 88));
    if (saved.height || side.offsetHeight > height) side.style.height = `${height}px`;
    if (saved.left !== undefined && saved.top !== undefined) {
      this.moveSide(side, saved.left, saved.top);
    } else {
      side.style.top = `${top}px`;
    }
    // Made bigger or smaller from its corner: remember that size.
    if (typeof ResizeObserver === "function") {
      const set = { width: side.offsetWidth, height: side.offsetHeight };
      new ResizeObserver(() => {
        if (!side.isConnected) return;
        const width = side.offsetWidth;
        const height = side.offsetHeight;
        if (width === set.width && height === set.height) return;
        set.width = width;
        set.height = height;
        writeSide({ ...readSide(), width, height });
      }).observe(side);
    }
  }

  /** The side panel at (left, top), kept where its header can still be grabbed. */
  private moveSide(side: HTMLElement, left: number, top: number): void {
    const x = Math.min(Math.max(left, 8 - side.offsetWidth + 80), innerWidth - 80);
    const y = Math.min(Math.max(top, 8), innerHeight - 40);
    Object.assign(side.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
  }

  /** Dragging the side panel by its header (not its buttons): it stays where it's let go. */
  private draggable(side: HTMLElement, head: HTMLElement): void {
    let from: { x: number; y: number; left: number; top: number } | null = null;
    head.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target as Element).closest("button")) return;
      event.preventDefault();
      const box = side.getBoundingClientRect();
      from = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      // Keep getting the moves when the pointer outruns the header.
      try {
        head.setPointerCapture(event.pointerId);
      } catch {}
      side.classList.add("dragging");
    });
    head.addEventListener("pointermove", (event) => {
      if (!from) return;
      this.moveSide(side, from.left + event.clientX - from.x, from.top + event.clientY - from.y);
    });
    const drop = () => {
      if (!from) return;
      from = null;
      side.classList.remove("dragging");
      const left = Number.parseFloat(side.style.left);
      const top = Number.parseFloat(side.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) writeSide({ ...readSide(), left, top });
    };
    head.addEventListener("pointerup", drop);
    head.addEventListener("pointercancel", drop);
  }

  private closeSide(): void {
    if (!this.side) return;
    this.side.remove();
    this.side = null;
    this.bar.querySelector(".off")?.setAttribute("aria-expanded", "false");
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

  /** Esc: close a menu, or else the notes card, or else the side panel. */
  private escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.menu) this.closeMenu();
    else if (this.card) this.closeCard();
    else this.closeSide();
  };

  /** A press anywhere but the menu or its button (which toggles it) closes the menu. */
  private outside = (event: PointerEvent): void => {
    if (!this.menu) return;
    const path = event.composedPath();
    const toggles = (t: EventTarget) =>
      t instanceof HTMLElement && (t.classList.contains("count") || t.classList.contains("where"));
    if (path.includes(this.menu) || path.some(toggles)) return;
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
      for (const note of element.notes) list.append(noteItem(note, this.app, this.act));
      section.append(list);
      body.append(section);
    }
    this.cardSelectors = marks.flatMap((m) => m.elements.map((e) => e.selector));
    this.layer.append(card);
    this.card = card;
    // Beside the click, kept on screen, then pinned there against the element.
    const left = Math.min(innerWidth - card.offsetWidth - 8, Math.max(8, at.x + 8));
    const top = Math.min(innerHeight - card.offsetHeight - 8, Math.max(8, at.y + 8));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    const mark = marks[0] as Mark;
    this.pin = { mark, dx: left - mark.box.left, dy: top - mark.box.top };
    // A click anywhere else closes it (in the overlay or on the page). Not
    // the click that opened it, which is still on its way.
    const closer = (event: Event) => {
      if (!event.composedPath().includes(card)) this.closeCard();
    };
    this.cardCloser = closer;
    setTimeout(() => {
      if (this.cardCloser === closer) document.addEventListener("click", closer, true);
    });
  }

  private closeCard(): void {
    if (!this.card) return;
    this.card.remove();
    this.card = null;
    this.pin = null;
    if (this.cardCloser) document.removeEventListener("click", this.cardCloser, true);
    this.cardCloser = null;
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

/** Where the side panel was put and how big it was made, if it was. */
function readSide(): SideBox {
  try {
    const saved = JSON.parse(remember(SIDE_KEY) ?? "null") as SideBox | null;
    if (!saved || typeof saved !== "object") return {};
    const box: SideBox = {};
    for (const key of ["left", "top", "width", "height"] as const) {
      if (typeof saved[key] === "number" && Number.isFinite(saved[key])) box[key] = saved[key];
    }
    return box;
  } catch {
    return {};
  }
}

function writeSide(box: SideBox): void {
  remember(SIDE_KEY, JSON.stringify(box));
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

/** The page's notes it can't show: on no element, and on elements it can't find. */
function offPage(page: ReviewPage): { unpinned: ReviewNote[]; missing: ReviewElement[] } {
  return { unpinned: page.unpinned, missing: page.elements.filter((e) => !find(e.selector)) };
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

/**
 * A note's actions, like the app's: read or unread, done or reopened, and
 * archive. Shown on hover (or keyboard focus), so the list stays calm.
 */
function noteActions(
  note: ReviewNote,
  act: (note: ReviewNote, status: ReviewNote["status"]) => Promise<void>,
): HTMLElement {
  const actions = el("span", "note-actions");
  const button = (label: string, icon: string, status: ReviewNote["status"]) => {
    const b = el("button", "note-action");
    b.type = "button";
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", async () => {
      for (const other of actions.querySelectorAll("button")) other.disabled = true;
      await act(note, status);
      // Still here if it didn't work (a changed note is drawn again).
      for (const other of actions.querySelectorAll("button")) other.disabled = false;
    });
    actions.append(b);
  };
  if (note.status === "new") button("Mark as read", STATUS_ICONS.seen, "seen");
  if (note.status === "seen") button("Mark as unread", STATUS_ICONS.new, "new");
  if (note.status === "done" || note.status === "archived") button("Reopen", RESET_ICON, "new");
  else button("Mark done", STATUS_ICONS.done, "done");
  if (note.status !== "archived") button("Archive", ARCHIVE_ICON, "archived");
  return actions;
}

/** Take an archived note out of the page, its counts and its totals. */
function archive(page: ReviewPage, id: string): void {
  const before = noteCount(page);
  page.unpinned = page.unpinned.filter((n) => n.id !== id);
  page.elements = page.elements.flatMap((element) => {
    const notes = element.notes.filter((n) => n.id !== id);
    if (notes.length === element.notes.length) return [element];
    if (notes.length === 0) return [];
    const counts = { love: 0, idea: 0, confused: 0, bug: 0, none: 0 };
    for (const n of notes) counts[n.reaction ?? "none"]++;
    return [{ ...element, notes, total: notes.length, counts }];
  });
  if (noteCount(page) < before) {
    page.siteTotal = Math.max(0, page.siteTotal - 1);
    page.pages = page.pages
      .map((p) => (p.path === page.path ? { ...p, total: p.total - 1 } : p))
      .filter((p) => p.total > 0);
  }
}

function noteItem(
  note: ReviewNote,
  app: string,
  act: (note: ReviewNote, status: ReviewNote["status"]) => Promise<void>,
): HTMLElement {
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
    noteActions(note, act),
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
