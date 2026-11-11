import { defaultReplyMessage, noteHost, REACTION_EMOJI } from "@flooper/shared";
import type { Feedback, Project } from "@flooper/shared/schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { headline } from "../noteText";
import { FieldErrors } from "./FieldErrors";
import { ReplyArrowIcon } from "./icons";
import { SiteIcon } from "./SiteIcon";
import { showToast } from "./Toasts";

/** The visitor asked to hear back, and hasn't yet. */
export const wantsReply = (note: Feedback) => Boolean(note.contactEmail && !note.repliedAt);

/**
 * "Let them know?": opened by Reply (on the note, in the "Marked done" toast,
 * or r) for notes whose visitors asked to hear back. An optional message,
 * then Send emails each visitor once, from the site via Flooper, with replies
 * coming to you. Cancel sends nothing; the note can still be answered later.
 */
export function ReplyDialog({
  notes,
  siteOf,
  onClose,
  onSent,
}: {
  /** Who to tell; null keeps the dialog closed. */
  notes: Feedback[] | null;
  /** The site a note came from, for its icon and name under the quote. */
  siteOf: (note: Feedback) => Project | undefined;
  onClose: () => void;
  onSent: (updated: Feedback[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  const ownerEmail = me.data?.email;
  const send = useMutation({
    mutationFn: (to: Feedback[]) =>
      Promise.all(to.map((note) => api.replyToNote(note.id, message.trim() || undefined))),
    onSuccess: (updated) => {
      onSent(updated);
      const first = updated[0]?.contactEmail;
      showToast({
        message:
          updated.length === 1 && first ? `Sent to ${first}` : `Sent to ${updated.length} visitors`,
      });
      onClose();
    },
  });

  const isOpen = notes !== null && notes.length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: start fresh for each new set of notes.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (isOpen && !el.open) {
      setMessage("");
      send.reset();
      el.showModal();
    }
    if (!isOpen && el.open) el.close();
  }, [isOpen, notes]);

  const first = notes?.[0];
  const many = (notes?.length ?? 0) > 1;
  // Left empty, each visitor gets a standard line: shown as the placeholder
  // when they'd all get the same one, so you see exactly what goes out.
  const defaults = new Set(
    (notes ?? []).map((n) =>
      defaultReplyMessage(noteHost(n.context.url), n.status === "done", n.reaction),
    ),
  );
  const placeholder = defaults.size === 1 ? [...defaults][0] : "Add a message (optional)";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the dialog natively; the click is for pointers.
    <dialog
      ref={dialog}
      className="shortcuts reply-dialog"
      aria-labelledby="reply-heading"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget && !send.isPending) dialog.current?.close();
      }}
    >
      {first && (
        <form
          className="shortcuts-inner reply-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (notes) send.mutate(notes);
          }}
        >
          <h2 id="reply-heading" className="shortcuts-title">
            Let them know?
          </h2>
          <p className="small muted">
            {many ? (
              <>{notes?.length} visitors asked to hear back about:</>
            ) : (
              <>
                <strong className="reply-to">{first.contactEmail}</strong> asked to hear back about:
              </>
            )}
          </p>
          {/* One thread, like an email: what they're being told about (the note,
              and where it was left), then the reply under it. */}
          <div className="reply-thread">
            <ul className="reply-notes">
              {notes?.map((note) => (
                <li key={note.id} className="reply-note">
                  <p className="reply-note-text">
                    {note.reaction && (
                      <span aria-hidden="true">{REACTION_EMOJI[note.reaction]} </span>
                    )}
                    {headline(note)}
                  </p>
                  <QuoteWhere note={note} site={siteOf(note)} withEmail={many} />
                </li>
              ))}
            </ul>
            <div className="reply-compose">
              <ReplyArrowIcon />
              <textarea
                id="reply-message"
                rows={4}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholder}
                aria-label="Your reply (optional)"
              />
            </div>
          </div>
          {ownerEmail ? (
            <p className="small muted">They'll see your email {ownerEmail} as the reply address.</p>
          ) : (
            <p className="small">
              <Link to="/?view=account" className="link" onClick={onClose}>
                Add your email
              </Link>{" "}
              first, so they can write back to you.
            </p>
          )}
          <FieldErrors error={send.error} />
          <div className="reply-actions">
            <button
              type="button"
              className="btn quiet"
              onClick={() => dialog.current?.close()}
              disabled={send.isPending}
            >
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!ownerEmail || send.isPending}>
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Under a quoted note: its site (icon and name), page, and who asked when there are several. */
function QuoteWhere({
  note,
  site,
  withEmail,
}: {
  note: Feedback;
  site: Project | undefined;
  withEmail: boolean;
}) {
  return (
    <p className="reply-note-where small muted">
      {site && <SiteIcon site={site} />}
      <span>
        {site?.name ?? "Your site"} · <span className="mono">{note.context.path}</span>
        {withEmail && ` · ${note.contactEmail}`}
      </span>
    </p>
  );
}
