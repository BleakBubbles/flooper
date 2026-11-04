import { afterEach, describe, expect, it, vi } from "vitest";
import { type FlooperInstance, init } from "./index";

let instance: FlooperInstance | undefined;

afterEach(() => {
  instance?.destroy();
  instance = undefined;
  vi.unstubAllGlobals();
});

function shadow(): ShadowRoot {
  const host = document.querySelector("flooper-widget");
  if (!host?.shadowRoot) throw new Error("widget not mounted");
  return host.shadowRoot;
}

describe("init", () => {
  it("mounts a launcher inside a shadow root", () => {
    instance = init({ projectKey: "pk_test" });
    expect(shadow().querySelector(".launcher")).not.toBeNull();
  });

  it("returns the same instance when called twice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    instance = init({ projectKey: "pk_test" });
    expect(init({ projectKey: "pk_other" })).toBe(instance);
    expect(warn).toHaveBeenCalled();
  });

  it("only enables Send once there is something to send", () => {
    instance = init({ projectKey: "pk_test" });
    const root = shadow();
    const send = root.querySelector<HTMLButtonElement>(".send");
    expect(send?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-reaction="idea"]')?.click();
    expect(send?.disabled).toBe(false);
  });

  it("submits the reaction, message and page context", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "fb_1" }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    instance = init({
      projectKey: "pk_test",
      apiUrl: "https://api.test/",
      metadata: { plan: "free" },
    });

    const root = shadow();
    root.querySelector<HTMLButtonElement>(".launcher")?.click();
    root.querySelector<HTMLButtonElement>('[data-reaction="love"]')?.click();
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "  cool site!  ";
    root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init_] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/ingest/pk_test/feedback");
    const body = JSON.parse(init_.body as string);
    expect(body).toMatchObject({
      reaction: "love",
      message: "cool site!",
      metadata: { plan: "free" },
      context: { sdkVersion: expect.any(String), viewport: expect.any(Object) },
    });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(() =>
      expect(root.querySelector(".thanks")?.hasAttribute("hidden")).toBe(false),
    );
  });

  it("fills in the example message with → when the box is empty", () => {
    instance = init({ projectKey: "pk_test" });
    const root = shadow();
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    const send = root.querySelector(".send") as HTMLButtonElement;
    const arrow = () =>
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));

    arrow();
    expect(textarea.value).toBe(textarea.placeholder);
    expect(send.disabled).toBe(false);

    // Once there's text, → is just the normal cursor key again.
    textarea.value = "Hi";
    arrow();
    expect(textarea.value).toBe("Hi");
  });

  it("closes on Escape", () => {
    instance = init({ projectKey: "pk_test" });
    instance.open();
    const panel = shadow().querySelector(".panel") as HTMLElement;
    expect(panel.hidden).toBe(false);
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(panel.hidden).toBe(true);
  });

  it("picks an element, highlights it from the chip, and sends it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "fb_1" }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    document.body.insertAdjacentHTML("afterbegin", `<h2 id="projects">Projects</h2>`);
    const heading = document.getElementById("projects") as HTMLElement;
    // happy-dom has no layout, so stand in for the browser's hit testing.
    document.elementsFromPoint = () => [heading];

    instance = init({ projectKey: "pk_test" });
    instance.open();
    const root = shadow();
    const highlight = root.querySelector(".highlight") as HTMLElement;

    root.querySelector<HTMLButtonElement>(".point")?.click();
    root.querySelector(".pick-layer")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect((root.querySelector(".target-chip") as HTMLElement).hidden).toBe(false),
    );
    expect(highlight.hidden).toBe(true);

    const chip = root.querySelector(".target-chip") as HTMLElement;
    chip.dispatchEvent(new MouseEvent("mouseenter"));
    expect(highlight.hidden).toBe(false);
    chip.dispatchEvent(new MouseEvent("mouseleave"));
    expect(highlight.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-reaction="love"]')?.click();
    root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(request.body as string).target).toEqual({
      selector: "#projects",
      text: "Projects",
    });
    heading.remove();
  });
});
