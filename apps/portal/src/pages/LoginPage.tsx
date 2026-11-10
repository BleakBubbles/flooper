import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { GithubButton } from "../components/GithubButton";
import "./landing.css";

/** Why the last GitHub login didn't work. The API's callback sets ?login_error=. */
const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "Login was cancelled. Continue with GitHub whenever you're ready.",
  expired: "That login took too long and expired. Try again.",
  failed: "GitHub login didn't work. Try again in a moment.",
};

/**
 * Logging in, on the landing page's black, with its big GitHub button; the
 * logo above, as on most login pages, and links back to the landing page.
 * Also shown in place of the app when a session runs out.
 */
export function LoginPage({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const queryClient = useQueryClient();
  const devLogin = useMutation({
    mutationFn: api.devLogin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });

  // Read the reason once, then drop it from the URL so a reload doesn't repeat it.
  const [params, setParams] = useSearchParams();
  const [loginError] = useState(() => params.get("login_error"));
  useEffect(() => {
    if (!params.has("login_error")) return;
    const next = new URLSearchParams(params);
    next.delete("login_error");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const notice = loginError
    ? (LOGIN_ERRORS[loginError] ?? LOGIN_ERRORS.failed)
    : sessionExpired
      ? "You were logged out. Log in again to pick up where you left off."
      : null;

  return (
    <div className="landing login-page">
      <main className="login">
        <Link to="/" className="login-logo" aria-label="Flooper home">
          <img src="/logo.svg" alt="" width={64} height={64} />
        </Link>
        <h1>Log in to Flooper</h1>
        {notice && (
          <p className="login-notice" role="alert">
            {notice}
          </p>
        )}
        <GithubButton />
        {import.meta.env.DEV && (
          <button type="button" className="btn outline big" onClick={() => devLogin.mutate()}>
            Continue as dev user
          </button>
        )}
        {devLogin.isError && <p className="error">{devLogin.error.message}</p>}
        <p className="fine">Flooper only reads your GitHub profile and email address.</p>
      </main>
    </div>
  );
}
