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
    expect(count?.getAttribute("aria-label")).toBe("7 of this site's 40 notes are on this page");
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
