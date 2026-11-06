import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { usePageTitle } from "../usePageTitle";
import { DevtoolsShowcase } from "./DevtoolsShowcase";
import { NoteRing } from "./NoteRing";
import "./landing.css";

/**
 * The public front page: flooper.app/ before you sign in, and /about after.
 * Shows instead of tells: a ring of notes that
 * never stops filling up, then each step and each claim as a picture of the
 * real thing.
 */
export function LandingPage() {
  usePageTitle();
  // Already logged in? Then the way in is the app, not the login button.
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  const loggedIn = me.isSuccess;

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="" width={36} height={36} />
          Flooper
        </Link>
        <nav>
          {loggedIn ? (
            <Link className="btn primary" to="/">
              Open the app
              <MiniIcon size={16}>
                <path d="M7 7h10v10" />
                <path d="M7 17 17 7" />
              </MiniIcon>
            </Link>
          ) : (
            <>
              <Link className="btn quiet borderless" to="/login">
                Log in
              </Link>
              <a className="btn primary" href="/api/auth/github">
                Get started
              </a>
            </>
          )}
        </nav>
      </header>

      <NoteRing
        hero={
          <>
            <h1>Your users have a lot to say.</h1>
            <p className="lede">
              Flooper gives them a voice. Hear what's broken, what's confusing, and what they love,
              straight from the page they're on.
            </p>
            <GithubButton />
            <p className="fine">free while it's small · under 10 KB gzip · no cookies</p>
          </>
        }
      />

      <section className="landing-section">
        <ol className="steps">
          <Step n={1} title="Paste one line into your site's code">
            <pre className="step-art snippet">
              <span className="dim">{"<!-- before </body> -->"}</span>
              {'\n<script\n  src="'}
              <span className="hot">https://flooper.app/sdk/flooper.js</span>
              {'"\n  data-project-key="'}
              <span className="hot">pk_3f9a…</span>
              {'"\n  defer\n></script>'}
            </pre>
          </Step>
          <Step n={2} title="Users give feedback from the widget">
            <PickerSketch />
          </Step>
          <Step n={3} title="See what and where they commented">
            <dl className="step-art received">
              <dt>Note</dt>
              <dd>🐛 Nothing happens when I tap Pay</dd>
              <dt>Element</dt>
              <dd className="mono">button#pay</dd>
              <dt>Page</dt>
              <dd className="mono">/checkout</dd>
              <dt>Browser</dt>
              <dd>Chrome 131 · Android</dd>
              <dt>Screen</dt>
              <dd>412×915</dd>
              <dt />
              <dd className="hot">Show me on the page ↗</dd>
            </dl>
          </Step>
        </ol>
      </section>

      <section className="landing-section">
        <DevtoolsShowcase heading="Built the way you'd build it." />
      </section>

      <section className="landing-cta">
        <div>
          <h2>Ship it before your coffee cools.</h2>
          <p>Log in with GitHub, add your site, paste the line.</p>
        </div>
        <GithubButton />
      </section>

      <footer className="landing-footer">
        <span>Flooper. Made for small sites.</span>
        <Link to={loggedIn ? "/" : "/login"} className="landing-footer-link">
          Open the app
          <MiniIcon size={13}>
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </MiniIcon>
        </Link>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="panel">
      <h3>
        <span className="hot step-n">{n}</span>
        {title}
      </h3>
      {children}
    </li>
  );
}

/**
 * A page with the widget open mid-note: the bug reaction chosen, the Pay
 * button picked, the message still being typed. A small copy of the real
 * widget's layout (packages/sdk/src/ui/widget.ts).
 */
function PickerSketch() {
  return (
    <div className="step-art sketch" aria-hidden="true">
      <span className="bar" style={{ width: 60 }} />
      <span className="bar heading" style={{ width: 84 }} />
      <span className="bar" style={{ width: 72 }} />
      <span className="picked">
        <span className="picked-label">button#pay</span>
        <span className="pay">Pay $12</span>
      </span>
      <span className="mini-widget">
        <span className="mini-title">Leave a note for the dev</span>
        <span className="mini-reactions">
          <span>❤️</span>
          <span>💡</span>
          <span>🤔</span>
          <span className="on">🐛</span>
        </span>
        <span className="mini-message">
          Nothing happens when I tap Pay
          <span className="caret" />
        </span>
        <span className="mini-chip">
          <MiniIcon>
            <path d="m18 16 4-4-4-4" />
            <path d="m6 8-4 4 4 4" />
            <path d="m14.5 4-5 16" />
          </MiniIcon>
          button#pay
          <MiniIcon>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </MiniIcon>
        </span>
        <span className="mini-footer">
          <span className="mini-point">
            <MiniIcon size={13}>
              <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
              <path d="M5 3a2 2 0 0 0-2 2" />
              <path d="M19 3a2 2 0 0 1 2 2" />
              <path d="M5 21a2 2 0 0 1-2-2" />
              <path d="M9 3h1" />
              <path d="M9 21h2" />
              <path d="M14 3h1" />
              <path d="M3 9v1" />
              <path d="M21 9v2" />
              <path d="M3 14v1" />
            </MiniIcon>
          </span>
          <span className="mini-send">
            Send
            <MiniIcon>
              <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
              <path d="M6 12h16" />
            </MiniIcon>
          </span>
        </span>
      </span>
    </div>
  );
}

/** A Lucide icon, drawn inline so it follows the text color. Decorative. */
function MiniIcon({ size = 10, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function GithubButton() {
  return (
    // A plain link, not fetch: OAuth is a sequence of full-page redirects.
    <a className="btn primary big" href="/api/auth/github">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
      </svg>
      Continue with GitHub
    </a>
  );
}
