import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmitResult } from "../api";
import { type SubmitHandler, Widget } from "./widget";

let widget: Widget | undefined;
afterEach(() => {
  widget?.destroy();
  widget = undefined;
});

/** Mount a widget, type a note and press Send; returns its shadow root. */
async function send(result: SubmitResult) {
  const onSubmit = vi.fn<SubmitHandler>().mockResolvedValue(result);
  widget = new Widget(
    {
      position: "bottom-right",
      launcher: true,
      theme: "auto",
      title: "Hi",
      homeUrl: "https://flooper.test/",
    },
    onSubmit,
  );
  widget.mount();
  widget.open();
  const root = widget.host.shadowRoot as ShadowRoot;
  const message = root.querySelector("textarea") as HTMLTextAreaElement;
  message.value = "Cool website!";
  message.dispatchEvent(new Event("input"));
  root.querySelector("form")?.requestSubmit();
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
  await Promise.resolve();
  return root;
}

const status = (root: ShadowRoot) => root.querySelector(".status");

describe("Widget", () => {
  it("thanks the visitor when the note is accepted", async () => {
    const root = await send({ ok: true, id: "fb_1" });
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>(".thanks")?.hidden).toBe(false));
  });

  it.each([
    ["network_error", /Couldn't connect/],
    ["rate_limited", /Try again in a minute/],
    ["origin_not_allowed", /aren't on for this site/],
    ["validation_failed", /Couldn't send that/],
  ] as const)("explains a %s failure and keeps the note", async (code, text) => {
    const root = await send({ ok: false, code, message: "server detail" });
    await vi.waitFor(() => expect(status(root)?.textContent).toMatch(text));
    expect(status(root)?.getAttribute("data-tone")).toBe("error");
    // The visitor's words survive, so trying again is one click.
    expect(root.querySelector("textarea")?.value).toBe("Cool website!");
  });

  it("links the credit to Flooper's home page, and only to a web page", () => {
    widget = new Widget(
      {
        position: "bottom-right",
        launcher: true,
        theme: "auto",
        title: "Hi",
        homeUrl: "javascript:alert(1)",
      },
      vi.fn(),
    );
    const link = widget.host.shadowRoot?.querySelector(".powered");
    expect(link?.hasAttribute("href")).toBe(false);
  });

  it("can leave out its button, and still opens from the site's own", () => {
    widget = new Widget(
      {
        position: "bottom-right",
        launcher: false,
        theme: "auto",
        title: "Hi",
        homeUrl: "https://flooper.test/",
      },
      vi.fn(),
    );
    widget.mount();
    const root = widget.host.shadowRoot as ShadowRoot;
    expect(root.querySelector<HTMLElement>(".launcher")?.hidden).toBe(true);
    widget.open();
    expect(root.querySelector<HTMLElement>(".panel")?.hidden).toBe(false);
    // With no button of its own, the panel's × is the way to close it by pointer.
    root.querySelector<HTMLButtonElement>(".x")?.click();
    expect(root.querySelector<HTMLElement>(".panel")?.hidden).toBe(true);
  });

  it("closes from its ×, which isn't mistaken for the picked element's remove button", () => {
    widget = new Widget(
      {
        position: "bottom-right",
        launcher: true,
        theme: "auto",
        title: "Hi",
        homeUrl: "https://flooper.test/",
      },
      vi.fn(),
    );
    widget.mount();
    widget.open();
    const root = widget.host.shadowRoot as ShadowRoot;
    // The × shares the remove button's look (class), so it comes after it.
    expect(root.querySelector(".target-clear")?.closest(".target-chip")).not.toBeNull();
    const x = root.querySelector<HTMLButtonElement>(".x");
    expect(x?.getAttribute("aria-label")).toBe("Close");
    x?.click();
    expect(root.querySelector<HTMLElement>(".panel")?.hidden).toBe(true);
    expect(root.querySelector(".launcher")?.getAttribute("aria-expanded")).toBe("false");
  });

  describe("its button's label on a visitor's first look", () => {
    const mount = (launcher = true) => {
      widget?.destroy();
      widget = new Widget(
        { position: "bottom-right", launcher, theme: "auto", title: "Hi", homeUrl: "" },
        vi.fn(),
      );
      widget.mount();
      return widget.host.shadowRoot?.querySelector(".launcher") as HTMLElement;
    };
    const showing = (button: HTMLElement) => button.classList.contains("hello");

    // Opening the widget counts as having seen it, and other tests open it.
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.useRealTimers());

    it("shows a moment after load, then tucks away, and only the first time", () => {
      vi.useFakeTimers();
      let button = mount();
      expect(showing(button)).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(showing(button)).toBe(true);
      vi.advanceTimersByTime(4000);
      expect(showing(button)).toBe(false);

      // The next page: the visitor has seen it.
      button = mount();
      vi.advanceTimersByTime(6000);
      expect(showing(button)).toBe(false);
    });

    it("goes when the widget opens", () => {
      vi.useFakeTimers();
      const button = mount();
      vi.advanceTimersByTime(1000);
      widget?.open();
      expect(showing(button)).toBe(false);
    });

    it("doesn't count as seen on a site with its own button", () => {
      vi.useFakeTimers();
      mount(false);
      vi.advanceTimersByTime(6000);
      expect(localStorage.getItem("flooper-hello")).toBeNull();
    });
  });

  it("keeps keys typed in its boxes from the site's own shortcuts", () => {
    widget = new Widget(
      { position: "bottom-right", launcher: true, theme: "auto", title: "Hi", homeUrl: "" },
      vi.fn(),
    );
    widget.mount();
    widget.open();
    const root = widget.host.shadowRoot as ShadowRoot;
    const reached = vi.fn();
    const types = ["keydown", "keyup", "keypress"];
    for (const type of types) document.addEventListener(type, reached);
    const press = (el: Element | null) => {
      for (const type of types) {
        el?.dispatchEvent(new KeyboardEvent(type, { key: "/", bubbles: true, composed: true }));
      }
    };
    try {
      press(root.querySelector("textarea"));
      press(root.querySelector(".reply input"));
      expect(reached).not.toHaveBeenCalled();
      // Anywhere else in the widget, keys still reach the page as usual.
      press(root.querySelector(".reaction"));
      expect(reached).toHaveBeenCalledTimes(3);
    } finally {
      for (const type of types) document.removeEventListener(type, reached);
    }
  });
});
