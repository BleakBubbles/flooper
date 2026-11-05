import { useEffect } from "react";
import { useRouteError } from "react-router";

/**
 * Shown if rendering throws (a bug, not a failed request: those have their own
 * error states). Replaces React Router's developer-facing default screen.
 */
export function CrashPage() {
  const error = useRouteError();
  useEffect(() => console.error(error), [error]);

  return (
    <div className="login">
      <img src="/logo.svg" alt="" width={56} height={56} />
      <h1>Something went wrong</h1>
      <p className="muted">The page hit a bug. Reloading usually sorts it out.</p>
      <div className="row-inline">
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a className="btn" href="/app">
          Back to your sites
        </a>
      </div>
    </div>
  );
}
