import { beforeEach, describe, expect, it } from "vitest";
import { Highlighter } from "./highlight";
import { type HitTest, Picker } from "./picker";

let host: HTMLElement;
let root: ShadowRoot;
let highlighter: Highlighter;
let underPointer: Element | null;

beforeEach(() => {
  document.body.innerHTML = `<main><h2 id="title">Hello <em>world</em></h2></main>`;
  host = document.createElement("div");
  root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <div class="highlight" hidden><span class="highlight-label"></span></div>
    <div class="pick-layer" hidden><button class="pick-cancel">Cancel</button></div>`;
  document.body.appendChild(host);
  highlighter = new Highlighter(
    root.querySelector(".highlight") as HTMLElement,
    root.querySelector(".highlight-label") as HTMLElement,
  );
  underPointer = null;
});

// Real browsers report the shadow host first (our layer is on top), then the page.
const hitTest: HitTest = () => [host, ...(underPointer ? [underPointer] : [])];

const layer = () => root.querySelector(".pick-layer") as HTMLElement;
const box = () => root.querySelector(".highlight") as HTMLElement;
const pointer = (type: string) =>
  layer().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 }));

describe("Picker", () => {
  it("resolves with the clicked element, its selector and text", async () => {
    const picker = new Picker(root, host, highlighter, hitTest);
    const result = picker.pick();
    expect(layer().hidden).toBe(false);

    underPointer = document.querySelector("em");
    pointer("pointermove");
    expect(box().hidden).toBe(false);
    expect(root.querySelector(".highlight-label")?.textContent).toBe("Hello world");
    pointer("click");

    expect(await result).toEqual({
      element: document.querySelector("#title"),
      target: { selector: "#title", text: "Hello world" },
    });
    expect(layer().hidden).toBe(true);
    expect(box().hidden).toBe(true);
    expect(picker.active).toBe(false);
  });

  it("resolves with null when cancelled with Escape", async () => {
    const picker = new Picker(root, host, highlighter, hitTest);
    const result = picker.pick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await result).toBeNull();
    expect(layer().hidden).toBe(true);
  });

  it("resolves with null when clicking nothing pickable", async () => {
    const picker = new Picker(root, host, highlighter, hitTest);
    const result = picker.pick();
    pointer("click");
    expect(await result).toBeNull();
  });
});

describe("Highlighter", () => {
  it("hides itself when its element leaves the page", () => {
    const h2 = document.querySelector("h2") as Element;
    highlighter.show(h2);
    expect(box().hidden).toBe(false);
    h2.remove();
    window.dispatchEvent(new Event("scroll"));
    expect(box().hidden).toBe(true);
  });

  it("shows a caption only when given one", () => {
    highlighter.show(document.querySelector("h2") as Element);
    expect((root.querySelector(".highlight-label") as HTMLElement).hidden).toBe(true);
    highlighter.show(document.querySelector("h2") as Element, "Hello");
    expect((root.querySelector(".highlight-label") as HTMLElement).hidden).toBe(false);
  });
});
