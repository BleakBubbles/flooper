import type { ProjectWithSummary } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { AccountSettings } from "../components/AccountSettings";
import { ErrorState } from "../components/ErrorState";
import { GearIcon, InboxIcon, MailOpenIcon, MoreIcon, SidebarIcon } from "../components/icons";
import { Menu } from "../components/Menu";
import { NotesPanel, type Show } from "../components/NotesPanel";
import { SetupPanel } from "../components/SetupPanel";
import { SiteIcon } from "../components/SiteIcon";
import { SiteSettings } from "../components/SiteSettings";
import { showToast } from "../components/Toasts";
import { isTyping } from "../keys";
import { usePref } from "../prefs";
import { usePageTitle } from "../usePageTitle";

/** What a click away from the open note must not land on. */
const INTERACTIVE_OR_NOTE =
  "a, button, input, textarea, select, label, summary, [role='menu'], .note-row, .reading-pane, .note-inline";

const SHOWS: Show[] = ["all", "unread", "done", "archived"];

/**
 * Home, laid out like a mail app: your sites in a sidebar on the left, the
 * notes in the middle, and the open note on the right. Picking a site filters
 * the notes to it. What's picked lives in the URL (?site=, ?note=, ?show=), so
 * links and the back button work. ?page=<path> narrows the notes to one page
 * (from "Show more" when they're grouped by page).
 *
 * The middle shows one of four things, and the sidebar always stays:
 * - the notes (the usual case)
 * - a site's setup steps, until its first note arrives
 * - "Add a site" (?new), which is also all a brand-new account sees
 * - a site's settings (?view=settings)
 * - your own settings (?view=account), from the account menu
 */
export function SitesPage() {
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const [params, setParams] = useSearchParams();
  const sites = projects.data?.data ?? [];
  const site = sites.find((s) => s.id === params.get("site"));
  const show = SHOWS.find((s) => s === params.get("show")) ?? "all";
  const page = params.get("page");
  const q = params.get("q") ?? "";
  const adding = params.has("new") || (projects.isSuccess && sites.length === 0);
  const settings = site !== undefined && params.get("view") === "settings";
  const account = params.get("view") === "account";
  // Collapsed to a strip of site icons (wide screens only), remembered.
  const [collapsed, setCollapsed] = usePref<boolean>(
    "sidebar-collapsed",
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  // "[" toggles it, as in Linear and Notion, unless you're typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event)) return;
      setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);
  usePageTitle(
    ...(adding
      ? ["Add a site"]
      : account
        ? ["Your settings"]
        : [settings ? "Settings" : undefined, site?.name ?? "All sites"]),
  );

  /** Change some URL parameters, keeping the rest (null removes one). */
  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      }),
    [setParams],
  );
  const onOpen = useCallback((id: string | null) => update({ note: id }), [update]);
  // Stable, so the search box's typing delay isn't restarted by every render.
  const onSearch = useCallback((next: string) => update({ q: next || null, note: null }), [update]);

  /**
   * Clicking an empty spot closes the open note, like clicking away from a
   * popover. Clicks on anything that does something (links, buttons, fields,
   * menus), on a row (which opens its own note) or inside the note stay put.
   */
  const closeOnEmptyClick = (event: MouseEvent<HTMLElement>) => {
    if (!params.get("note")) return;
    const target = event.target as Element;
    if (target.closest(INTERACTIVE_OR_NOTE)) return;
    // A drag that selected text isn't a click away.
    if (window.getSelection()?.toString()) return;
    onOpen(null);
  };

  if (projects.isPending) return <main className="page muted">Loading…</main>;
  if (projects.isError) {
    return (
      <main className="page">
        <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
      </main>
    );
  }

  let middle: ReactNode;
  if (account && !adding) {
    middle = <AccountSettings />;
  } else if (adding) {
    // Keyed so a second "Add a site" starts from a blank step 1.
    middle = <SetupPanel key="new" site={null} closeHref={sites.length > 0 ? "/" : undefined} />;
  } else if (site && settings) {
    middle = <SiteSettings site={site} />;
  } else if (site && site.summary.total === 0) {
    middle = <SetupPanel key={site.id} site={site} />;
  } else {
    middle = (
      <NotesPanel
        sites={sites}
        site={site}
        show={show}
        page={page}
        q={q}
        openId={params.get("note")}
        onShow={(next) => update({ show: next === "all" ? null : next, note: null })}
        // A page belongs to one site: its notes show under that site.
        onPickPage={(picked) => update({ site: picked.projectId, page: picked.path, note: null })}
        onClearPage={() => update({ page: null, note: null })}
        onSearch={onSearch}
        onOpen={onOpen}
      />
    );
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click-away is a convenience for pointers; Escape closes the note from the keyboard.
    <main className="page home" onClick={closeOnEmptyClick}>
      <h1 className="sr-only">{adding ? "Add a site" : site ? site.name : "All sites"}</h1>
      <div className={collapsed ? "home-layout sidebar-collapsed" : "home-layout"}>
        <Sidebar
          sites={sites}
          current={adding ? undefined : site}
          adding={adding}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        {middle}
      </div>
    </main>
  );
}

/**
 * The sites, like a mail app's folders: "All sites" first, then each site
 * with its unread count (nothing when there's nothing unread) and a ⋯ menu,
 * then "Add a site". On wide screens it collapses to a strip of icons, with
 * a dot for unread notes and each name on hover.
 */
function Sidebar({
  sites,
  current,
  adding,
  collapsed,
  onToggle,
}: {
  sites: ProjectWithSummary[];
  current: ProjectWithSummary | undefined;
  adding: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [params] = useSearchParams();
  const allUnread = sites.reduce((n, s) => n + s.summary.newCount, 0);
  // Switching site keeps the view (?show=) but closes the open note and lets
  // go of a picked page.
  const hrefFor = (siteId: string | null) => {
    const next = new URLSearchParams();
    if (siteId) next.set("site", siteId);
    const show = params.get("show");
    if (show) next.set("show", show);
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <nav className={sites.length > 0 ? "sidebar" : "sidebar no-sites"} aria-label="Sites">
      <Link
        to={hrefFor(null)}
        className="sidebar-item all"
        aria-current={current || adding ? undefined : "page"}
        title={collapsed ? "All sites" : undefined}
      >
        <span className="sidebar-main">
          <span className="site-icon" aria-hidden="true">
            <InboxIcon />
          </span>
          <span className="sidebar-name">All sites</span>
        </span>
        {allUnread > 0 && <span className="badge small">{allUnread}</span>}
      </Link>
      {/* With no sites yet, adding one is the big form beside this. */}
      {sites.length > 0 && <h2 className="sidebar-label">Your sites</h2>}
      <ul className="sidebar-list">
        {sites.map((s) => (
          <li
            key={s.id}
            className={s.id === current?.id ? "sidebar-row current" : "sidebar-row"}
            // Right-click opens the same menu as the ⋯ button.
            onContextMenu={(event) => {
              const menu = event.currentTarget.querySelector<HTMLDetailsElement>("details.menu");
              if (!menu) return;
              event.preventDefault();
              menu.open = true;
              menu.querySelector("summary")?.focus();
            }}
          >
            <Link
              to={hrefFor(s.id)}
              className="sidebar-item"
              aria-current={s.id === current?.id ? "page" : undefined}
              title={collapsed ? s.name : undefined}
            >
              <span className="sidebar-main">
                <SiteIcon site={s} />
                <span className="sidebar-name">{s.name}</span>
              </span>
              {s.summary.newCount > 0 && <span className="badge small">{s.summary.newCount}</span>}
            </Link>
            <SiteMenu site={s} />
          </li>
        ))}
      </ul>
      {/* With no sites yet, adding one is the whole middle of the page. */}
      {sites.length > 0 && (
        <Link
          to="/?new"
          className="sidebar-add"
          aria-current={adding ? "page" : undefined}
          title={collapsed ? "Add a site" : undefined}
        >
          <span aria-hidden="true">+</span> <span className="sidebar-name">Add a site</span>
        </Link>
      )}
      <button
        type="button"
        className="icon-button sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        aria-keyshortcuts="["
        data-tooltip={collapsed ? "Expand  [" : "Collapse  ["}
      >
        <SidebarIcon />
      </button>
    </nav>
  );
}

/** A site's ⋯ menu in the sidebar: read everything, or open its settings. */
function SiteMenu({ site }: { site: ProjectWithSummary }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback"] });
    void queryClient.invalidateQueries({ queryKey: keys.projects });
  };
  const markAllRead = useMutation({
    mutationFn: () => api.markAllRead(site.id),
    onSuccess: ({ ids }) => {
      if (ids.length === 0) return;
      showToast({
        message: `Marked ${ids.length} ${ids.length === 1 ? "note" : "notes"} on ${site.name} as read`,
        undo: () => void api.setStatuses(ids, "new").then(refresh, refresh),
      });
    },
    onSettled: refresh,
  });

  return (
    <Menu
      label={<MoreIcon />}
      ariaLabel={`${site.name} options`}
      tooltip="More"
      buttonClass="icon-button sidebar-more"
      alignRight
    >
      {site.summary.newCount > 0 && (
        <button type="button" onClick={() => markAllRead.mutate()}>
          <span className="with-icon">
            <MailOpenIcon />
            Mark all as read
          </span>
        </button>
      )}
      <Link to={`/?site=${site.id}&view=settings`}>
        <span className="with-icon">
          <GearIcon />
          Site settings
        </span>
      </Link>
    </Menu>
  );
}
