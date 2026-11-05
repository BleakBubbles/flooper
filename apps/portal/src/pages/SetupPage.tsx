import type { Project } from "@flooper/shared/schemas";
import { type ReactNode, useState } from "react";
import { OriginsForm, Snippet } from "../components/SiteSetup";

type StepId = "origins" | "snippet" | "test";

/**
 * A guided stepper for connecting a new site. Only the current step is open;
 * finished steps fold into a one-line summary (with Edit), later steps show
 * just their title. The parent polls the note counts, so the page turns into
 * the inbox by itself when the first note arrives, which finishes step 3.
 */
export function SetupPage({ project }: { project: Project }) {
  const [copied, setCopied] = useRememberedFlag(`flooper:copied:${project.id}`);
  const [editing, setEditing] = useState<StepId | null>(null);

  const done: Record<StepId, boolean> = {
    origins: project.allowedOrigins.length > 0,
    snippet: copied,
    test: false,
  };
  const order: StepId[] = ["origins", "snippet", "test"];
  const current = editing ?? order.find((id) => !done[id]) ?? "test";
  const doneCount = order.filter((id) => done[id]).length;
  const firstOrigin = project.allowedOrigins[0];
  const hosts = project.allowedOrigins.map((o) => new URL(o).host).join(", ");

  return (
    <main className="page narrow">
      <div className="page-title">
        <h1>Connect {project.name}</h1>
        <p className="muted">Once the first note arrives, this page becomes your inbox.</p>
        <div className="progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={doneCount}
          >
            <div className="progress-fill" style={{ width: `${(doneCount / 3) * 100}%` }} />
          </div>
          <span className="small muted">{doneCount} of 3 done</span>
        </div>
      </div>

      <ol className="panel stepper">
        <Step
          n={1}
          title="Allow your site's address"
          state={stateOf("origins")}
          summary={<span className="mono small muted">{hosts}</span>}
          onEdit={() => setEditing("origins")}
        >
          <p className="muted">
            The widget only works on these addresses, so nobody else can use your project key.
          </p>
          <OriginsForm project={project} onSaved={() => setEditing(null)} />
        </Step>

        <Step
          n={2}
          title="Add the widget to your site"
          state={stateOf("snippet")}
          summary={<span className="small muted">Snippet copied</span>}
          onEdit={() => setEditing("snippet")}
        >
          <p className="muted">Paste this just before the closing &lt;/body&gt; tag.</p>
          <Snippet
            project={project}
            onCopy={() => {
              setCopied();
              setEditing(null);
            }}
          />
          {!copied && <p className="small muted">Copying the snippet marks this step done.</p>}
        </Step>

        <Step
          n={3}
          title="Leave yourself a test note"
          upcomingHint="Then watch it land here."
          state={stateOf("test")}
        >
          <p className="muted">
            Open your site, click the creature in the corner and send anything. It'll appear here.
          </p>
          <div className="row-inline">
            {firstOrigin && (
              <a className="link" href={firstOrigin} target="_blank" rel="noopener noreferrer">
                Open {new URL(firstOrigin).host} ↗
              </a>
            )}
            <span className="waiting" role="status">
              Waiting for the first note…
            </span>
          </div>
        </Step>
      </ol>
    </main>
  );

  function stateOf(id: StepId): StepState {
    if (id === current) return "current";
    return done[id] ? "done" : "upcoming";
  }
}

type StepState = "done" | "current" | "upcoming";

function Step({
  n,
  title,
  state,
  summary,
  upcomingHint,
  onEdit,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  upcomingHint?: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <li className={`step ${state}`} aria-current={state === "current" ? "step" : undefined}>
      <span className="step-dot" aria-hidden="true">
        {state === "done" ? <CheckIcon /> : n}
      </span>
      <div className="step-body">
        <div className="step-head">
          <div className="step-title">
            <h2>
              {title}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </h2>
            {state === "done" && summary}
            {state === "upcoming" && upcomingHint && (
              <span className="small muted">{upcomingHint}</span>
            )}
          </div>
          {state === "done" && onEdit && (
            <button type="button" className="text-button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
        {state === "current" && children}
      </div>
    </li>
  );
}

/**
 * A yes/no that survives reloads in this browser (e.g. "snippet copied").
 * Storage can be unavailable (private mode), so failures just mean "not yet".
 */
function useRememberedFlag(key: string): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const set = () => {
    setValue(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Remembered for this visit only.
    }
  };
  return [value, set];
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
