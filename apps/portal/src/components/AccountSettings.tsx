import type { User } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { FieldErrors } from "./FieldErrors";
import { CloseIcon, DownloadIcon } from "./icons";
import { SettingRow } from "./SiteSettings";

/**
 * Your own settings, in the notes panel's place (from the account menu): the
 * daily digest, exporting your notes, and deleting your account.
 */
export function AccountSettings() {
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });

  return (
    <section className="notes-panel wide-panel" aria-labelledby="account-heading">
      <div className="notes-bar">
        <h2 id="account-heading" className="notes-title">
          Your settings
        </h2>
        <span className="notes-bar-end">
          <Link to="/" className="icon-button" aria-label="Close settings" data-tooltip="Close">
            <CloseIcon />
          </Link>
        </span>
      </div>
      <SettingRow
        title="Daily digest"
        help="One email a day about new notes on your sites, around 13:00 UTC. Days without new notes send nothing, and every email has an unsubscribe link."
      >
        {me.data && <DigestForm key={me.data.id} user={me.data} />}
      </SettingRow>
      <SettingRow
        title="Export your notes"
        help="Every note on your sites as a spreadsheet file (CSV) for Excel, Numbers or Google Sheets: the message, reaction, status, page, browser and more. Deleted notes aren't included."
      >
        <ExportForm />
      </SettingRow>
      {me.data && <DeleteAccount user={me.data} />}
    </section>
  );
}

/** Pick all sites or one, then download: a plain link, so the browser saves the file. */
function ExportForm() {
  const sites = useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
  const [site, setSite] = useState("");
  const href = `/api/v1/export.csv${site ? `?${new URLSearchParams({ projectId: site })}` : ""}`;
  return (
    <div className="inline-form">
      <select
        aria-label="Which notes"
        value={site}
        onChange={(event) => setSite(event.target.value)}
      >
        <option value="">All sites</option>
        {sites.data?.data.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <a className="btn" href={href} download>
        <DownloadIcon />
        Download CSV
      </a>
    </div>
  );
}

/**
 * Deleting the account is permanent, so it asks for the GitHub username to be
 * typed first, like deleting a site asks for its name.
 */
function DeleteAccount({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => api.deleteAccount(typed),
    // Signed out now: a full load of /, which is the landing page.
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });
  const matches = typed.trim().toLowerCase() === user.login.toLowerCase();

  return (
    <div className="setting-row danger-row">
      <div className="setting-label">
        <h3 className="setting-title">Delete your account</h3>
        <p className="muted">
          Removes your account, all your sites and all their notes, and signs you out everywhere.
          The widget on your sites stops accepting notes. This can't be undone, so export your notes
          first if you want them.
        </p>
        <p className="muted small">
          GitHub keeps listing Flooper as an app you've authorized until you{" "}
          <a
            className="text-link"
            href="https://github.com/settings/applications"
            target="_blank"
            rel="noreferrer"
          >
            revoke it there
          </a>
          .
        </p>
      </div>
      <div className="setting-control">
        {confirming ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches) remove.mutate();
            }}
          >
            <label htmlFor="confirm-delete-account" className="small confirm-label">
              Type your GitHub username, <strong>{user.login}</strong>, to confirm
            </label>
            <input
              id="confirm-delete-account"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="row-inline">
              <button type="submit" className="btn danger" disabled={!matches || remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete my account"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
            <FieldErrors error={remove.error} />
          </form>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
            Delete account…
          </button>
        )}
      </div>
    </div>
  );
}

function DigestForm({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(user.email ?? "");
  const [enabled, setEnabled] = useState(user.digestEnabled);
  const save = useMutation({
    mutationFn: () =>
      api.updateNotifications({ email: email.trim() || null, digestEnabled: enabled }),
    onSuccess: (updated) => queryClient.setQueryData(keys.me, updated),
  });
  const unchanged = email.trim() === (user.email ?? "") && enabled === user.digestEnabled;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="digest-form">
      <label className="check-row">
        <input
          type="checkbox"
          className="select-box"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Email me a daily digest of new notes
      </label>
      <label htmlFor="digest-email" className="small muted">
        Send it to
      </label>
      <div className="inline-form">
        <input
          id="digest-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={save.isPending || unchanged}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {save.isSuccess && unchanged && (
        <p className="small muted" role="status">
          {user.digestEnabled ? `Saved. The next digest goes to ${user.email}.` : "Saved."}
        </p>
      )}
      <FieldErrors error={save.error} />
    </form>
  );
}
