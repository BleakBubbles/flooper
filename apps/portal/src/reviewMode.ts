// Review mode on Flooper's own site: the owner's tab, opened from a review
// link, showing the landing page with its notes drawn over it. The widget
// keeps the link's token in the tab's sessionStorage under this key until
// Exit (packages/sdk/src/index.ts, startReview).
const KEY = "flooper-review";

/** Whether this tab is in review mode: opened from a review link (#flooper-review=…), or since then. */
export function inReviewMode(): boolean {
  try {
    return location.hash.includes("flooper-review=") || sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Leave review mode for the app: forget the token, then load the app as a
 * new page, which leaves the overlay behind. While the token is kept, / is
 * the landing page, so an ordinary link there would go nowhere.
 */
export function openAppFromReview(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  location.assign("/");
}
