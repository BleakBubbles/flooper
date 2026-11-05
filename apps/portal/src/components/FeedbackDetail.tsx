import { type FeedbackStatus, REACTION_EMOJI } from "@flooper/shared";
import type { Feedback } from "@flooper/shared/schemas";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { pageUrl, showMeUrl } from "../feedbackLinks";
import { fullDate, timeAgo } from "../time";
import { REACTION_LABELS, StatusActions } from "./FeedbackRow";
import { BackIcon } from "./icons";

/** Everything about one note, with its actions at the top. */
export function FeedbackDetail({
  feedback,
  allowedOrigins,
  backHref,
  onStatus,
}: {
  feedback: Feedback;
  allowedOrigins: string[];
  /** Back to the list (only shown on narrow screens, where the list is hidden). */
  backHref: string;
  onStatus: (status: FeedbackStatus) => void;
}) {
  const { context, target, visitor, metadata } = feedback;
  const showMe = showMeUrl(feedback, allowedOrigins);
  const page = pageUrl(feedback, allowedOrigins);

  return (
    <article className="detail" aria-labelledby="detail-heading">
      <Link to={backHref} className="detail-back">
        <BackIcon /> Inbox
      </Link>

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
            <time className="small muted" dateTime={feedback.createdAt}>
              {fullDate(feedback.createdAt)} · {timeAgo(feedback.createdAt)}
            </time>
          </div>
        </div>
        <StatusActions status={feedback.status} onStatus={onStatus} />
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
        <Fact label="Page">
          {page ? (
            <a
              className="mono link-plain"
              href={page.toString()}
              target="_blank"
              rel="noopener noreferrer"
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
          <span className={`status-pill ${feedback.status}`}>{feedback.status}</span>
        </Fact>
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
