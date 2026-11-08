import type { User } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { FieldErrors } from "./FieldErrors";
import { CloseIcon } from "./icons";
import { SettingRow } from "./SiteSettings";

/**
 * Your own settings, in the notes panel's place (from the account menu). For
 * now that's the daily digest: on or off, and where it goes.
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
    </section>
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
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
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
