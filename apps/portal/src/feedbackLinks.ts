import { HIGHLIGHT_PARAM } from "@flooper/shared";
import type { Feedback } from "@flooper/shared/schemas";

// A note's page URL comes from a visitor's browser, so it's untrusted. These
// helpers only ever produce links to http(s) pages on one of the project's own
// allowed origins, never to whatever address someone typed into a crafted request.

/** The page the note was left on, if it's safe to link to. */
export function pageUrl(feedback: Feedback, allowedOrigins: string[]): URL | null {
  let url: URL;
  try {
    url = new URL(feedback.context.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!allowedOrigins.includes(url.origin)) return null;
  return url;
}

/** That page, telling the widget there which element to highlight. */
export function showMeUrl(feedback: Feedback, allowedOrigins: string[]): string | null {
  const url = feedback.target && pageUrl(feedback, allowedOrigins);
  if (!url || !feedback.target) return null;
  url.searchParams.set(HIGHLIGHT_PARAM, feedback.target.selector);
  return url.toString();
}
