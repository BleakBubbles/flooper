import { type FeedbackStatus, type Paginated, REACTION_EMOJI } from "@flooper/shared";
import type { Feedback, NoteSort, PageGroup, ProjectWithSummary } from "@flooper/shared/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { api, keys } from "../api";
import { sortNotes } from "../sortNotes";
import { timeAgo } from "../time";
import { useMarkRead } from "../useMarkRead";
import { useMediaQuery } from "../useMediaQuery";
import { DigestPrompt } from "./DigestPrompt";
import { ErrorState } from "./ErrorState";
import { FeedbackDetail } from "./FeedbackDetail";
import {
  ArchiveIcon,
  CheckIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  InboxIcon,
  MailIcon,
  MailOpenIcon,
  SmileIcon,
} from "./icons";
import { Menu } from "./Menu";
import { REACTION_LABELS, StatusActions } from "./NoteActions";
import { PageHeader } from "./PageHeader";
import { SiteIcon } from "./SiteIcon";

/** Which notes the list shows. "all" is everything but archived. */
export type Show = "all" | "unread" | "done" | "archived";
/** A column the list is sorted by, or null for the default (newest first). */
type Sort = { by: NoteSort; dir: "asc" | "desc" } | null;
type NotePages = InfiniteData<Paginated<Feedback>, string | undefined>;
type PageGroups = { data: PageGroup[] };

const PAGE_SIZE = 50;
/** Wide enough for the sidebar, the list and the reading pane side by side. Matches the CSS. */
const PANE_QUERY = "(min-width: 1360px)";

const NEWEST_FIRST = { by: "time", dir: "desc" } as const;

// Each view's icon is the same as the action that puts notes in it (mark
// unread, mark done, archive), so you can see where a note went.
const SHOWS: {
  value: Show;
  label: string;
  icon: ReactNode;
  status?: FeedbackStatus;
}[] = [
  { value: "all", label: "All notes", icon: <InboxIcon /> },
  {
    value: "unread",
    label: "Unread only",
    icon: <MailIcon />,
    status: "new",
  },
  { value: "done", label: "Done", icon: <CheckIcon />, status: "done" },
  {
    value: "archived",
    label: "Archived",
    icon: <ArchiveIcon />,
    status: "archived",
  },
];
/**
 * The notes list: from every site, or from `site` when one is picked in the
 * sidebar. Unread notes stand out. Opening a note shows it in a reading pane
 * to the right on wide screens, or under its row otherwise.
 *
 * A note counts as read once you click off it (close it or open another). Each row also has
 * quick actions (read/unread, done, archive), and the title bar can mark
 * everything read, so working through notes never leaves the page.
 *
 * Sorting by Page groups the notes under their pages, busiest page first, with
 * each page's newest few notes; "Show more" narrows the list to that page
 * until its chip in the title bar is cleared.
 */
export function NotesPanel({
  sites,
  site,
  show,
  page,
  openId,
  onShow,
  onPickPage,
  onClearPage,
  onOpen,
}: {
  sites: ProjectWithSummary[];
  /** The site picked in the sidebar, if any. */
  site: ProjectWithSummary | undefined;
  show: Show;
  /** Just this page's notes (a path), if one was picked from its group. */
  page: string | null;
  openId: string | null;
  onShow: (show: Show) => void;
  onPickPage: (page: PageGroup) => void;
  onClearPage: () => void;
  onOpen: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const withPane = useMediaQuery(PANE_QUERY);
  const [sort, setSort] = useState<Sort>(null);
  // One site's notes all have the same site, so sorting by it means nothing.
  const active = sort && !(site && sort.by === "site") ? sort : null;
  // Sorting by Page groups the notes under their pages (busiest first, "desc"),
  // unless one page is picked already: then it's just that page's notes.
  const grouped = active?.by === "page" && !page;
  const listSort = active?.by === "page" ? null : active;
  const sorted = listSort ?? NEWEST_FIRST;
  /**
   * A column header was clicked: ascending, then descending, then off. Page
   * starts with busiest first, the useful end.
   */
  const cycleSort = (by: NoteSort) =>
    setSort((current) => {
      const first = by === "page" ? "desc" : "asc";
      if (current?.by !== by) return { by, dir: first };
      return current.dir === first ? { by, dir: first === "asc" ? "desc" : "asc" } : null;
    });

  const showing = SHOWS.find((s) => s.value === show) ?? (SHOWS[0] as (typeof SHOWS)[number]);
  const listQuery = (sort: { by: NoteSort; dir: "asc" | "desc" }, enabled: boolean) => ({
    queryKey: keys.allFeedback(
      showing.status,
      `${sort.by}-${sort.dir}`,
      site?.id,
      page ?? undefined,
    ),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.listAllFeedback({
        status: showing.status,
        sort: sort.by,
        dir: sort.dir,
        projectId: site?.id,
        page: page ?? undefined,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Paginated<Feedback>) => last.nextCursor ?? undefined,
    enabled,
  });
  // The default order is always loaded. When it fits in one load (nothing
  // left to "Load more"), every note is here, so a sort happens right here
  // too, with no request. Otherwise the server sorts, so the order covers
  // notes that aren't loaded yet.
  const baseQuery = listQuery(NEWEST_FIRST, true);
  const base = useInfiniteQuery({ ...baseQuery, enabled: !grouped });
  const sortHere = !!listSort && base.isSuccess && !base.hasNextPage;
  const serverQuery = listQuery(sorted, !grouped && !!listSort && !sortHere);
  const sortedByServer = useInfiniteQuery(serverQuery);
  const byServer = !!listSort && !sortHere;
  const notes = byServer ? sortedByServer : base;
  // Grouped by page: each page with its counts and newest notes, in one request.
  const groupsKey = keys.pages(site?.id, showing.status);
  const groups = useQuery({
    queryKey: groupsKey,
    queryFn: () => api.listPages({ projectId: site?.id, status: showing.status }),
    enabled: grouped,
  });
  const listing = grouped ? groups : notes;
  // Changes to notes (read, done, ...) go to the list that's showing.
  const queryKey = grouped ? groupsKey : byServer ? serverQuery.queryKey : baseQuery.queryKey;

  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const inScope = site ? [site] : sites;
  const sum = (count: (s: ProjectWithSummary) => number) =>
    inScope.reduce((n, s) => n + count(s), 0);
  const unread = sum((s) => s.summary.newCount);
  const total = {
    all: sum((s) => s.summary.total - s.summary.archived),
    unread,
    done: sum((s) => s.summary.done),
    archived: sum((s) => s.summary.archived),
  }[show];
  // Busiest first from the server; flipped here for quietest first.
  const busiestFirst = groups.data?.data ?? [];
  const pageGroups = active?.dir === "asc" ? [...busiestFirst].reverse() : busiestFirst;
  const allNotes = busiestFirst.reduce((n, g) => n + g.total, 0);
  // Which pages are folded away, by site and path. Kept while the list
  // refreshes, so a fold survives marking a note read.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const groupKey = (g: PageGroup) => `${g.projectId} ${g.path}`;
  const allFolded = pageGroups.length > 0 && pageGroups.every((g) => folded.has(groupKey(g)));
  const foldAll = (fold: boolean) =>
    setFolded(fold ? new Set(pageGroups.map(groupKey)) : new Set());
  const toggleFold = (g: PageGroup) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(groupKey(g))) next.delete(groupKey(g));
      else next.add(groupKey(g));
      return next;
    });
  const fetched = grouped
    ? pageGroups.flatMap((g) => g.notes)
    : (notes.data?.pages.flatMap((p) => p.data) ?? []);
  const loaded = sortHere && listSort ? sortNotes(fetched, listSort, sitesById) : fetched;
  // From the sites' counts, which can lag a moment behind; never below zero.
  // They count whole sites, so with one page picked there's no count to give.
  const left = page ? 0 : Math.max(0, total - loaded.length);
  const open = loaded.find((n) => n.id === openId);

  // Esc closes the open note.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, onOpen]);

  /**
   * Change this list's copy of the notes, dropping any `keep` returns false
   * for. Grouped, a page's counts catch up when the server answers.
   */
  const updateList = (change: (note: Feedback) => Feedback, keep: (note: Feedback) => boolean) =>
    grouped
      ? queryClient.setQueryData<PageGroups>(
          queryKey,
          (data) =>
            data && {
              data: data.data.map((g) => ({ ...g, notes: g.notes.map(change).filter(keep) })),
            },
        )
      : queryClient.setQueryData<NotePages>(
          queryKey,
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                data: page.data.map(change).filter(keep),
              })),
            },
        );
  const belongs = (note: Feedback) =>
    showing.status ? note.status === showing.status : note.status !== "archived";
  /** The sidebar's counts come from the sites list. */
  const refreshCounts = () => void queryClient.invalidateQueries({ queryKey: keys.projects });

  // Quick actions and the open note's buttons. Optimistic: the row changes (or
  // leaves the list) at once, and everything resyncs when the server answers.
  // The open note stays put, so it doesn't vanish while you're reading it.
  const setStatus = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: FeedbackStatus }) =>
      api.updateFeedback(id, next),
    onMutate: async ({ id, status: next }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      updateList(
        (n) => (n.id === id ? { ...n, status: next } : n),
        (n) => n.id === openId || belongs(n),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      // Other views (another site, Done, Archived) reload when next shown.
      void queryClient.invalidateQueries({ queryKey: ["feedback"], refetchType: "none" });
      refreshCounts();
    },
  });

  // Reading the open note: changed in place, without reloading the list.
  const markRead = useMutation({
    mutationFn: (id: string) => api.updateFeedback(id, "seen"),
    onSuccess: (updated) => {
      updateList(
        (n) => (n.id === updated.id ? updated : n),
        () => true,
      );
      void queryClient.invalidateQueries({ queryKey: ["feedback"], refetchType: "none" });
      refreshCounts();
    },
  });
  useMarkRead(open, (id) => markRead.mutate(id));

  // Follows the view: every site's notes, or just the picked site's.
  const markAllRead = useMutation({
    mutationFn: () => api.markAllRead(site?.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      updateList(
        (n) => (n.status === "new" ? { ...n, status: "seen" } : n),
        (n) => n.id === openId || belongs(n),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["feedback"] });
      refreshCounts();
    },
  });

  const detail = (note: Feedback) => {
    const from = sitesById.get(note.projectId);
    return (
      <FeedbackDetail
        key={note.id}
        feedback={note}
        allowedOrigins={from?.allowedOrigins ?? []}
        site={
          from && {
            name: from.name,
            // A link to just this site's notes, unless that's the view already.
            href: site ? undefined : `/?site=${from.id}&note=${note.id}`,
          }
        }
        onClose={() => onOpen(null)}
        onStatus={(next) => setStatus.mutate({ id: note.id, status: next })}
      />
    );
  };

  const row = (note: Feedback) => (
    <li key={note.id}>
      <NoteRow
        note={note}
        site={sitesById.get(note.projectId)}
        showSite={!site}
        isOpen={note.id === openId}
        onOpen={() => onOpen(note.id === openId ? null : note.id)}
        onStatus={(next) => setStatus.mutate({ id: note.id, status: next })}
      />
      {/* Without room for the pane, the note opens right here, under its row. */}
      {!withPane && note.id === openId && <div className="note-inline">{detail(note)}</div>}
    </li>
  );

  return (
    <div className={open && withPane ? "notes-area reading" : "notes-area"}>
      <section className="notes-panel" aria-labelledby="notes-heading">
        <div className="notes-bar">
          <h2 id="notes-heading" className="notes-title">
            {site ? site.name : "All sites"}
          </h2>
          {page && (
            <button
              type="button"
              className="page-chip"
              onClick={onClearPage}
              aria-label={`Showing notes on ${page}. Show every page's notes.`}
            >
              <span className="mono">{page}</span>
              <span aria-hidden="true">×</span>
            </button>
          )}
          {/* The unread count is in the sidebar, right beside this. */}
          <span className="notes-bar-end">
            {/* "Mark all as read" covers whole sites, so not with one page picked. */}
            {grouped && pageGroups.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={allFolded ? "Expand all pages" : "Collapse all pages"}
                data-tooltip={allFolded ? "Expand all" : "Collapse all"}
                onClick={() => foldAll(!allFolded)}
              >
                {allFolded ? <ExpandAllIcon /> : <CollapseAllIcon />}
              </button>
            )}
            {!page && unread > 0 && (
              <button
                type="button"
                className="icon-button"
                aria-label={site ? `Mark all of ${site.name} as read` : "Mark all as read"}
                data-tooltip="Mark all as read"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <MailOpenIcon />
              </button>
            )}
            <Menu
              label={
                // Every option stacked in one spot, only the current one visible,
                // so the button is always as wide as the longest and never jumps.
                <span className="stable-label">
                  {SHOWS.map((s) => (
                    <span
                      key={s.value}
                      className={s.value === show ? "with-icon" : "with-icon ghost"}
                    >
                      {s.icon}
                      {s.label}
                    </span>
                  ))}
                </span>
              }
              ariaLabel={`Show: ${showing.label}`}
              buttonClass="sort-button"
              showChevron
              alignRight
            >
              <span className="menu-label">Show</span>
              {SHOWS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={show === s.value}
                  onClick={() => onShow(s.value)}
                >
                  <span className="with-icon">
                    {s.icon}
                    {s.label}
                  </span>
                </button>
              ))}
              {/* Without column headers (smaller screens), the order lives here. */}
              {!withPane && <span className="menu-label">Order</span>}
              {!withPane && (
                <button type="button" aria-pressed={!active} onClick={() => setSort(null)}>
                  Newest first
                </button>
              )}
              {!withPane && (
                <button
                  type="button"
                  aria-pressed={active?.by === "time" && active.dir === "asc"}
                  onClick={() => setSort({ by: "time", dir: "asc" })}
                >
                  Oldest first
                </button>
              )}
              {!withPane && (
                <button
                  type="button"
                  aria-pressed={active?.by === "page"}
                  onClick={() => setSort({ by: "page", dir: "desc" })}
                >
                  By page
                </button>
              )}
            </Menu>
          </span>
        </div>

        <DigestPrompt />
        {withPane && loaded.length > 0 && (
          <ColumnHeaders showSite={!site} sort={active} onSort={cycleSort} />
        )}
        {listing.isPending && <p className="notes-empty muted">Loading…</p>}
        {listing.isError && !listing.data && (
          <div className="notes-empty">
            <ErrorState error={listing.error} onRetry={() => listing.refetch()} />
          </div>
        )}
        {listing.isSuccess && loaded.length === 0 && <EmptyNotes show={show} />}

        {grouped ? (
          pageGroups.map((group) => (
            <PageGroupSection
              key={groupKey(group)}
              group={group}
              folded={folded.has(groupKey(group))}
              // Alt-click folds or unfolds every page, like a tree in DevTools.
              onToggle={(all) => (all ? foldAll(!folded.has(groupKey(group))) : toggleFold(group))}
              site={sitesById.get(group.projectId)}
              showSite={!site}
              all={allNotes}
              onMore={() => onPickPage(group)}
            >
              {group.notes.map(row)}
            </PageGroupSection>
          ))
        ) : (
          <ul className="notes-list">{loaded.map(row)}</ul>
        )}

        {/* Notes come 50 at a time; the rest load on request. */}
        {!grouped && notes.hasNextPage && (
          <div className="notes-more">
            <button
              type="button"
              className="notes-more-button"
              onClick={() => notes.fetchNextPage()}
              disabled={notes.isFetchingNextPage}
            >
              {notes.isFetchingNextPage
                ? "Loading…"
                : left > 0
                  ? `Load more (${left} left)`
                  : "Load more"}
            </button>
          </div>
        )}
      </section>

      {open && withPane && <aside className="reading-pane">{detail(open)}</aside>}
    </div>
  );
}

/**
 * Labels over the list's columns, lined up by sharing the rows' grid. Each one
 * sorts by its column: click for ascending, again for descending, a third time
 * for off, which falls back to newest first (shown as a faint arrow on When).
 */
function ColumnHeaders({
  showSite,
  sort,
  onSort,
}: {
  showSite: boolean;
  sort: Sort;
  onSort: (by: NoteSort) => void;
}) {
  const header = (by: NoteSort, label: ReactNode, name: string) => {
    const on = sort?.by === by;
    const arrow = on ? (sort.dir === "asc" ? "↑" : "↓") : by === "time" && !sort ? "↓" : "";
    const state = !on
      ? "not sorted"
      : by === "page"
        ? sort.dir === "desc"
          ? "grouped, busiest page first"
          : "grouped, quietest page first"
        : sort.dir === "asc"
          ? "ascending"
          : "descending";
    return (
      <button
        type="button"
        className={on ? "column-button on" : "column-button"}
        onClick={() => onSort(by)}
        aria-label={`${name}: ${state}. Click to change.`}
      >
        {label}
        {arrow && <span className={on ? "column-arrow" : "column-arrow faint"}>{arrow}</span>}
      </button>
    );
  };
  return (
    <div className={showSite ? "note-row notes-columns" : "note-row notes-columns no-site"}>
      <div className="note-open">
        {/* The same dot and icon slots as a row (invisible), so the labels line up. */}
        <span className="note-site">
          <span className="note-dot" aria-hidden="true" />
          {showSite && <span className="site-icon" aria-hidden="true" />}
          {showSite && header("site", "Site", "Site")}
        </span>
        <span className="note-text">
          <span className="note-emoji">{header("reaction", <SmileIcon />, "Reaction")}</span>
          {header("note", "Note", "Note")}
        </span>
        <span className="note-page">{header("page", "Page", "Page")}</span>
        <span className="note-time">{header("time", "When", "When")}</span>
      </div>
    </div>
  );
}

/**
 * One page's group: its header, then its newest notes, then "Show N more"
 * when it has more than that. The header folds the group away (with Alt,
 * every group).
 */
function PageGroupSection({
  group,
  folded,
  onToggle,
  site,
  showSite,
  all,
  onMore,
  children,
}: {
  group: PageGroup;
  folded: boolean;
  /** `all` when Alt was held: fold or unfold every page. */
  onToggle: (all: boolean) => void;
  site: ProjectWithSummary | undefined;
  showSite: boolean;
  all: number;
  onMore: () => void;
  children: ReactNode;
}) {
  const more = group.total - group.notes.length;
  return (
    <section className="page-group" aria-label={`Notes on ${group.path}`}>
      <PageHeader
        group={group}
        site={showSite ? site : undefined}
        all={all}
        folded={folded}
        onToggle={onToggle}
      />
      {!folded && (
        <>
          <ul className="notes-list">{children}</ul>
          {more > 0 && (
            <button type="button" className="page-more" onClick={onMore}>
              Show {more} more on <span className="mono">{group.path}</span> →
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** What an empty list says, for each view. A site with no notes yet points to its setup. */
/** A site with no notes at all shows its setup steps instead of this. */
function EmptyNotes({ show }: { show: Show }) {
  const text = {
    all: "No notes yet. They'll show up here as your sites get them.",
    unread: "You're all caught up. Nothing unread.",
    done: "Nothing marked done yet.",
    archived: "Nothing archived.",
  }[show];
  return <p className="notes-empty muted">{text}</p>;
}

/**
 * One note: its site, what it says, the page, and when. Clicking opens it;
 * hovering (or focusing) swaps the time for quick actions.
 */
function NoteRow({
  note,
  site,
  showSite,
  isOpen,
  onOpen,
  onStatus,
}: {
  note: Feedback;
  site: ProjectWithSummary | undefined;
  showSite: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onStatus: (status: FeedbackStatus) => void;
}) {
  const isNew = note.status === "new";
  const classes = [
    "note-row",
    isNew ? "" : "read",
    showSite ? "" : "no-site",
    isOpen ? "open" : "",
  ];
  return (
    <div className={classes.filter(Boolean).join(" ")}>
      <button type="button" className="note-open" onClick={onOpen} aria-expanded={isOpen}>
        <span className="note-site">
          <span className="note-dot" aria-hidden="true" />
          {isNew && <span className="sr-only">Unread: </span>}
          {showSite && site && (
            <>
              <SiteIcon site={site} />
              <span className="note-site-name">{site.name}</span>
            </>
          )}
        </span>
        <span className="note-text">
          <span className="note-emoji">
            {note.reaction && (
              <span role="img" aria-label={REACTION_LABELS[note.reaction]}>
                {REACTION_EMOJI[note.reaction]}
              </span>
            )}
          </span>
          <span>{headline(note)}</span>
        </span>
        <span className="note-page mono small">{note.context.path}</span>
        <time className="note-time" dateTime={note.createdAt}>
          {timeAgo(note.createdAt, { short: true })}
        </time>
      </button>
      <div className="note-actions">
        <StatusActions status={note.status} onStatus={onStatus} />
      </div>
    </div>
  );
}

/** What a note is about, in a line: its message, else the element, else the page. */
function headline(note: Feedback): string {
  if (note.message) return note.message;
  if (note.target) return note.target.text ? `“${note.target.text}”` : note.target.selector;
  return note.context.title ?? note.context.path;
}
