import { Link } from "react-router";
import { ApiRequestError } from "../api";

/**
 * Something failed to load. Says what went wrong and offers the one useful
 * next step: try again, or, if the thing doesn't exist (a deleted site, an
 * old link), go back to your sites, since retrying a 404 can't help.
 */
export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const missing = error instanceof ApiRequestError && error.status === 404;
  return (
    <div className="error-state" role="alert">
      <p className="error">{missing ? "This doesn't exist, or it was deleted." : error.message}</p>
      {missing ? (
        <Link className="btn small" to="/">
          Back to your sites
        </Link>
      ) : (
        <button type="button" className="btn small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
