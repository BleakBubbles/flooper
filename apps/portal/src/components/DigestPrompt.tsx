import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { MailIcon } from "./icons";

const DISMISSED_KEY = "flooper:digest-prompt";

/**
 * Asks once whether you'd like the daily digest, above your notes. "Turn on"
 * switches it on straight away when we already know your address (from
 * GitHub), or opens your settings to add one. "Not now" hides it for good in
 * this browser. Nothing is ever sent unless you say yes.
 */
export function DigestPrompt() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "dismissed";
    } catch {
      return false;
    }
  });
  const turnOn = useMutation({
    mutationFn: (email: string) => api.updateNotifications({ email, noteEmails: "daily" }),
    onSuccess: (updated) => queryClient.setQueryData(keys.me, updated),
  });

  const user = me.data;
  // Asked only of those who've chosen nothing yet (either kind counts).
  if (!user || user.noteEmails !== "off" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "dismissed");
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <section className="digest-prompt" aria-label="Daily digest">
      <MailIcon />
      <span className="digest-prompt-text">
        Get a daily email when new notes arrive?
        {user.email && <span className="muted"> It goes to {user.email}.</span>}
      </span>
      <span className="digest-prompt-actions">
        {user.email ? (
          <button
            type="button"
            className="btn primary small"
            onClick={() => turnOn.mutate(user.email as string)}
            disabled={turnOn.isPending}
          >
            {turnOn.isPending ? "Turning on…" : "Turn on"}
          </button>
        ) : (
          <Link to="/?view=account" className="btn primary small">
            Turn on
          </Link>
        )}
        <button type="button" className="btn quiet small" onClick={dismiss}>
          Not now
        </button>
      </span>
    </section>
  );
}
