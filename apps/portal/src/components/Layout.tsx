import type { FlooperInstance } from "@flooper/sdk";
import type { User } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, Outlet } from "react-router";
import { ApiRequestError, api, keys } from "../api";
import { LoginPage } from "../pages/LoginPage";
import { type Theme, useTheme } from "../theme";
import { ErrorState } from "./ErrorState";
import {
  InfoIcon,
  LogOutIcon,
  MailIcon,
  MessageIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "./icons";
import { Menu } from "./Menu";

/** Flooper's own site on Flooper, where "Send feedback" notes land. */
const FLOOPER_KEY = import.meta.env.DEV ? "pk_dev_playground" : "pk_nrszdxgx2qsh5qq1992mwsmc";

/**
 * The app shell, and the auth gate: if /me says we're not logged in, show the
 * login page instead of whatever route was requested.
 */
export function Layout() {
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  // Applies the picked theme everywhere in the app (the menu below changes it).
  useTheme();

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
  const [theme, setTheme] = useTheme();
  const openFeedback = useFeedbackWidget(user, theme);
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
      <ThemePicker theme={theme} onPick={setTheme} />
      <hr />
      <Link to="/?view=account">
        <span className="with-icon">
          <MailIcon />
          Email digest
        </span>
      </Link>
      {/* Home is the app now, so the landing page lives here. */}
      <Link to="/about">
        <span className="with-icon">
          <InfoIcon />
          About Flooper
        </span>
      </Link>
      <button type="button" onClick={openFeedback}>
        <span className="with-icon">
          <MessageIcon />
          Send feedback
        </span>
      </button>
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

const THEME_OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <MonitorIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

/**
 * System, Light or Dark, as three buttons in one pill. Picking one keeps the
 * menu open, so you see the change and can switch back.
 */
function ThemePicker({ theme, onPick }: { theme: Theme; onPick: (theme: Theme) => void }) {
  return (
    <div className="theme-row">
      <span>Theme</span>
      <fieldset className="theme-picker">
        <legend className="sr-only">Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="icon-button"
            aria-pressed={theme === option.value}
            aria-label={option.label}
            data-tooltip={option.label}
            onClick={(event) => {
              // The menu closes when a button in it is picked; not this one.
              event.stopPropagation();
              onPick(option.value);
            }}
          >
            {option.icon}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/**
 * "Send feedback": Flooper's own widget, on Flooper, without its floating
 * button (it would sit over the notes). Loaded on the first click, knowing who
 * you are, in the app's theme. A theme change makes a fresh one next time.
 */
function useFeedbackWidget(user: User, theme: Theme) {
  const widget = useRef<FlooperInstance | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new theme retires the old widget.
  useEffect(
    () => () => {
      widget.current?.destroy();
      widget.current = undefined;
    },
    [theme],
  );
  return () => {
    if (widget.current) {
      widget.current.open();
      return;
    }
    void import("@flooper/sdk").then(({ init }) => {
      widget.current ??= init({
        projectKey: FLOOPER_KEY,
        apiUrl: window.location.origin,
        launcher: false,
        theme: theme === "system" ? "auto" : theme,
        visitor: { id: user.id, name: user.name ?? user.login },
      });
      widget.current.open();
    });
  };
}
