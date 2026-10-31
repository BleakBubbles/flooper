import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, keys } from "../api";

export function LoginPage() {
  const queryClient = useQueryClient();
  const devLogin = useMutation({
    mutationFn: api.devLogin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });

  return (
    <div className="login">
      <img src="/logo.svg" alt="" width={72} height={72} />
      <h1>Flooper</h1>
      <p className="muted">Little notes from the people who visit your site.</p>
      {/* A plain link, not fetch: OAuth is a sequence of full-page redirects. */}
      <a className="btn primary" href="/api/auth/github">
        Continue with GitHub
      </a>
      {import.meta.env.DEV && (
        <button type="button" className="btn ghost" onClick={() => devLogin.mutate()}>
          Continue as dev user
        </button>
      )}
      {devLogin.isError && <p className="error">{devLogin.error.message}</p>}
    </div>
  );
}
