import type { FeedbackStatus, Reaction } from "@flooper/shared";
import type { ReactNode } from "react";
import { ArchiveIcon, CheckIcon, MailIcon, MailOpenIcon, ReopenIcon } from "./icons";

export const REACTION_LABELS: Record<Reaction, string> = {
  love: "Love it",
  idea: "Idea",
  confused: "Confusing",
  bug: "Something's broken",
};

/**
 * Mark as read or unread, Mark done, Archive (or Reopen), as borderless icon
 * buttons with tooltips. Read and unread only apply to open notes: "new" is
 * unread, "seen" is read.
 */
export function StatusActions({
  status,
  onStatus,
}: {
  status: FeedbackStatus;
  onStatus: (status: FeedbackStatus) => void;
}) {
  const closed = status === "done" || status === "archived";
  return (
    <div className="row-actions">
      {status === "new" && (
        <IconButton label="Mark as read" onClick={() => onStatus("seen")}>
          <MailOpenIcon />
        </IconButton>
      )}
      {status === "seen" && (
        <IconButton label="Mark as unread" onClick={() => onStatus("new")}>
          <MailIcon />
        </IconButton>
      )}
      {closed ? (
        <IconButton label="Reopen" onClick={() => onStatus("new")}>
          <ReopenIcon />
        </IconButton>
      ) : (
        <IconButton label="Mark done" onClick={() => onStatus("done")}>
          <CheckIcon />
        </IconButton>
      )}
      {status !== "archived" && (
        <IconButton label="Archive" onClick={() => onStatus("archived")}>
          <ArchiveIcon />
        </IconButton>
      )}
    </div>
  );
}

/**
 * An icon-only button. `aria-label` gives it a name for screen readers, and
 * `data-tooltip` shows the same label on hover or keyboard focus (styled in CSS;
 * the native `title` tooltip is slow to appear and can't be styled).
 */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
