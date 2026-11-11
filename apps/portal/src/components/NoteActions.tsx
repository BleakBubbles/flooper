import type { FeedbackStatus, Reaction } from "@flooper/shared";
import type { ReactNode } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  MailIcon,
  MailOpenIcon,
  ReopenIcon,
  ReplyIcon,
  RestoreIcon,
  TrashIcon,
} from "./icons";

export const REACTION_LABELS: Record<Reaction, string> = {
  love: "Love it",
  idea: "Idea",
  confused: "Confusing",
  bug: "Something's broken",
};

/**
 * Reply, Mark as read or unread, Mark done, Archive (or Reopen), as
 * borderless icon buttons with tooltips. Read and unread only apply to open
 * notes: "new" is unread, "seen" is read.
 */
export function StatusActions({
  status,
  onStatus,
  onReply,
  onDelete,
}: {
  status: FeedbackStatus;
  onStatus: (status: FeedbackStatus) => void;
  /** Only while the visitor is waiting to hear back. */
  onReply?: () => void;
  /** Shown in the open note only, so it's never one stray click away in the list. */
  onDelete?: () => void;
}) {
  const closed = status === "done" || status === "archived";
  return (
    <div className="row-actions">
      {onReply && (
        <IconButton label="Reply" onClick={onReply} className="reply-action">
          <ReplyIcon />
        </IconButton>
      )}
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
      {onDelete && (
        <IconButton label="Delete" onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      )}
    </div>
  );
}

/** A note in "Recently deleted": bring it back, or delete it for good. */
export function DeletedActions({
  onRestore,
  onDeleteForever,
}: {
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  return (
    <div className="row-actions">
      <IconButton label="Restore" onClick={onRestore}>
        <RestoreIcon />
      </IconButton>
      <IconButton label="Delete forever" onClick={onDeleteForever}>
        <TrashIcon />
      </IconButton>
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
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
