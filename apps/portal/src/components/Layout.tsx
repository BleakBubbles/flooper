import type { Project, User } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router";
import { ApiRequestError, api, keys } from "../api";
import { LoginPage } from "../pages/LoginPage";
import { ErrorState } from "./ErrorState";

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

/** Logo / site switcher on the left; site settings and account on the right. */
function Header({ user }: { user: User }) {
  const match = useMatch("/app/projects/:projectId/*");
  const projectId = match?.params.projectId;
  const onSettings = useMatch("/app/projects/:projectId/settings") !== null;
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const current = projects.data?.data.find((p) => p.id === projectId);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          <Link to="/app" className="brand">
            <img src="/logo.svg" alt="" width={30} height={30} />
            Flooper
          </Link>
          {projectId && (
            <>
              <span className="crumb-slash" aria-hidden="true">
                /
              </span>
              <SiteSwitcher current={current} projects={projects.data?.data ?? []} />
            </>
          )}
        </div>
        <div className="header-right">
          {projectId && (
            <Link
              to={`/app/projects/${projectId}/settings`}
              className="header-link"
              aria-current={onSettings ? "page" : undefined}
            >
              <GearIcon />
              Site settings
            </Link>
          )}
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  );
}

function SiteSwitcher({ current, projects }: { current?: Project; projects: Project[] }) {
  return (
    <Menu label={current?.name ?? "…"} buttonClass="menu-button" showChevron>
      <span className="menu-label">Your sites</span>
      {projects.map((p) => (
        <Link
          key={p.id}
          to={`/app/projects/${p.id}`}
          aria-current={p.id === current?.id ? "page" : undefined}
        >
          {p.name}
        </Link>
      ))}
      <hr />
      <Link to="/app">All sites</Link>
      <Link to="/app?new=1">Add a site</Link>
    </Menu>
  );
}

function AccountMenu({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.clear(),
  });
  const name = user.name ?? user.login;
  return (
    <Menu
      label={
        <span className="avatar">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : name[0]?.toUpperCase()}
        </span>
      }
      ariaLabel={`Account: ${name}`}
      alignRight
    >
      <span className="menu-label">Signed in as {user.login}</span>
      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Logging out…" : "Log out"}
      </button>
      {logout.isError && (
        <p className="menu-error" role="alert">
          Couldn't log out. Try again.
        </p>
      )}
    </Menu>
  );
}

/**
 * A small dropdown built on <details>: keyboard and screen-reader support come
 * from the browser. It closes when you pick something, click elsewhere, or
 * navigate.
 */
function Menu({
  label,
  ariaLabel,
  buttonClass,
  showChevron,
  alignRight,
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  buttonClass?: string;
  showChevron?: boolean;
  alignRight?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every navigation.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [location]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details className="menu" ref={ref}>
      <summary className={buttonClass} aria-label={ariaLabel}>
        {label}
        {showChevron && <ChevronIcon />}
      </summary>
      <div className={alignRight ? "menu-list align-right" : "menu-list"}>{children}</div>
    </details>
  );
}

const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...iconProps}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...iconProps}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
