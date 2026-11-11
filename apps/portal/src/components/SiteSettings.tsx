import type { Project, ProjectWithSummary } from "@flooper/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, keys } from "../api";
import { timeAgo } from "../time";
import { FieldErrors } from "./FieldErrors";
import { CloseIcon } from "./icons";
import { OriginsForm, Snippet } from "./SiteSetup";

/**
 * A site's settings, in the notes panel's place (the sidebar stays beside
 * it): whether it's working, then its name, addresses and snippet, then delete.
 */
export function SiteSettings({ site }: { site: ProjectWithSummary }) {
  return (
    <section className="notes-panel wide-panel" aria-labelledby="settings-heading">
      <div className="notes-bar">
        <h2 id="settings-heading" className="notes-title">
          {site.name} settings
        </h2>
        <span className="notes-bar-end">
          <Link
            to={`/?site=${site.id}`}
            className="icon-button"
            aria-label="Close settings"
            data-tooltip="Close"
          >
            <CloseIcon />
          </Link>
        </span>
      </div>
      <ConnectionStatus site={site} />
      <SettingRow title="Site name" help="Shown in your sidebar. Visitors never see it.">
        {/* Keyed so it starts over when you switch sites. */}
        <SiteNameForm key={site.id} project={site} />
      </SettingRow>
      <SettingRow
        title="Allowed addresses"
        help="The widget only runs on these, one per line, so nobody else can use your project key."
      >
        <OriginsForm key={site.id} project={site} />
      </SettingRow>
      <SettingRow
        title="Replies"
        help="After sending a note, visitors can leave an email, so you can tell them what came of it."
      >
        <RepliesSwitch project={site} />
      </SettingRow>
      <SettingRow
        title="Install snippet"
        help="Paste it just before the closing </body> tag on every page that should have the widget."
      >
        <Snippet project={site} />
        <p className="small muted">
          Project key <span className="mono">{site.publicKey}</span> is public by design, like a
          Stripe publishable key.
        </p>
      </SettingRow>
      <DangerZone key={site.id} project={site} />
    </section>
  );
}

function ConnectionStatus({ site }: { site: ProjectWithSummary }) {
  const last = site.summary.lastNoteAt;
  return (
    <p className={last ? "settings-status connected" : "settings-status"} role="status">
      <span className="status-dot" aria-hidden="true" />
      {last ? (
        <>
          <strong>Connected</strong>
          <span>Last note {timeAgo(last)}</span>
        </>
      ) : (
        <>
          <strong>No notes yet</strong>
          <Link to={`/?site=${site.id}`} className="link">
            Finish connecting it
          </Link>
        </>
      )}
    </p>
  );
}

export function SettingRow({
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
        <h3 className="setting-title">{title}</h3>
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
      void queryClient.invalidateQueries({ queryKey: keys.projects });
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
        className="btn primary"
        disabled={save.isPending || unchanged || !name.trim()}
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
      <FieldErrors error={save.error} />
    </form>
  );
}

/** Saves as soon as it's ticked: there's nothing else to fill in. */
function RepliesSwitch({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (on: boolean) => api.updateProject(project.id, { replyRequests: on }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
  const checked = save.isPending
    ? (save.variables ?? project.replyRequests)
    : project.replyRequests;

  return (
    <div className="digest-form">
      <label className="check-row">
        <input
          type="checkbox"
          className="select-box"
          checked={checked}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Ask visitors if they want to hear back
      </label>
      <FieldErrors error={save.error} />
    </div>
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
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.project(project.id) });
      await queryClient.invalidateQueries({ queryKey: keys.projects });
      void queryClient.invalidateQueries({ queryKey: ["feedback"] });
      navigate("/");
    },
  });

  return (
    <div className="setting-row danger-row">
      <div className="setting-label">
        <h3 className="setting-title">Delete this site</h3>
        <p className="muted">Removes the site and all its notes. This can't be undone.</p>
      </div>
      <div className="setting-control">
        {confirming ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              remove.mutate();
            }}
          >
            <label htmlFor="confirm-delete" className="small confirm-label">
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
      </div>
    </div>
  );
}
