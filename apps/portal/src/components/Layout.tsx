import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";
import { ApiRequestError, api, keys } from "../api";
import { LoginPage } from "../pages/LoginPage";

/**
 * The app shell, and the auth gate: if /me says we're not logged in, show the
 * login page instead of whatever route was requested.
 */
export function Layout() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.clear(),
  });

  if (me.isPending) return <div className="center muted">Loading…</div>;
  if (me.error instanceof ApiRequestError && me.error.status === 401) return <LoginPage />;
  if (me.isError) return <div className="center error">{me.error.message}</div>;

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="" width={28} height={28} />
          Flooper
        </Link>
        <div className="topbar-user">
          {me.data.avatarUrl && <img className="avatar" src={me.data.avatarUrl} alt="" />}
          <span>{me.data.name ?? me.data.login}</span>
          <button type="button" className="btn ghost" onClick={() => logout.mutate()}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
