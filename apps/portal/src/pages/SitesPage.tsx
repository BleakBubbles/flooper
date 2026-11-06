import { REACTION_EMOJI, REACTIONS } from "@flooper/shared";
import type { ProjectWithSummary } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
import { FieldErrors } from "../components/FieldErrors";
import { NotesPanel } from "../components/NotesPanel";
import { plural, timeAgo } from "../time";
import { usePageTitle } from "../usePageTitle";

/**
 * Home: a card per site saying what's happening on it, then the notes from all
 * of them in one list.
 */
export function SitesPage() {
  usePageTitle("Your sites");
  const projects = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const [params] = useSearchParams();
  const sites = projects.data?.data ?? [];
  const newNotes = sites.reduce((n, s) => n + s.summary.newCount, 0);
  const sitesWithNew = sites.filter((s) => s.summary.newCount > 0).length;

  return (
    <main className="page">
      <div className="page-title">
        <h1>Your sites</h1>
        {projects.isSuccess && (
          <p className="muted">
            {sites.length === 0
              ? "Add your first site to start collecting notes."
              : newNotes === 0
                ? "You're all caught up."
                : `${plural(newNotes, "new note")} across ${plural(sitesWithNew, "site")}.`}
          </p>
        )}
      </div>

      {projects.isPending && <p className="muted">Loading…</p>}
      {projects.isError && <ErrorState error={projects.error} onRetry={() => projects.refetch()} />}
      {projects.isSuccess && (
        <>
          <ul className="site-grid">
            {sites.map((site) => (
              <li key={site.id}>
                <SiteCard site={site} />
              </li>
            ))}
            <li>
              <AddSite startOpen={params.has("new") || sites.length === 0} />
            </li>
          </ul>
          {sites.length > 0 && <NotesPanel sites={sites} />}
        </>
      )}
    </main>
  );
}

/**
 * Every card has the same three parts, whatever state the site is in: name
 * and status, the last 14 days of notes, then what's new and when.
 */
function SiteCard({ site }: { site: ProjectWithSummary }) {
  const { summary } = site;
  const hosts = site.allowedOrigins.map((o) => new URL(o).host).join(", ");
  const reactions = REACTIONS.filter((r) => summary.newByReaction[r]);
  const lastWeek = summary.activity.slice(-7).reduce((a, b) => a + b, 0);

  return (
    <Link to={`/app/projects/${site.id}`} className="site-card">
      <div className="site-card-head">
        <div className="site-card-name">
          <strong>{site.name}</strong>
          <span className="mono small muted">{hosts || "No address yet"}</span>
        </div>
        <SiteStatus site={site} />
      </div>
      <Sparkline activity={summary.activity} newCount={summary.newCount} />
      <div className="site-card-foot">
        <span>
          {summary.newCount > 0 && reactions.length > 0 ? (
            <span className="site-reactions">
              {reactions.map((r) => (
                <span key={r}>
                  {REACTION_EMOJI[r]} {summary.newByReaction[r]}
                </span>
              ))}
            </span>
          ) : summary.newCount > 0 ? (
            plural(summary.newCount, "new note")
          ) : summary.total === 0 ? (
            "No notes yet"
          ) : lastWeek === 0 ? (
            "Quiet this week"
          ) : (
            "Nothing new"
          )}
        </span>
        <span>
          {summary.lastNoteAt
            ? `Last note ${timeAgo(summary.lastNoteAt, { short: true })}`
            : `Added ${timeAgo(site.createdAt, { short: true })}`}
        </span>
      </div>
    </Link>
  );
}

function SiteStatus({ site }: { site: ProjectWithSummary }) {
  const { newCount, total } = site.summary;
  if (newCount > 0) return <span className="badge">{newCount} new</span>;
  if (total > 0) return <span className="site-status">All read</span>;
  if (site.allowedOrigins.length === 0) return <span className="site-status">Not set up</span>;
  return (
    <span className="site-status">
      <span className="pulse-dot" aria-hidden="true" />
      Waiting
    </span>
  );
}

/**
 * Notes per day, oldest first. The newest bars are pink up to the number of
 * new notes: new notes are usually the most recent ones, so this shows roughly
 * when they came in without another query.
 */
function Sparkline({ activity, newCount }: { activity: number[]; newCount: number }) {
  const max = Math.max(1, ...activity);
  const total = activity.reduce((a, b) => a + b, 0);
  const fresh: boolean[] = [];
  let unclaimed = newCount;
  for (let i = activity.length - 1; i >= 0; i--) {
    const n = activity[i] ?? 0;
    fresh[i] = unclaimed > 0 && n > 0;
    unclaimed -= n;
  }
  return (
    <div className="spark" role="img" aria-label={`${plural(total, "note")} in the last 14 days`}>
      {activity.map((n, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: one bar per day, in a fixed order.
          key={i}
          className={fresh[i] ? "new" : undefined}
          style={n === 0 ? undefined : { height: `${Math.max(12, (n / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** A dashed card that turns into the "name your site" form when clicked. */
function AddSite({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: api.createProject,
    // A new site has no notes yet, so its page opens on Setup.
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: keys.projects });
      navigate(`/app/projects/${project.id}`);
    },
  });

  if (!open) {
    return (
      <button type="button" className="add-site" onClick={() => setOpen(true)}>
        <span className="add-site-plus" aria-hidden="true">
          +
        </span>
        Add a site
      </button>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ name, allowedOrigins: [] });
  }

  return (
    <form
      className="add-site open"
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !startOpen) setOpen(false);
      }}
    >
      <label htmlFor="site-name">
        <strong>Name your site</strong>
      </label>
      <input
        id="site-name"
        placeholder="e.g. My blog"
        value={name}
        onChange={(e) => setName(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: the visitor just asked to add a site.
        autoFocus
        required
      />
      <FieldErrors error={create.error} />
      <div className="row-inline">
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </button>
        {!startOpen && (
          <button type="button" className="btn quiet" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
