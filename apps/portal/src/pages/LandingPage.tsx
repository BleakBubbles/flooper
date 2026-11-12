import type { FlooperInstance } from "@flooper/sdk";
import { useQuery } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useEffect } from "react";
import { Link } from "react-router";
import { api, keys } from "../api";
import { GithubButton } from "../components/GithubButton";
import { inReviewMode, openAppFromReview } from "../reviewMode";
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
  useCanonical("/");
  useFlooperWidget();
  // Already logged in? Then the way in is the app, not the login button.
  const me = useQuery({ queryKey: keys.me, queryFn: api.me });
  const loggedIn = me.isSuccess;
  // In review mode, / is this page: going to the app ends review mode first.
  const openApp = (event: MouseEvent) => {
    if (!inReviewMode()) return;
    event.preventDefault();
    openAppFromReview();
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="" width={36} height={36} />
          Flooper
        </Link>
        <nav>
          {loggedIn ? (
            <Link className="btn primary" to="/" onClick={openApp}>
              Open the app
              <MiniIcon size={16}>
                <path d="M7 7h10v10" />
                <path d="M7 17 17 7" />
              </MiniIcon>
            </Link>
          ) : (
            // For returning users, who look for "Log in". New visitors have the
            // big "Continue with GitHub" in the hero (and again at the bottom),
            // so the header doesn't repeat it as "Get started". Signing in and
            // signing up are the same step: straight to GitHub, a full-page
            // redirect, not a route.
            <a className="btn outline" href="/api/auth/github">
              Log in
            </a>
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
          <h2>Join the Feedback Loop today.</h2>
          <p>
            Log in with GitHub, add your sites, and start collecting feedback with a single script.
          </p>
        </div>
        <GithubButton />
      </section>

      <footer className="landing-footer">
        <span>Flooper. Made for small sites.</span>
        {/* Signed out, straight to GitHub like "Log in": one click, not two. */}
        {loggedIn ? (
          <Link to="/" className="landing-footer-link" onClick={openApp}>
            Open the app
            <FooterArrow />
          </Link>
        ) : (
          <a href="/api/auth/github" className="landing-footer-link">
            Open the app
            <FooterArrow />
          </a>
        )}
      </footer>
    </div>
  );
}

/**
 * Tells search engines which address is the real one for this page, so the
 * landing page at /about (for signed-in people) counts as the one at /.
 */
function useCanonical(path: string) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = new URL(path, window.location.origin).href;
    document.head.append(link);
    return () => link.remove();
  }, [path]);
}

/**
 * The page's own project key: notes left here land in the "flooper.app" site.
 * Locally it's the dev seed's SDK Playground, so testing never reaches the
 * real inbox. Keys are public by design, like a Stripe publishable key.
 */
const FLOOPER_KEY = import.meta.env.DEV ? "pk_dev_playground" : "pk_nrszdxgx2qsh5qq1992mwsmc";

/**
 * Flooper on Flooper's own page: the real widget, so visitors can try it.
 * Loaded only here (the app never downloads it), and removed when you leave,
 * since "Open the app" switches pages without a reload.
 */
function useFlooperWidget() {
  useEffect(() => {
    let widget: FlooperInstance | undefined;
    let left = false;
    void import("@flooper/sdk").then(({ init }) => {
      if (left) return;
      widget = init({ projectKey: FLOOPER_KEY, apiUrl: window.location.origin });
    });
    return () => {
      left = true;
      widget?.destroy();
    };
  }, []);
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
        <span className="mini-title">Leave a note for the dev:</span>
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

function FooterArrow() {
  return (
    <MiniIcon size={13}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </MiniIcon>
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
