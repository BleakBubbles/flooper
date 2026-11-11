import { afterEach, describe, expect, it, vi } from "vitest";
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
  });
});
