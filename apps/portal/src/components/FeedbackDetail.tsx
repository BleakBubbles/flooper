import { type FeedbackStatus, REACTION_EMOJI } from "@flooper/shared";
import type { Feedback } from "@flooper/shared/schemas";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { pageUrl, showMeUrl } from "../feedbackLinks";
import { fullDate, timeAgo } from "../time";
import { viewOnSite } from "../viewOnSite";
import { CloseIcon } from "./icons";
import { DeletedActions, REACTION_LABELS, StatusActions } from "./NoteActions";
import { wantsReply } from "./ReplyDialog";

/** How each status reads to a person. "seen" is shown as "read". */
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Read",
  done: "Done",
  archived: "Archived",
};

/**
 * Everything about one note, with its actions at the top. It can name the
 * site it came from, and be closed.
 */
export function FeedbackDetail({
  feedback,
  allowedOrigins,
  site,
  onClose,
  onStatus,
  onDelete,
  onRestore,
  onDeleteForever,
  onReply,
}: {
  feedback: Feedback;
  allowedOrigins: string[];
  /** The site the note came from, and a link to just that site's notes. */
  site?: { name: string; href?: string };
  onClose?: () => void;
  onStatus: (status: FeedbackStatus) => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
  /** Reply: email the visitor who asked to hear back ("Let them know?"). */
  onReply?: () => void;
}) {
  const { context, target, visitor, metadata } = feedback;
  const showMe = showMeUrl(feedback, allowedOrigins);
  const page = pageUrl(feedback, allowedOrigins);
  // The page in review mode, its notes drawn over it. The link keeps the plain
  // address, so a new-tab click (⌘/Ctrl or middle) or "Copy link" still gives
  // the page as visitors see it.
  const reviewPage = (event: MouseEvent) => {
    if (!page || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    viewOnSite(feedback.projectId, page.pathname + page.search, page.origin);
  };

  return (
    <article className="detail" aria-labelledby="detail-heading">
      <header className="detail-head">
        <div className="detail-title">
          {feedback.reaction && (
            <span
              className="detail-reaction"
              role="img"
              aria-label={REACTION_LABELS[feedback.reaction]}
            >
              {REACTION_EMOJI[feedback.reaction]}
            </span>
          )}
          <div>
            <h2 id="detail-heading" className="sr-only">
              Note from {fullDate(feedback.createdAt)}
            </h2>
            {/* Short here; the exact time is under "Received" below. */}
            <time className="small muted" dateTime={feedback.createdAt}>
              {timeAgo(feedback.createdAt)}
            </time>
          </div>
        </div>
        <div className="detail-actions">
          {feedback.deletedAt ? (
            <DeletedActions onRestore={onRestore} onDeleteForever={onDeleteForever} />
          ) : (
            <StatusActions
              status={feedback.status}
              onStatus={onStatus}
              onReply={onReply && wantsReply(feedback) ? onReply : undefined}
              onDelete={onDelete}
            />
          )}
          {onClose && (
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              data-tooltip="Close"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </header>

      {feedback.message && <p className="detail-message">{feedback.message}</p>}

      {target && (
        <div className="detail-target">
          <span className="target-chip" title={target.selector}>
            &lt;/&gt; {target.text ? `“${target.text}”` : target.selector}
          </span>
          {showMe && (
            <a className="link small" href={showMe} target="_blank" rel="noopener noreferrer">
              Show me ↗
            </a>
          )}
        </div>
      )}

      <dl className="facts">
        {site && (
          <Fact label="Site">
            {site.href ? (
              <Link to={site.href} className="link-plain">
                {site.name}
              </Link>
            ) : (
              site.name
            )}
          </Fact>
        )}
        <Fact label="Received">
          <time dateTime={feedback.createdAt}>{fullDate(feedback.createdAt)}</time>
        </Fact>
        <Fact label="Page">
          {page ? (
            <a
              className="mono link-plain"
              href={page.toString()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={reviewPage}
              title="Open in review mode"
            >
              {context.url}
            </a>
          ) : (
            <span className="mono">{context.url}</span>
          )}
          {context.title && <div className="muted small">{context.title}</div>}
        </Fact>
        {target && (
          <Fact label="Element">
            <span className="mono small">{target.selector}</span>
          </Fact>
        )}
        <Fact label="Status">
          <span className={`status-pill ${feedback.status}`}>{STATUS_LABELS[feedback.status]}</span>
        </Fact>
        {feedback.contactEmail && (
          <Fact label="Reply to">
            <a className="link" href={`mailto:${feedback.contactEmail}`}>
              {feedback.contactEmail}
            </a>
            {feedback.repliedAt && (
              <div className="muted small">Replied {timeAgo(feedback.repliedAt)}</div>
            )}
          </Fact>
        )}
        {(visitor?.name || visitor?.email || visitor?.id) && (
          <Fact label="Visitor">
            {[visitor.name, visitor.email, visitor.id && `id ${visitor.id}`]
              .filter(Boolean)
              .join(" · ")}
          </Fact>
        )}
        <Fact label="Screen">
          {context.viewport.width}×{context.viewport.height} window
          {context.screen && ` on a ${context.screen.width}×${context.screen.height} screen`}
        </Fact>
        {context.userAgent && <Fact label="Browser">{browserSummary(context.userAgent)}</Fact>}
        {context.language && <Fact label="Language">{context.language}</Fact>}
        {context.timezone && <Fact label="Time zone">{context.timezone}</Fact>}
        {context.referrer && (
          <Fact label="Came from">
            <span className="mono small">{context.referrer}</span>
          </Fact>
        )}
        {metadata &&
          Object.entries(metadata).map(([key, value]) => (
            <Fact key={key} label={key}>
              <span className="mono small">{String(value)}</span>
            </Fact>
          ))}
      </dl>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** "Chrome on Windows" from a user-agent string. Good enough for a glance, not exact. */
function browserSummary(ua: string): string {
  const browser =
    (/Edg\//.test(ua) && "Edge") ||
    (/Firefox\//.test(ua) && "Firefox") ||
    (/Chrome\//.test(ua) && "Chrome") ||
    (/Safari\//.test(ua) && "Safari") ||
    "A browser";
  const os =
    (/Windows/.test(ua) && "Windows") ||
    (/iPhone|iPad/.test(ua) && "iOS") ||
    (/Mac OS X/.test(ua) && "macOS") ||
    (/Android/.test(ua) && "Android") ||
    (/Linux/.test(ua) && "Linux") ||
    "";
  return os ? `${browser} on ${os}` : browser;
}
