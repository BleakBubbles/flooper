import type { PageContext } from "@flooper/shared/schemas";

/**
 * Snapshot of where the visitor is and what they're looking at, captured at the
 * moment they hit Send. Deliberately modest: enough to understand the note,
 * nothing that would surprise a visitor if they saw it.
 */
export function collectContext(options: { captureQueryString: boolean }): PageContext {
  const { location } = window;
  return {
    url: options.captureQueryString
      ? location.href.split("#")[0] || location.href
      : location.origin + location.pathname,
    path: location.pathname,
    title: document.title.slice(0, 300) || undefined,
    referrer: withoutQuery(document.referrer),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent.slice(0, 512),
    sdkVersion: __SDK_VERSION__,
  };
}

function withoutQuery(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return undefined;
  }
}

/**
 * A v4 UUID. `crypto.randomUUID` only exists on HTTPS pages (and localhost),
 * and plenty of small sites are still served over plain HTTP.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
