import type { ReviewElement, ReviewPage } from "@flooper/shared/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./index";

const INGEST = "https://flooper.test/api/v1/ingest/pk_test";
const now = new Date().toISOString();

function element(selector: string, text: string, message: string): ReviewElement {
  return {
    selector,
    text,
    total: 1,
    counts: { bug: 1, confused: 0, love: 0, idea: 0, none: 0 },
    notes: [{ id: `fb_${selector}`, reaction: "bug", message, status: "new", createdAt: now }],
  };
}

// A section with a heading inside it (nested), a card whose only child fills
// it (the same space), and one element that's gone from the page.
const PAGE: ReviewPage = {
  path: "/",
  elements: [
    { ...element("#projects", "Projects", "Section note"), total: 2 },
    element("#projects h2", "Projects", "Heading note"),
    element("#card", "Card", "Card note"),
    element("#card p", "Card text", "Card text note"),
    element("#gone", "Old", "Gone note"),
  ],
  unpinned: [{ id: "fb_x", reaction: "love", message: "Nice", status: "seen", createdAt: now }],
  truncated: false,
  siteTotal: 40,
};

// No layout in the test DOM: give each element a box.
const BOXES: Record<string, [number, number, number, number]> = {
  projects: [100, 100, 400, 300], // left, top, width, height
  heading: [120, 120, 200, 40],
  card: [600, 100, 200, 100],
  "card-text": [601, 101, 198, 98],
};

function overlay(): ShadowRoot {
  const host = document.querySelector("flooper-review");
  if (!host?.shadowRoot) throw new Error("overlay not mounted");
  return host.shadowRoot;
}
const areas = () => [...overlay().querySelectorAll<HTMLButtonElement>(".area")];
const titles = () => [...overlay().querySelectorAll(".card-title")].map((t) => t.textContent);

/** A click at (x, y), on whichever highlight is there. */
function clickAt(x: number, y: number) {
  const target = areas().find((a) => {
    const l = Number.parseFloat(a.style.left);
    const t = Number.parseFloat(a.style.top);
    return (
      x >= l &&
      x <= l + Number.parseFloat(a.style.width) &&
      y >= t &&
      y <= t + Number.parseFloat(a.style.height)
    );
  });
  target?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX: x, clientY: y, detail: 1 }),
  );
}

beforeEach(() => {
  document.body.innerHTML = `
    <section id="projects"><h2>Projects</h2></section>
    <div id="card"><p>Card text</p></div>`;
  const ids: Record<string, string> = {
    projects: "projects",
    card: "card",
  };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const key =
      ids[this.id] ?? (this.tagName === "H2" ? "heading" : this.tagName === "P" ? "card-text" : "");
    const box = BOXES[key];
    return box ? new DOMRect(...box) : new DOMRect();
  });
  // What's painted at a point: innermost first, like a browser.
  document.elementsFromPoint = () => [];
});

afterEach(() => {
  overlay().querySelector<HTMLButtonElement>(".exit")?.click();
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function start(page: ReviewPage = PAGE) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(page)));
  vi.stubGlobal("fetch", fetchMock);
  window.FlooperReview?.(INGEST, "tok_123");
  await vi.waitFor(() => expect(overlay().querySelector(".switch")).not.toBeNull());
  return fetchMock;
}

describe("review mode's overlay", () => {
  it("asks for this page with the token, and highlights the elements it finds", async () => {
    const fetchMock = await start();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${INGEST}/review?path=%2F`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_123");
    // #gone isn't on the page, and the card and its only child share one
    // highlight: three.
    expect(areas().filter((a) => !a.hidden)).toHaveLength(3);
    // The bar counts every note on this page (pointing at #gone, or nothing,
    // too) against the site's.
    const count = overlay().querySelector(".count");
    expect(count?.textContent).toBe("7/40");
    expect(count?.getAttribute("title")).toBe("7 of this site's 40 notes are on this page");
  });

  it("opens the innermost element's notes, and the outer one's from its own edge", async () => {
    await start();
    clickAt(150, 135); // On the heading, inside the section.
    expect(titles()).toEqual(["“Projects”"]);
    expect(overlay().querySelector(".note-text")?.textContent).toBe("Heading note");

    clickAt(110, 350); // On the section, outside the heading.
    expect(overlay().querySelector(".note-text")?.textContent).toBe("Section note");
    const link = overlay().querySelector(".card a.note-text");
    expect(link?.getAttribute("href")).toBe("https://flooper.test/?note=fb_%23projects");
  });

  it("keeps the notes beside their element as the page scrolls, and closes from ×", async () => {
    await start();
    clickAt(150, 135); // The heading.
    const card = () => overlay().querySelector<HTMLElement>(".card");
    const top = Number.parseFloat(card()?.style.top ?? "");
    const left = Number.parseFloat(card()?.style.left ?? "");

    // The page scrolls 50px: everything moves up, and the card with it.
    for (const box of Object.values(BOXES)) box[1] -= 50;
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(Number.parseFloat(card()?.style.top ?? "")).toBe(top - 50));
    expect(Number.parseFloat(card()?.style.left ?? "")).toBe(left);
    for (const box of Object.values(BOXES)) box[1] += 50;

    const x = overlay().querySelector<HTMLButtonElement>(".card-x");
    expect(x?.getAttribute("aria-label")).toBe("Close");
    x?.click();
    expect(card()).toBeNull();
  });

  it("moves the hover off an element that scrolls away from a still pointer", async () => {
    await start();
    // What's on top at a point in the overlay: the highlight there, if any.
    const root = overlay();
    root.elementFromPoint = (x: number, y: number) =>
      areas().find((a) => {
        const l = Number.parseFloat(a.style.left);
        const t = Number.parseFloat(a.style.top);
        return (
          x >= l &&
          x <= l + Number.parseFloat(a.style.width) &&
          y >= t &&
          y <= t + Number.parseFloat(a.style.height)
        );
      }) ?? null;
    const heading = areas().filter((a) => a.getAttribute("aria-label")?.endsWith("“Projects”"))[1];
    heading?.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        composed: true,
        clientX: 150,
        clientY: 135,
      }),
    );
    expect(heading?.classList.contains("on")).toBe(true);
    expect(root.querySelector<HTMLElement>(".label")?.hidden).toBe(false);

    // The page scrolls 400px under the pointer: nothing with notes is there now.
    for (const box of Object.values(BOXES)) box[1] -= 400;
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(heading?.classList.contains("on")).toBe(false));
    expect(root.querySelector<HTMLElement>(".label")?.hidden).toBe(true);
    for (const box of Object.values(BOXES)) box[1] += 400;
  });

  it("draws elements filling the same space as one highlight, and opens both", async () => {
    await start();
    const card = areas().find((a) => a.getAttribute("aria-label")?.includes("Card"));
    expect(card?.getAttribute("aria-label")).toBe("2 notes on “Card text” and “Card”");
    clickAt(700, 150);
    expect([...overlay().querySelectorAll(".note-text")].map((n) => n.textContent)).toEqual([
      "Card text note",
      "Card note",
    ]);
  });

  it("fills nested highlights less, so a stack stays see-through", async () => {
    await start();
    const max = (label: string) =>
      areas()
        .find((a) => a.getAttribute("aria-label")?.endsWith(label))
        ?.style.getPropertyValue("--max");
    expect(max("on “Projects”")).toBe("0.4"); // The section (outermost; listed first).
    const heading = areas().filter((a) => a.getAttribute("aria-label")?.endsWith("“Projects”"))[1];
    expect(heading?.style.getPropertyValue("--max")).toBe(String(0.4 * 0.75));
  });

  it("switches the highlights off and on, remembering it for the tab", async () => {
    await start();
    const layer = overlay().querySelector(".layer") as HTMLElement;
    overlay().querySelector<HTMLButtonElement>(".switch")?.click();
    expect(layer.hidden).toBe(true);
    expect(overlay().querySelector(".switch")?.getAttribute("aria-checked")).toBe("false");
    expect(sessionStorage.getItem("flooper-review-hidden")).toBe("1");
    overlay().querySelector<HTMLButtonElement>(".switch")?.click();
    expect(layer.hidden).toBe(false);
    expect(sessionStorage.getItem("flooper-review-hidden")).toBeNull();
  });

  it("shows the switch greyed out when there's nothing here to highlight", async () => {
    await start({ ...PAGE, elements: [element("#gone", "Old", "Gone note")] });
    const toggle = overlay().querySelector<HTMLButtonElement>(".switch");
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(toggle?.title).toBe("Nothing on this page to highlight");
    // The counts still cover every note on the page.
    expect(overlay().querySelector(".count")?.textContent).toBe("2/40");
  });

  describe("the filter menu", () => {
    const menu = () => overlay().querySelector<HTMLElement>(".menu");
    const chips = () => [...overlay().querySelectorAll<HTMLButtonElement>(".menu .chip")];
    const chipNamed = (name: string) =>
      chips().find((c) => c.getAttribute("aria-label")?.startsWith(name));
    const openMenu = () => overlay().querySelector<HTMLButtonElement>(".count")?.click();
    const reset = (section: string) =>
      overlay().querySelector<HTMLButtonElement>(`.menu-reset[aria-label="Reset ${section}"]`);
    const visible = () => areas().filter((a) => !a.hidden).length;

    it("opens from the count, with a toggle per reaction and per status", async () => {
      await start();
      openMenu();
      expect(menu()).not.toBeNull();
      // A new bug note on each of the five elements, and a read love note on
      // nothing. Everything is on to begin with; nothing here is done.
      expect(chips().map((c) => c.getAttribute("aria-label"))).toEqual([
        "Love it, 1",
        "Broken, 5",
        "New, 5",
        "Read, 1",
        "Done, 0",
      ]);
      expect(chips().every((c) => c.getAttribute("aria-pressed") === "true")).toBe(true);
      expect(chipNamed("Done")?.disabled).toBe(true);
      // Esc closes it.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(menu()).toBeNull();
    });

    it("hides a reaction switched off, and shows the filter in the count", async () => {
      await start();
      openMenu();
      chipNamed("Broken")?.click();
      // Only the love note is left, and it isn't on an element: nothing to highlight.
      expect(visible()).toBe(0);
      expect(overlay().querySelector(".count")?.textContent).toBe("1/40");
      expect(overlay().querySelector(".count")?.classList.contains("filtered")).toBe(true);
      expect(overlay().querySelector<HTMLButtonElement>(".switch")?.title).toBe(
        "Nothing on this page matches the filter",
      );
      // The menu stays open to pick more; Reset beside "Reactions" turns
      // them all back on, and only shows while one is off.
      expect(chipNamed("Broken")?.getAttribute("aria-pressed")).toBe("false");
      expect(reset("status")).toBeNull();
      reset("reactions")?.click();
      expect(visible()).toBe(3);
      expect(overlay().querySelector(".count")?.textContent).toBe("7/40");
      expect(reset("reactions")).toBeNull();
      expect(sessionStorage.getItem("flooper-review-filter")).toBeNull();
    });

    it("hides a status switched off, and remembers it for the tab's next pages", async () => {
      const page: ReviewPage = {
        ...PAGE,
        elements: PAGE.elements.map((e) =>
          e.selector === "#card"
            ? { ...e, notes: e.notes.map((n) => ({ ...n, status: "done" as const })) }
            : e,
        ),
      };
      await start(page);
      openMenu();
      chipNamed("Done")?.click();
      // The card's only note is done; its child's remains, so the card's
      // space still has a highlight, now with one note.
      const card = areas().find((a) => a.getAttribute("aria-label")?.includes("Card"));
      expect(card?.getAttribute("aria-label")).toBe("1 note on “Card text”");
      expect(JSON.parse(sessionStorage.getItem("flooper-review-filter") ?? "{}")).toEqual({
        hiddenKinds: [],
        hiddenStatuses: ["done"],
      });
      expect(chipNamed("Done")?.getAttribute("aria-pressed")).toBe("false");
      // Each section's Reset leaves the other alone.
      chipNamed("Broken")?.click();
      reset("reactions")?.click();
      expect(chipNamed("Done")?.getAttribute("aria-pressed")).toBe("false");
      expect(chipNamed("Broken")?.getAttribute("aria-pressed")).toBe("true");
      chipNamed("Broken")?.click();
      reset("status")?.click();
      expect(chipNamed("Done")?.getAttribute("aria-pressed")).toBe("true");
      expect(chipNamed("Broken")?.getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("says so when the link has expired, and forgets it", async () => {
    sessionStorage.setItem("flooper-review", "tok_old");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    window.FlooperReview?.(INGEST, "tok_old");
    await vi.waitFor(() =>
      expect(overlay().querySelector(".status")?.textContent).toMatch(/expired/),
    );
    expect(sessionStorage.getItem("flooper-review")).toBeNull();
  });

  it("keeps one overlay when the site loads the script again", async () => {
    await start();
    // A single-page app moving between pages sets the widget up again, which
    // loads this script again.
    vi.resetModules();
    await import("./index");
    window.FlooperReview?.(INGEST, "tok_123");
    expect(document.querySelectorAll("flooper-review")).toHaveLength(1);
    overlay().querySelector<HTMLButtonElement>(".exit")?.click();
    expect(document.querySelector("flooper-review")).toBeNull();
    // Mounted again so afterEach's Exit has something to click.
    await start();
  });

  it("leaves review mode on Exit", async () => {
    sessionStorage.setItem("flooper-review", "tok_123");
    await start();
    overlay().querySelector<HTMLButtonElement>(".exit")?.click();
    expect(document.querySelector("flooper-review")).toBeNull();
    expect(sessionStorage.getItem("flooper-review")).toBeNull();
    // Mounted again so afterEach's Exit has something to click.
    await start();
  });
});
