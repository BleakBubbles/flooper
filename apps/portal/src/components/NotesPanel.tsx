import { REACTION_EMOJI, type Reaction } from "@flooper/shared";
import type { Feedback, ProjectWithSummary } from "@flooper/shared/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, keys, type NoteOrder } from "../api";
import { plural, timeAgo } from "../time";
import { ErrorState } from "./ErrorState";
import { REACTION_LABELS } from "./FeedbackRow";
import { Menu } from "./Menu";

type Scope = "new" | "all";
type Grouping = "none" | "site" | "reaction";

/** Collapsed, the panel shows this many notes, then "Show all". */
const PREVIEW = 5;
const PAGE_SIZE = 50;

const ORDERS: { value: NoteOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];
const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "site", label: "By site" },
  { value: "reaction", label: "By reaction" },
];
/** Bugs first: they're what you most likely want to act on. */
const REACTION_ORDER: Reaction[] = ["bug", "idea", "confused", "love"];
const REACTION_GROUPS: Record<Reaction, string> = {
  bug: "Bugs",
  idea: "Ideas",
  confused: "Questions",
  love: "Love",
};

/**
 * The home screen's notes from every site: the new ones by default, or all of
 * them, in either order, optionally grouped by site or reaction. Collapsed it
 * shows the first few; "Show all" opens the rest, loading more as needed.
 */
export function NotesPanel({ sites }: { sites: ProjectWithSummary[] }) {
  const [scope, setScope] = useState<Scope>("new");
  const [order, setOrder] = useState<NoteOrder>("newest");
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [expanded, setExpanded] = useState(false);

  const status = scope === "new" ? "new" : undefined;
  const notes = useInfiniteQuery({
    queryKey: keys.allFeedback(status, order),
    queryFn: ({ pageParam }) =>
      api.listAllFeedback({ status, order, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const siteNames = new Map(sites.map((s) => [s.id, s.name]));
  const newTotal = sites.reduce((n, s) => n + s.summary.newCount, 0);
  const total = scope === "new" ? newTotal : sites.reduce((n, s) => n + s.summary.total, 0);
  const loaded = notes.data?.pages.flatMap((p) => p.data) ?? [];
  const shown = expanded ? loaded : loaded.slice(0, PREVIEW);
  // Headings count every loaded note in the group, not just the ones showing.
  const counts = new Map(group(loaded, grouping, siteNames).map((g) => [g.key, g.notes.length]));
  const groups = group(shown, grouping, siteNames);
  const orderLabel = ORDERS.find((o) => o.value === order)?.label;
  const groupLabel =
    grouping === "none" ? "" : ` · ${grouping === "site" ? "by site" : "by reaction"}`;

  return (
    <section className="notes-panel" aria-labelledby="notes-heading">
      <div className="notes-bar">
        <h2 id="notes-heading" className="notes-title">
          Notes
        </h2>
        <div className="segmented small" role="tablist" aria-label="Show">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "new"}
            onClick={() => {
              setScope("new");
              setExpanded(false);
            }}
          >
            New {newTotal > 0 && <span className="badge small">{newTotal}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            onClick={() => {
              setScope("all");
              setExpanded(false);
            }}
          >
            All
          </button>
        </div>
        <Menu
          label={`${orderLabel}${groupLabel}`}
          ariaLabel={`Sort: ${orderLabel}${groupLabel}`}
          buttonClass="sort-button"
          showChevron
          alignRight
        >
          <span className="menu-label">Order</span>
          {ORDERS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={order === o.value}
              onClick={() => setOrder(o.value)}
            >
              {o.label}
            </button>
          ))}
          <span className="menu-label">Group</span>
          {GROUPINGS.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={grouping === g.value}
              onClick={() => setGrouping(g.value)}
            >
              {g.label}
            </button>
          ))}
        </Menu>
      </div>

      {notes.isPending && <p className="notes-empty muted">Loading…</p>}
      {notes.isError && !notes.data && (
        <div className="notes-empty">
          <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
        </div>
      )}
      {notes.isSuccess && loaded.length === 0 && (
        <p className="notes-empty muted">
          {scope === "new"
            ? "You're all caught up. Nothing new on any of your sites."
            : "No notes yet. They'll show up here as your sites get them."}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          {g.title && (
            <h3 className="notes-group">
              <span>{g.title}</span>
              <span className="muted">{counts.get(g.key)}</span>
            </h3>
          )}
          <ul className="notes-list">
            {g.notes.map((note) => (
              <li key={note.id}>
                <NoteLink
                  note={note}
                  site={siteNames.get(note.projectId) ?? ""}
                  showSite={grouping !== "site"}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {loaded.length > PREVIEW && (
        <div className="notes-more">
          {expanded && notes.hasNextPage && (
            <button
              type="button"
              className="notes-more-button"
              onClick={() => notes.fetchNextPage()}
              disabled={notes.isFetchingNextPage}
            >
              {notes.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
          <button
            type="button"
            className="notes-more-button"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Show fewer ↑"
              : `Show all ${plural(total, scope === "new" ? "new note" : "note")} ↓`}
          </button>
        </div>
      )}
    </section>
  );
}

/** One note: its site, what it says, the page, and how long ago. Opens it in the site's inbox. */
function NoteLink({ note, site, showSite }: { note: Feedback; site: string; showSite: boolean }) {
  const isNew = note.status === "new";
  const classes = ["note-link", isNew ? "" : "read", showSite ? "" : "no-site"].filter(Boolean);
  return (
    <Link to={`/app/projects/${note.projectId}?note=${note.id}`} className={classes.join(" ")}>
      <span className="note-site">
        <span className="note-dot" aria-hidden="true" />
        {isNew && <span className="sr-only">New: </span>}
        {showSite && site}
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
      <span className="note-go" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

/** What a note is about, in a line: its message, else the element, else the page. */
function headline(note: Feedback): string {
  if (note.message) return note.message;
  if (note.target) return note.target.text ? `“${note.target.text}”` : note.target.selector;
  return note.context.title ?? note.context.path;
}

/**
 * Split the notes into headed groups, keeping each group's notes in the list's
 * order. Sites appear in the order of their first note; reactions in a fixed one.
 */
function group(
  notes: Feedback[],
  grouping: Grouping,
  siteNames: Map<string, string>,
): { key: string; title: string; notes: Feedback[] }[] {
  if (grouping === "none") return [{ key: "all", title: "", notes }];
  const keyOf = (n: Feedback) => (grouping === "site" ? n.projectId : (n.reaction ?? "none"));
  const keys =
    grouping === "site"
      ? [...new Set(notes.map(keyOf))]
      : [...REACTION_ORDER, "none"].filter((k) => notes.some((n) => keyOf(n) === k));
  return keys.map((key) => {
    const inGroup = notes.filter((n) => keyOf(n) === key);
    const title =
      grouping === "site"
        ? (siteNames.get(key) ?? "")
        : key === "none"
          ? "💬 No reaction"
          : `${REACTION_EMOJI[key as Reaction]} ${REACTION_GROUPS[key as Reaction]}`;
    return { key, title, notes: inGroup };
  });
}
