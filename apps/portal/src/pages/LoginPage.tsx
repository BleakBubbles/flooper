import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api, keys } from "../api";

/** Why the last GitHub login didn't work. The API's callback sets ?login_error=. */
const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "Login was cancelled. Continue with GitHub whenever you're ready.",
  expired: "That login took too long and expired. Try again.",
  failed: "GitHub login didn't work. Try again in a moment.",
};

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
    <div className="login">
      <img src="/logo.svg" alt="" width={72} height={72} />
      <h1>Flooper</h1>
      <p className="muted">Little notes from the people who visit your site.</p>
      {notice && (
        <p className="login-notice" role="alert">
          {notice}
        </p>
      )}
      {/* A plain link, not fetch: OAuth is a sequence of full-page redirects. */}
      <a className="btn primary" href="/api/auth/github">
        Continue with GitHub
      </a>
      {import.meta.env.DEV && (
        <button type="button" className="btn" onClick={() => devLogin.mutate()}>
          Continue as dev user
        </button>
      )}
      {devLogin.isError && <p className="error">{devLogin.error.message}</p>}
    </div>
  );
}
