import { afterEach, describe, expect, it } from "vitest";
import { isTyping } from "./keys";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Press a key on `el`, and report what isTyping says at the window. */
function pressOn(el: Element, alsoIgnore?: string): boolean {
  let typing: boolean | undefined;
  const listener = (event: KeyboardEvent) => {
    typing = isTyping(event, alsoIgnore);
  };
  window.addEventListener("keydown", listener);
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true, composed: true }));
  window.removeEventListener("keydown", listener);
  return typing as boolean;
}

describe("isTyping", () => {
  it("is a shortcut on the page, but not in a field", () => {
    document.body.innerHTML = `<button>Open</button><input><textarea></textarea>`;
    expect(pressOn(document.querySelector("button") as Element)).toBe(false);
    expect(pressOn(document.querySelector("input") as Element)).toBe(true);
    expect(pressOn(document.querySelector("textarea") as Element)).toBe(true);
  });

  it("leaves keys inside another widget's shadow root alone, like the feedback widget's", () => {
    const host = document.createElement("flooper-widget");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<textarea></textarea><button>❤️</button>`;
    expect(pressOn(root.querySelector("textarea") as Element)).toBe(true);
    expect(pressOn(root.querySelector("button") as Element)).toBe(true);
  });

  it("can ignore more, like an open dialog", () => {
    document.body.innerHTML = `<dialog open><button>Close</button></dialog>`;
    const button = document.querySelector("button") as Element;
    expect(pressOn(button)).toBe(false);
    expect(pressOn(button, ", dialog")).toBe(true);
  });
});
