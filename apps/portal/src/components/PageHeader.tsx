import { REACTION_EMOJI, REACTIONS } from "@flooper/shared";
import type { PageGroup, ProjectWithSummary } from "@flooper/shared/schemas";
import { REACTION_LABELS } from "./NoteActions";
import { SiteIcon } from "./SiteIcon";

/**
 * A page's header when the notes are grouped by page: the path (across sites,
 * the full address, with the site's icon and the domain muted), a bar for its share of all the notes in the list (hover for
 * "7/31 notes"), its reactions, unread count and total. Clicking folds its
 * notes away.
 */
export function PageHeader({
  group,
  site,
  all,
  folded,
  onToggle,
}: {
  group: PageGroup;
  /** Across sites, for its icon and the full address; left out when one site is picked. */
  site: ProjectWithSummary | undefined;
  /** Every note in the list, across its pages: what the bar is a share of. */
  all: number;
  folded: boolean;
  /** `all` when Alt was held: fold or unfold every page. */
  onToggle: (all: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={folded ? "page-header folded" : "page-header"}
      onClick={(event) => onToggle(event.altKey)}
      aria-expanded={!folded}
    >
      {/* Where the group's select box sits (over this, from PageGroupSection). */}
      <span className="page-check-slot" aria-hidden="true" />
      <span className="page-path">
        <span className="page-name">
          {site && <SiteIcon site={site} />}
          <span className="mono">
            {site && <span className="page-host">{hostOf(group)}</span>}
            {group.path}
          </span>
        </span>
        <span
          className="page-bar-hit"
          data-tooltip={`${group.total}/${all} notes`}
          style={{ width: `${all ? (group.total / all) * 100 : 0}%` }}
        >
          <span className="page-bar" aria-hidden="true" />
        </span>
      </span>
      <span className="page-reactions">
        {REACTIONS.filter((r) => group.byReaction[r]).map((r) => (
          <span key={r} className="page-reaction">
            <span role="img" aria-label={REACTION_LABELS[r]}>
              {REACTION_EMOJI[r]}
            </span>
            {group.byReaction[r]}
          </span>
        ))}
      </span>
      <span className="page-count">
        {group.newCount > 0 && (
          <span className="badge small" title={`${group.newCount} unread`}>
            {group.newCount}
          </span>
        )}
        <span className="muted">
          {group.total} {group.total === 1 ? "note" : "notes"}
        </span>
      </span>
      {/* At the end, always in the same place; the whole header folds it. */}
      <svg
        className="page-chevron"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/**
 * The address the page was seen at: its newest note's. A site can answer at
 * several (www or not, a staging copy), so this is where people actually are.
 */
function hostOf(group: PageGroup): string {
  const url = group.notes[0]?.context.url;
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
