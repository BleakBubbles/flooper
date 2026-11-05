import type { FeedbackCounts } from "@flooper/shared";
import type { Project } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, keys } from "../api";
import { ErrorState } from "../components/ErrorState";
import { FieldErrors } from "../components/FieldErrors";
import { OriginsForm, Snippet } from "../components/SiteSetup";
import { timeAgo } from "../time";
import { usePageTitle } from "../usePageTitle";

/** Status first ("is it working?"), then one panel of settings, then the dangerous bit. */
export function SettingsPage() {
  const { projectId = "" } = useParams();
  const project = useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.getProject(projectId),
  });
  const counts = useQuery({
    queryKey: keys.counts(projectId),
    queryFn: () => api.feedbackCounts(projectId),
  });
  usePageTitle("Site settings", project.data?.name);

  if (project.isPending) return <main className="page muted">Loading…</main>;
  if (project.isError) {
    return (
      <main className="page">
        <ErrorState error={project.error} onRetry={() => project.refetch()} />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-title">
        <h1>Site settings</h1>
        {counts.data && <ConnectionStatus project={project.data} counts={counts.data} />}
      </div>

      <section className="panel" aria-label="Settings">
        <SettingRow title="Site name" help="Shown in the site switcher. Visitors never see it.">
          <SiteNameForm project={project.data} />
        </SettingRow>
        <SettingRow
          title="Allowed addresses"
          help="The widget only runs on these, one per line, so nobody else can use your project key."
        >
          <OriginsForm project={project.data} />
        </SettingRow>
        <SettingRow
          title="Install snippet"
          help="Paste it just before the closing </body> tag on every page that should have the widget."
        >
          <Snippet project={project.data} />
          <p className="small muted">
            Project key <span className="mono">{project.data.publicKey}</span> is public by design,
            like a Stripe publishable key.
          </p>
        </SettingRow>
      </section>

      <DangerZone project={project.data} />
    </main>
  );
}

function ConnectionStatus({ project, counts }: { project: Project; counts: FeedbackCounts }) {
  if (!counts.latest) {
    return (
      <p className="status-box waiting-status" role="status">
        <span className="status-dot" aria-hidden="true" />
        <strong>No notes yet</strong>
        <span>
          Finish connecting it in{" "}
          <Link to={`/projects/${project.id}`} className="link">
            Setup
          </Link>
          .
        </span>
      </p>
    );
  }
  const { createdAt, pageUrl } = counts.latest;
  return (
    <p className="status-box connected" role="status">
      <span className="status-dot" aria-hidden="true" />
      <strong>Connected</strong>
      <span>
        Last note {timeAgo(createdAt)}, from <span className="mono">{hostOf(pageUrl)}</span>
      </span>
    </p>
  );
}

function SettingRow({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <h2 className="setting-title">{title}</h2>
        <p className="muted">{help}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function SiteNameForm({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const save = useMutation({
    mutationFn: (next: string) => api.updateProject(project.id, { name: next }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated);
      queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
  const unchanged = name.trim() === project.name;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(name.trim());
  }

  return (
    <form onSubmit={onSubmit} className="inline-form">
      <label htmlFor={`name-${project.id}`} className="sr-only">
        Site name
      </label>
      <input
        id={`name-${project.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        required
      />
      <button
        type="submit"
        className={unchanged ? "btn ghost" : "btn primary"}
        disabled={save.isPending || unchanged || !name.trim()}
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
      <FieldErrors error={save.error} />
    </form>
  );
}

/**
 * Deleting is permanent, so it asks for the site's name to be typed first: a
 * deliberate speed bump against deleting the wrong site by reflex.
 */
function DangerZone({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.project(project.id) });
      queryClient.removeQueries({ queryKey: ["feedback", project.id] });
      queryClient.invalidateQueries({ queryKey: keys.projects });
      navigate("/");
    },
  });

  return (
    <section className="panel danger-zone" aria-labelledby="danger-heading">
      <div className="setting-label">
        <h2 id="danger-heading" className="setting-title">
          Delete this site
        </h2>
        <p className="muted">Removes the site and all its notes. This can't be undone.</p>
      </div>
      {confirming ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <label htmlFor="confirm-delete" className="small">
            Type <strong>{project.name}</strong> to confirm
          </label>
          <input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
          <div className="row-inline">
            <button
              type="submit"
              className="btn danger"
              disabled={typed !== project.name || remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete forever"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
          <FieldErrors error={remove.error} />
        </form>
      ) : (
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete site…
        </button>
      )}
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
