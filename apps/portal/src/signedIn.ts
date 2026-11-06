/**
 * Whether this browser has a session, going by the API's readable
 * "flooper_signed_in" hint (the session cookie itself is HttpOnly). It only
 * decides what to draw first at flooper.app/: the app or the landing page.
 * It grants nothing; a stale hint just ends at the login page.
 */
export function hasSignedInHint(): boolean {
  try {
    return document.cookie.split("; ").includes("flooper_signed_in=1");
  } catch {
    return false;
  }
}
