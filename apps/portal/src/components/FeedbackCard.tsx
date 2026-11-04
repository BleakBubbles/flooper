import { type FeedbackStatus, REACTION_EMOJI } from "@flooper/shared";
import type { Feedback } from "@flooper/shared/schemas";

const ACTIONS: { status: FeedbackStatus; label: string }[] = [
  { status: "seen", label: "Seen" },
  { status: "done", label: "Done" },
  { status: "archived", label: "Archive" },
];

export function FeedbackCard({
  feedback,
  onStatus,
}: {
  feedback: Feedback;
  onStatus: (status: FeedbackStatus) => void;
}) {
  const { context, visitor } = feedback;
  return (
    <article className="card feedback">
      <div className="feedback-reaction" aria-hidden={!feedback.reaction}>
        {feedback.reaction ? REACTION_EMOJI[feedback.reaction] : "💬"}
      </div>
      <div className="feedback-body">
        <p className={feedback.message ? "" : "muted"}>
          {feedback.message ?? "Just a reaction, no note."}
        </p>
        {feedback.target && (
          <p className="target" title={feedback.target.selector}>
            📍 {feedback.target.text ? `“${feedback.target.text}”` : feedback.target.selector}
          </p>
        )}
        <div className="meta">
          <span title={context.url}>{context.path}</span>
          <span>{timeAgo(feedback.createdAt)}</span>
          <span>
            {context.viewport.width}×{context.viewport.height}
          </span>
          {visitor?.name && <span>{visitor.name}</span>}
          {visitor?.email && <span>{visitor.email}</span>}
          <span className={`status status-${feedback.status}`}>{feedback.status}</span>
        </div>
      </div>
      <div className="feedback-actions">
        {ACTIONS.filter((a) => a.status !== feedback.status).map((a) => (
          <button
            key={a.status}
            type="button"
            className="btn ghost small"
            onClick={() => onStatus(a.status)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </article>
  );
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
