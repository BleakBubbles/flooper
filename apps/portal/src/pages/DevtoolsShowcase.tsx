import { type ReactNode, useState } from "react";
import "./devtools.css";

type Tab = "Elements" | "Console" | "Network";

type Claim = {
  tab: Tab;
  /** Lucide shapes for the claim's icon. */
  icon: ReactNode;
  title: string;
  line: string;
  /** The site the mock browser is on. The 403 needs to come from someone else's. */
  host: string;
};

// Each claim, shown where a developer would check it: in the browser's DevTools.
const CLAIMS: Claim[] = [
  {
    tab: "Network",
    icon: (
      <>
        <path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z" />
        <path d="M16 8 2 22" />
        <path d="M17.488 15H9" />
      </>
    ),
    title: "Small on purpose",
    line: "Under 10 kB over the wire. CI fails the build if it grows past that.",
    host: "yoursite.com",
  },
  {
    tab: "Elements",
    icon: (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    title: "Can't touch your CSS",
    line: "It lives in a shadow root, and resets everything at the door.",
    host: "yoursite.com",
  },
  {
    tab: "Network",
    icon: (
      <>
        <path d="M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13" />
        <path d="M2 12h8.5" />
        <path d="M20 6V4a2 2 0 1 0-4 0v2" />
        <rect width="8" height="5" x="14" y="6" rx="1" />
      </>
    ),
    title: "Only works on your sites",
    line: "Someone copies your snippet onto their site? Their notes get a 403.",
    host: "copycat.example",
  },
  {
    tab: "Console",
    icon: (
      <>
        <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
        <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
      </>
    ),
    title: "A JS API when you want one",
    line: "Tell it who's signed in, or open it from your own button.",
    host: "yoursite.com",
  },
];

const TABS = ["Elements", "Console", "Sources", "Network", "Performance"];

/**
 * "Built the way you'd build it": one mock browser with DevTools open, and the
 * claims as tabs beside it. Each claim switches DevTools to where you'd verify
 * it yourself. It stays on the one you pick; nothing moves on its own.
 */
export function DevtoolsShowcase({ heading }: { heading: string }) {
  const [active, setActive] = useState(0);
  const claim = CLAIMS[active] as Claim;

  return (
    <section className="dt-showcase" aria-labelledby="dt-heading">
      {/* The heading heads the list, not the whole section, so the left
          column reads as one unit and starts level with the window. */}
      <div className="dt-side">
        <h2 id="dt-heading">{heading}</h2>
        <div className="dt-claims" role="tablist" aria-labelledby="dt-heading">
          {CLAIMS.map((c, i) => (
            <button
              key={c.title}
              type="button"
              role="tab"
              id={`dt-claim-${i}`}
              aria-selected={i === active}
              aria-controls="dt-window"
              className="dt-claim"
              onClick={() => setActive(i)}
            >
              <span className="dt-claim-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {c.icon}
                </svg>
              </span>
              <span className="dt-claim-text">
                <strong>{c.title}</strong>
                <span className="dt-claim-line">{c.line}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="dt-window"
        id="dt-window"
        role="tabpanel"
        aria-labelledby={`dt-claim-${active}`}
      >
        <div className="dt-chrome" aria-hidden="true">
          <span className="dt-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="dt-url">
            <LockIcon />
            {claim.host}
            <span className="dim">/checkout</span>
          </span>
        </div>
        <MockPage active={active} />
        <div className="dt-tools">
          {/* A mouse shortcut to the claims list, which is the real tab list:
              hidden from screen readers and skipped by Tab, so it isn't one twice. */}
          <div className="dt-tabs" aria-hidden="true">
            {TABS.map((t) => {
              const target = CLAIMS.findIndex((c) => c.tab === t);
              if (target === -1) return <span key={t}>{t}</span>;
              return (
                <button
                  key={t}
                  type="button"
                  tabIndex={-1}
                  className={t === claim.tab ? "on" : undefined}
                  // Network covers two claims: stay on whichever one is showing.
                  onClick={() => t !== claim.tab && setActive(target)}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {/* Keyed so each claim's panel animates in fresh. */}
          <div className="dt-body" key={active}>
            {active === 0 && <NetworkPanel blocked={false} />}
            {active === 1 && <ElementsPanel />}
            {active === 2 && <NetworkPanel blocked />}
            {active === 3 && <ConsolePanel />}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The site in the browser: a checkout page, with the widget's launcher in the corner. */
function MockPage({ active }: { active: number }) {
  return (
    <div className="dt-page" aria-hidden="true">
      <div className="dt-page-nav">
        <i className="logo" />
        <i />
        <i />
        <i />
      </div>
      <div className="dt-page-body">
        <div>
          <i className="h" />
          <i />
          <i className="short" />
        </div>
        <div className="dt-page-card">
          <i />
          <i className="short" />
          <span className="dt-page-pay">Pay $12</span>
        </div>
      </div>
      {active === 3 && (
        <div className="dt-page-widget">
          <strong>Leave a note for the dev</strong>
          <span className="dt-page-reactions">❤️ 💡 🤔 🐛</span>
          <span className="dt-page-field" />
          <span className="dt-page-send">Send</span>
        </div>
      )}
      <span className={active === 1 ? "dt-page-launcher inspected" : "dt-page-launcher"}>
        <img src="/logo.svg" alt="" />
        {active === 1 && <span className="dt-inspect-label">div.flooper 48 × 48</span>}
      </span>
    </div>
  );
}

function NetworkPanel({ blocked }: { blocked: boolean }) {
  const rows = blocked
    ? [
        { name: "checkout", status: "200", type: "document", size: "8.1 kB" },
        { name: "flooper.js", status: "200", type: "script", size: "9.7 kB" },
        { name: "feedback", status: "403", type: "fetch", size: "188 B", picked: true },
      ]
    : [
        { name: "checkout", status: "200", type: "document", size: "14.2 kB" },
        { name: "flooper.js", status: "200", type: "script", size: "9.7 kB", picked: true },
        { name: "feedback", status: "201", type: "fetch", size: "312 B" },
      ];
  return (
    <div className="dt-split">
      <div className="dt-net-pane">
        <table className="dt-net">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th className="dt-net-type">Type</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.name}
                className={[r.picked && "dt-picked", r.status === "403" && "failed"]
                  .filter(Boolean)
                  .join(" ")}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <td>{r.name}</td>
                <td>{r.status}</td>
                <td className="dt-net-type">{r.type}</td>
                <td>{r.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <span className="dt-status">
          3 requests · {blocked ? "18.0 kB" : "24.2 kB"} transferred
        </span>
      </div>
      {blocked ? (
        <Detail heading="Response">
          <span className="p">{"{"}</span>
          {"\n  "}
          <span className="k">"error"</span>
          {": {\n    "}
          <span className="k">"code"</span>
          {": "}
          <span className="s">"origin_not_allowed"</span>
          {",\n    "}
          <span className="k">"message"</span>
          {": "}
          <span className="s">
            "https://copycat.example isn't in this project's allowed origins"
          </span>
          {"\n  }\n}"}
        </Detail>
      ) : (
        <Detail heading="Size">
          <span className="k">Transferred</span>
          {"  9.7 kB "}
          <span className="c">(gzip)</span>
          {"\n"}
          <span className="k">Budget</span>
          {"       10 kB\n"}
          <span className="dt-meter" />
          {"\n"}
          <span className="ok">✓ size check passed in CI</span>
        </Detail>
      )}
    </div>
  );
}

function ElementsPanel() {
  return (
    <div className="dt-split">
      <div className="dt-dom">
        <Line depth={0}>
          <Tag name="body" attrs={[["class", "checkout"]]} open />
        </Line>
        <Line depth={1}>
          <Tag name="main" collapsed />
        </Line>
        <Line depth={1}>
          <Tag name="flooper-widget" open />
        </Line>
        <Line depth={2} className="root">
          ▾ #shadow-root <span className="c">(open)</span>
        </Line>
        <Line depth={3}>
          <Tag name="style" collapsed />
        </Line>
        <Line depth={3} picked>
          <Tag name="div" attrs={[["class", "flooper"]]} collapsed />
          <span className="c"> == $0</span>
        </Line>
        <Line depth={1}>
          <span className="t">{"</flooper-widget>"}</span>
        </Line>
        <Line depth={0}>
          <span className="t">{"</body>"}</span>
        </Line>
      </div>
      <Detail heading="Styles">
        <span className="sel">.flooper</span>
        {" {"}
        <span className="src">widget.css</span>
        {"\n  "}
        <span className="k">position</span>
        {": fixed;\n  "}
        <span className="k">bottom</span>
        {": 20px;\n  "}
        <span className="k">right</span>
        {": 20px;\n}\n"}
        <span className="sel">:host</span>
        {" {"}
        <span className="src">widget.css</span>
        {"\n  "}
        <span className="k">all</span>
        {": initial;\n}\n"}
        <span className="c">{"/* nothing from your stylesheets\n   reaches in here */"}</span>
      </Detail>
    </div>
  );
}

function ConsolePanel() {
  const lines: [string, ReactNode][] = [
    [
      "in",
      <>
        Flooper.identify({"{ "}
        <span className="k">id</span>: <span className="s">"u_42"</span>
        {" }"})
      </>,
    ],
    ["out", "undefined"],
    ["in", <>helpButton.onclick = () =&gt; Flooper.open()</>],
    ["out", "() => Flooper.open()"],
    ["in", "Flooper.open()"],
    ["out", "undefined"],
  ];
  return (
    <div className="dt-console">
      {lines.map(([kind, text], i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed transcript.
          key={i}
          className={`dt-console-line ${kind}`}
          style={{ animationDelay: `${i * 380}ms` }}
        >
          <span className="dt-prompt">{kind === "in" ? "›" : "‹"}</span>
          <span>{text}</span>
        </div>
      ))}
      <div className="dt-console-line in" style={{ animationDelay: `${lines.length * 380}ms` }}>
        <span className="dt-prompt">›</span>
        <span className="dt-caret" />
      </div>
    </div>
  );
}

function Detail({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="dt-detail">
      <span className="dt-detail-heading">{heading}</span>
      <pre>{children}</pre>
    </div>
  );
}

function Line({
  depth,
  picked,
  className,
  children,
}: {
  depth: number;
  picked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = ["dt-line", picked && "dt-picked", className].filter(Boolean).join(" ");
  return (
    <div className={classes} style={{ paddingLeft: 10 + depth * 14 }}>
      {children}
    </div>
  );
}

function Tag({
  name,
  attrs = [],
  open,
  collapsed,
}: {
  name: string;
  attrs?: [string, string][];
  open?: boolean;
  collapsed?: boolean;
}) {
  return (
    <>
      {(open || collapsed) && <span className="c">{open ? "▾ " : "▸ "}</span>}
      <span className="t">
        {"<"}
        {name}
      </span>
      {attrs.map(([k, v]) => (
        <span key={k}>
          {" "}
          <span className="a">{k}</span>=<span className="s">"{v}"</span>
        </span>
      ))}
      <span className="t">{">"}</span>
      {collapsed && (
        <>
          …<span className="t">{`</${name}>`}</span>
        </>
      )}
    </>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
