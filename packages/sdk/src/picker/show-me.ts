import { HIGHLIGHT_PARAM } from "@flooper/shared";

// "Show me on the page": the portal links to a page with
// ?flooper-highlight=<selector>, and the widget (already on that page) finds
// the element and outlines it. The portal and the site are different origins,
// so a link is the only way to pass this along.

/**
 * Read the selector from the address, then remove the parameter so a refresh
 * or a shared link doesn't highlight again. Everything else in the URL stays.
 */
export function takeHighlightParam(): string | null {
  const url = new URL(window.location.href);
  const selector = url.searchParams.get(HIGHLIGHT_PARAM);
  if (selector === null) return null;
  url.searchParams.delete(HIGHLIGHT_PARAM);
  history.replaceState(history.state, "", url);
  return selector || null;
}

/**
 * The element for `selector`, waiting up to `timeoutMs` for it to appear:
 * single-page apps often render their content after the widget loads.
 * Resolves null if it never shows up or the selector isn't valid CSS. The
 * selector is only ever used to look an element up, never run as code.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<Element | null> {
  try {
    document.querySelector(selector);
  } catch {
    return Promise.resolve(null);
  }
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const el = document.querySelector(selector);
      if (el || Date.now() - started >= timeoutMs) resolve(el);
      else setTimeout(tick, intervalMs);
    };
    tick();
  });
}
