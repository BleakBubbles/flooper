import { afterEach, describe, expect, it } from "vitest";
import { takeHighlightParam, waitForElement } from "./show-me";

afterEach(() => {
  history.replaceState(null, "", "/");
  document.body.innerHTML = "";
});

describe("takeHighlightParam", () => {
  it("returns the selector and removes only that parameter", () => {
    history.replaceState(null, "", "/pricing?plan=pro&flooper-highlight=%23plans%20%3E%20a#faq");
    expect(takeHighlightParam()).toBe("#plans > a");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/pricing?plan=pro#faq",
    );
  });

  it("returns null when there's nothing to highlight", () => {
    history.replaceState(null, "", "/pricing?plan=pro");
    expect(takeHighlightParam()).toBeNull();
    expect(window.location.search).toBe("?plan=pro");
  });
});

describe("waitForElement", () => {
  it("finds an element that renders after a moment", async () => {
    setTimeout(() => {
      document.body.innerHTML = `<h2 id="late">Late</h2>`;
    }, 50);
    expect(await waitForElement("#late", 1000, 10)).toBe(document.getElementById("late"));
  });

  it("gives up after the timeout", async () => {
    expect(await waitForElement("#never", 60, 10)).toBeNull();
  });

  it("returns null right away for a selector that isn't valid CSS", async () => {
    const started = Date.now();
    expect(await waitForElement("<script>", 5000)).toBeNull();
    expect(Date.now() - started).toBeLessThan(100);
  });
});
