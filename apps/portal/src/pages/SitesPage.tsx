import type { ProjectWithSummary } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
import { GearIcon, InboxIcon, MailOpenIcon, MoreIcon } from "../components/icons";
import { Menu } from "../components/Menu";
import { NotesPanel, type Show } from "../components/NotesPanel";
import { SetupPanel } from "../components/SetupPanel";
import { SiteIcon } from "../components/SiteIcon";
import { SiteSettings } from "../components/SiteSettings";
import { usePageTitle } from "../usePageTitle";

const SHOWS: Show[] = ["all", "unread", "done", "archived"];

/**
 * Home, laid out like a mail app: your sites in a sidebar on the left, the
 * notes in the middle, and the open note on the right. Picking a site filters
 * the notes to it. What's picked lives in the URL (?site=, ?note=, ?show=), so
 * links and the back button work.
 *
 * The middle shows one of four things, and the sidebar always stays:
 * - the notes (the usual case)
 * - a site's setup steps, until its first note arrives
 * - "Add a site" (?new), which is also all a brand-new account sees
 * - a site's settings (?view=settings)
 */
export function SitesPage() {
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const [params, setParams] = useSearchParams();
  const sites = projects.data?.data ?? [];
  const site = sites.find((s) => s.id === params.get("site"));
  const show = SHOWS.find((s) => s === params.get("show")) ?? "all";
  const adding = params.has("new") || (projects.isSuccess && sites.length === 0);
  const settings = site !== undefined && params.get("view") === "settings";
  usePageTitle(
    ...(adding ? ["Add a site"] : [settings ? "Settings" : undefined, site?.name ?? "All sites"]),
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

  if (projects.isPending) return <main className="page muted">Loading…</main>;
  if (projects.isError) {
    return (
      <main className="page">
        <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
      </main>
    );
  }

  let middle: ReactNode;
  if (adding) {
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
        openId={params.get("note")}
        onShow={(next) => update({ show: next === "all" ? null : next, note: null })}
        onOpen={onOpen}
      />
    );
  }

  return (
    <main className="page home">
      <h1 className="sr-only">{adding ? "Add a site" : site ? site.name : "All sites"}</h1>
      <div className="home-layout">
        <Sidebar sites={sites} current={adding ? undefined : site} adding={adding} />
        {middle}
      </div>
    </main>
  );
}

/**
 * The sites, like a mail app's folders: "All sites" first, then each site
 * with its unread count (nothing when there's nothing unread) and a ⋯ menu,
 * then "Add a site".
 */
function Sidebar({
  sites,
  current,
  adding,
}: {
  sites: ProjectWithSummary[];
  current: ProjectWithSummary | undefined;
  adding: boolean;
}) {
  const [params] = useSearchParams();
  const allUnread = sites.reduce((n, s) => n + s.summary.newCount, 0);
  // Switching site keeps the view (?show=) but closes the open note.
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
        <Link to="/?new" className="sidebar-add" aria-current={adding ? "page" : undefined}>
          <span aria-hidden="true">+</span> Add a site
        </Link>
      )}
    </nav>
  );
}

/** A site's ⋯ menu in the sidebar: read everything, or open its settings. */
function SiteMenu({ site }: { site: ProjectWithSummary }) {
  const queryClient = useQueryClient();
  const markAllRead = useMutation({
    mutationFn: () => api.markAllRead(site.id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["feedback"] });
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    },
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
