import type { User } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";
import { ApiRequestError, api, keys } from "../api";
import { LoginPage } from "../pages/LoginPage";
import { ErrorState } from "./ErrorState";
import { InfoIcon, LogOutIcon } from "./icons";
import { Menu } from "./Menu";

/**
 * The app shell, and the auth gate: if /me says we're not logged in, show the
 * login page instead of whatever route was requested.
 */
export function Layout() {
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });

  if (me.isPending) return <div className="center muted">Loading…</div>;
  if (me.error instanceof ApiRequestError && me.error.status === 401) {
    // Logged in a moment ago (there's user data) but not now: the session ran out.
    return <LoginPage sessionExpired={me.data !== undefined} />;
  }
  if (me.isError) {
    return (
      <div className="center">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }

  return (
    <>
      <Header user={me.data} />
      <Outlet />
    </>
  );
}

/** The logo (home) on the left, your account on the right. */
function Header({ user }: { user: User }) {
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="" width={36} height={36} />
          Flooper
        </Link>
        <AccountMenu user={user} />
      </div>
    </header>
  );
}

/** Your avatar; its menu says who you're signed in as, and logs you out. */
function AccountMenu({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    // A full load of /, which is the landing page once signed out.
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });
  const name = user.name ?? user.login;
  const avatar = (
    <span className="avatar">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : name[0]?.toUpperCase()}
    </span>
  );
  return (
    <Menu label={avatar} ariaLabel={`Account: ${name}`} buttonClass="avatar-button" alignRight>
      <div className="account-who">
        {avatar}
        <span className="account-names">
          <strong>{name}</strong>
          <span className="small muted">@{user.login}</span>
        </span>
      </div>
      <hr />
      {/* Home is the app now, so the landing page lives here. */}
      <Link to="/about">
        <span className="with-icon">
          <InfoIcon />
          About Flooper
        </span>
      </Link>
      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
        <span className="with-icon">
          <LogOutIcon />
          {logout.isPending ? "Logging out…" : "Log out"}
        </span>
      </button>
      {logout.isError && (
        <p className="menu-error" role="alert">
          Couldn't log out. Try again.
        </p>
      )}
    </Menu>
  );
}
