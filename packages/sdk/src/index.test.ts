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

    const sent = () =>
      (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([u]) =>
        u.endsWith("/feedback"),
      );
    await vi.waitFor(() => expect(sent()).toBeDefined());
    const [url, init_] = sent() as [string, RequestInit];
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

  it("asks 'Want to hear back?' after sending, when the site offers replies", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/config")
        ? new Response(JSON.stringify({ replies: true }))
        : url.endsWith("/reply")
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ id: "fb_1" }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    instance = init({ projectKey: "pk_test", apiUrl: "https://api.test" });
    instance.identify({ email: "sam@example.com" });

    const root = shadow();
    const reply = root.querySelector(".reply") as HTMLFormElement;
    root.querySelector<HTMLButtonElement>(".launcher")?.click();
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => u.endsWith("/config"))).toBe(true),
    );
    // Not before the note is sent.
    expect(reply.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-reaction="bug"]')?.click();
    root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(reply.hidden).toBe(false));

    // Filled in from identify(), and sent for the note just made. Notify me
    // waits for something that looks like an address.
    const input = root.querySelector(".reply input") as HTMLInputElement;
    const notify = root.querySelector(".reply button") as HTMLButtonElement;
    expect(input.value).toBe("sam@example.com");
    expect(notify.disabled).toBe(false);
    input.value = "sam@";
    input.dispatchEvent(new Event("input"));
    expect(notify.disabled).toBe(true);
    input.value = "sam@example.com";
    input.dispatchEvent(new Event("input"));
    expect(notify.disabled).toBe(false);
    reply.dispatchEvent(new Event("submit", { cancelable: true }));
    const sent = () =>
      (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([u]) =>
        u.endsWith("/reply"),
      );
    await vi.waitFor(() => expect(sent()).toBeDefined());
    const [url, init_] = sent() as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/ingest/pk_test/feedback/fb_1/reply");
    expect(JSON.parse(init_.body as string)).toEqual({ email: "sam@example.com" });
    await vi.waitFor(() => expect(reply.hidden).toBe(true));
    expect(root.querySelector(".thanks span")?.textContent).toBe(
      "We'll email you if there's news.",
    );
    // Asked once, however often the panel opens.
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith("/config"))).toHaveLength(1);
  });

  it("doesn't ask when the site hasn't switched replies on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/config")
          ? new Response(JSON.stringify({ replies: false }))
          : new Response(JSON.stringify({ id: "fb_1" }), { status: 202 }),
      ),
    );
    instance = init({ projectKey: "pk_test" });
    const root = shadow();
    root.querySelector<HTMLButtonElement>(".launcher")?.click();
    root.querySelector<HTMLButtonElement>('[data-reaction="bug"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() =>
      expect((root.querySelector(".thanks") as HTMLElement).hidden).toBe(false),
    );
    expect((root.querySelector(".reply") as HTMLElement).hidden).toBe(true);
  });

  it("goes straight to pointing after 🐛 or 🤔, once per note, and Cancel keeps the reaction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ replies: false }))),
    );
    instance = init({ projectKey: "pk_test" });
    const root = shadow();
    const layer = root.querySelector(".pick-layer") as HTMLElement;
    const react = (r: string) =>
      root.querySelector<HTMLButtonElement>(`[data-reaction="${r}"]`)?.click();
    root.querySelector<HTMLButtonElement>(".launcher")?.click();

    // Not for praise or ideas.
    react("love");
    expect(layer.hidden).toBe(true);

    react("bug");
    await vi.waitFor(() => expect(layer.hidden).toBe(false));
    expect(root.querySelector(".pick-label")?.textContent).toBe("Choose where the issue is");
    root.querySelector<HTMLButtonElement>(".pick-cancel")?.click();
    await vi.waitFor(() => expect(layer.hidden).toBe(true));
    expect(root.querySelector('[data-reaction="bug"]')?.getAttribute("aria-pressed")).toBe("true");

    // Once per note: cancelled, it doesn't start again.
    react("confused");
    expect(layer.hidden).toBe(true);

    // The point button still works, with its own wording.
    root.querySelector<HTMLButtonElement>(".point")?.click();
    await vi.waitFor(() => expect(layer.hidden).toBe(false));
    expect(root.querySelector(".pick-label")?.textContent).toBe("Selecting an element");
    root.querySelector<HTMLButtonElement>(".pick-cancel")?.click();
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
    const sent = () =>
      (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([u]) =>
        u.endsWith("/feedback"),
      );
    await vi.waitFor(() => expect(sent()).toBeDefined());
    const [, request] = sent() as [string, RequestInit];
    expect(JSON.parse(request.body as string).target).toEqual({
      selector: "#projects",
      text: "Projects",
    });
    heading.remove();
  });

  it("highlights the element named in a Show me link, then cleans up the URL", async () => {
    document.body.insertAdjacentHTML("afterbegin", `<h2 id="pricing">Pricing</h2>`);
    history.replaceState(null, "", "/?ref=x&flooper-highlight=%23pricing");

    instance = init({ projectKey: "pk_test" });
    const root = shadow();
    const highlight = root.querySelector(".highlight") as HTMLElement;

    await vi.waitFor(() => expect(highlight.hidden).toBe(false));
    expect(root.querySelector(".highlight-label")?.textContent).toBe("Feedback pointed here");
    expect(window.location.search).toBe("?ref=x");

    // Any click dismisses it.
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(highlight.hidden).toBe(true);

    document.getElementById("pricing")?.remove();
    history.replaceState(null, "", "/");
  });

  it("says so when the linked element no longer exists", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    history.replaceState(null, "", "/?flooper-highlight=%23gone");
    instance = init({ projectKey: "pk_test" });
    await vi.advanceTimersByTimeAsync(6000);
    const notice = shadow().querySelector(".notice") as HTMLElement;
    expect(notice.textContent).toContain("Couldn't find");
    vi.useRealTimers();
    history.replaceState(null, "", "/");
  });
});

describe("review mode's loader", () => {
  afterEach(() => {
    sessionStorage.clear();
    for (const s of document.querySelectorAll('script[src$="/sdk/review.js"]')) s.remove();
    history.replaceState(null, "", "/");
  });

  it("takes the token from the address, keeps it for the tab, and loads the overlay", () => {
    history.replaceState(null, "", "/checkout?x=1#flooper-review=tok_123");
    instance = init({ projectKey: "pk_test", apiUrl: "https://api.test" });

    expect(location.hash).toBe("");
    expect(location.pathname + location.search).toBe("/checkout?x=1");
    expect(sessionStorage.getItem("flooper-review")).toBe("tok_123");
    const script = document.querySelector<HTMLScriptElement>('script[src$="/sdk/review.js"]');
    expect(script?.src).toBe("https://api.test/sdk/review.js");
  });

  it("stays in review mode on the tab's next pages, and does nothing otherwise", () => {
    instance = init({ projectKey: "pk_test", apiUrl: "https://api.test" });
    expect(document.querySelector('script[src$="/sdk/review.js"]')).toBeNull();
    instance.destroy();

    sessionStorage.setItem("flooper-review", "tok_123");
    instance = init({ projectKey: "pk_test", apiUrl: "https://api.test" });
    expect(document.querySelector('script[src$="/sdk/review.js"]')).not.toBeNull();
  });
});
