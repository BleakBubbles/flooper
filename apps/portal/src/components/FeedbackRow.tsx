import { type FeedbackStatus, REACTION_EMOJI, type Reaction } from "@flooper/shared";
import type { Feedback } from "@flooper/shared/schemas";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { timeAgo } from "../time";
import { ArchiveIcon, CheckIcon, ReopenIcon } from "./icons";

export const REACTION_LABELS: Record<Reaction, string> = {
  love: "Love it",
  idea: "Idea",
  confused: "Confusing",
  bug: "Something's broken",
};

/**
 * One note in the inbox list: always two lines, so every row is the same
 * height. The first line leads with the most meaningful thing the note has:
 * its message, else the element the reaction is about, else the page.
 */
export function FeedbackRow({
  feedback,
  href,
  selected,
  onStatus,
}: {
  feedback: Feedback;
  /** Where clicking the row goes (the same inbox, with this note selected). */
  href: string;
  selected: boolean;
  onStatus: (status: FeedbackStatus) => void;
}) {
  const { primary, secondary } = summarize(feedback);
  return (
    <li className={selected ? "row selected" : "row"}>
      <Link to={href} className="row-link" aria-current={selected ? "true" : undefined}>
        <span className="row-reaction">
          {feedback.reaction && (
            <span role="img" aria-label={REACTION_LABELS[feedback.reaction]}>
              {REACTION_EMOJI[feedback.reaction]}
            </span>
          )}
        </span>
        <span className="row-text">
          <span className="row-line">
            <span className="row-primary">{primary}</span>
            <time className="row-time" dateTime={feedback.createdAt}>
              {timeAgo(feedback.createdAt, { short: true })}
            </time>
          </span>
          <span className="row-secondary">{secondary}</span>
        </span>
      </Link>
      {/* Siblings of the link (not inside it), so they're real, separately focusable buttons. */}
      <StatusActions status={feedback.status} onStatus={onStatus} />
    </li>
  );
}

/** Mark done / Archive, or Reopen, as borderless icon buttons with tooltips. */
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

function summarize(feedback: Feedback): { primary: ReactNode; secondary: ReactNode } {
  const { message, target, context } = feedback;
  const page = context.title ? `${context.title} · ${context.path}` : context.path;
  const element = target && (
    <span className="mono-chip">
      &lt;/&gt; {target.text ? `“${target.text}”` : target.selector}
    </span>
  );

  if (message) {
    return {
      primary: message,
      secondary: element ? (
        <>
          {element} <span className="mono">{context.path}</span>
        </>
      ) : (
        <span className="mono">{context.path}</span>
      ),
    };
  }
  if (element) return { primary: element, secondary: <span className="mono">{context.path}</span> };
  // Only a reaction to the page: the page is what it's about.
  return {
    primary: page,
    secondary: [feedback.visitor?.name, `${context.viewport.width}×${context.viewport.height}`]
      .filter(Boolean)
      .join(" · "),
  };
}
