import type { Project, ProjectWithSummary } from "@flooper/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, keys } from "../api";
import { FieldErrors } from "./FieldErrors";
import { CheckIcon, CloseIcon } from "./icons";
import { OriginsForm, Snippet } from "./SiteSetup";

/**
 * Connecting a site, in the notes panel's place: all three steps in view from
 * the start, so you can see the whole job before you begin. With no `site`
 * it's a brand-new one: step 1 (its address) creates it, named after that
 * address. A site stays on these steps until its first note arrives, which
 * then opens in the notes list.
 */
export function SetupPanel({
  site,
  closeHref,
}: {
  site: ProjectWithSummary | null;
  /** Where the close button goes; no button without one (nowhere else to be). */
  closeHref?: string;
}) {
  const [copied, setCopied] = useRememberedFlag(site ? `flooper:copied:${site.id}` : null);
  const [open, setOpen] = useState<"address" | "snippet" | null>(null);
  const hasAddress = (site?.allowedOrigins.length ?? 0) > 0;
  useFirstNote(site);

  const address: StepState = hasAddress && open !== "address" ? "done" : "current";
  const snippet: StepState = !hasAddress
    ? "upcoming"
    : copied && open !== "snippet"
      ? "done"
      : "current";
  const test: StepState = hasAddress && copied ? "current" : "upcoming";
  const firstOrigin = site?.allowedOrigins[0];
  const hosts = site?.allowedOrigins.map((o) => new URL(o).host).join(", ");

  return (
    <section className="notes-panel wide-panel" aria-labelledby="setup-heading">
      <div className="notes-bar">
        <h2 id="setup-heading" className="notes-title">
          {site ? `Connect ${site.name}` : "Add a site"}
        </h2>
        {closeHref && (
          <span className="notes-bar-end">
            <Link to={closeHref} className="icon-button" aria-label="Close" data-tooltip="Close">
              <CloseIcon />
            </Link>
          </span>
        )}
      </div>
      <ol className="stepper setup-steps">
        <Step
          n={1}
          title="Your site's address"
          hint="Where the widget will live. It only works there, so nobody else can use it."
          state={address}
          summary={<span className="mono small muted">{hosts}</span>}
          onEdit={() => setOpen("address")}
        >
          {site && hasAddress ? (
            <OriginsForm project={site} onSaved={() => setOpen(null)} />
          ) : (
            <AddressForm site={site} />
          )}
        </Step>

        <Step
          n={2}
          title="Paste this into your site"
          hint="One line of code, just before the closing </body> tag."
          state={snippet}
          summary={<span className="small muted">Copied</span>}
          editLabel="Show"
          onEdit={() => setOpen("snippet")}
        >
          {site && (
            <>
              <Snippet
                project={site}
                onCopy={() => {
                  setCopied();
                  setOpen(null);
                }}
              />
              {!copied && <p className="small muted">Copying it moves you on to the last step.</p>}
            </>
          )}
        </Step>

        <Step
          n={3}
          title="Send yourself a test note"
          hint="Click the creature in your site's corner and send anything. It lands here."
          state={test}
        >
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
    </section>
  );
}

const ADDRESS_LABELS = ["Add site", "Adding…", "Save", "Saving…"];

/**
 * Step 1's field. Takes an address however it's typed ("myblog.com",
 * "https://myblog.com/blog/"), keeps just the origin, and either creates the
 * site (named after the address) or gives an existing one its address.
 */
function AddressForm({ site }: { site: Project | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [badInput, setBadInput] = useState(false);
  const save = useMutation({
    mutationFn: (origin: string) =>
      site
        ? api.updateProject(site.id, { allowedOrigins: [origin] })
        : api.createProject({ name: siteNameFor(origin), allowedOrigins: [origin] }),
    onSuccess: async (project) => {
      queryClient.setQueryData(keys.project(project.id), project);
      // Wait for the sidebar's list to have it, then show its next step.
      await queryClient.invalidateQueries({ queryKey: keys.projects });
      if (!site) navigate(`/?site=${project.id}`);
    },
  });

  const addressLabel = site
    ? save.isPending
      ? "Saving…"
      : "Save"
    : save.isPending
      ? "Adding…"
      : "Add site";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const origin = originFrom(value);
    setBadInput(origin === null);
    if (origin) save.mutate(origin);
  }

  return (
    <form className="inline-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="site-address" className="sr-only">
        Your site's address
      </label>
      <input
        id="site-address"
        className="mono"
        placeholder="myblog.com"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBadInput(false);
        }}
        autoComplete="url"
        inputMode="url"
        // biome-ignore lint/a11y/noAutofocus: it's the one thing to do here.
        autoFocus
        required
      />
      <button type="submit" className="btn primary" disabled={save.isPending || !value.trim()}>
        {/* Every label stacked in one spot (only the current one visible), so
            the button, and the field beside it, keep one width throughout. */}
        <span className="stable-label">
          {ADDRESS_LABELS.map((label) => (
            <span key={label} className={label === addressLabel ? undefined : "ghost"}>
              {label}
            </span>
          ))}
        </span>
      </button>
      {badInput && (
        <p className="error small" role="alert">
          That doesn't look like a web address. Try something like myblog.com.
        </p>
      )}
      <FieldErrors error={save.error} />
    </form>
  );
}

/**
 * The origin in what someone typed, or null. No scheme means https, except
 * for local addresses, which are usually plain http.
 */
export function originFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(text);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `${local ? "http" : "https"}://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname;
    const looksReal = host.includes(".") || host === "localhost" || host === "[::1]";
    return looksReal ? url.origin : null;
  } catch {
    return null;
  }
}

/** A new site's name: its address without the scheme or "www.". Renamable in settings. */
export function siteNameFor(origin: string): string {
  return new URL(origin).host.replace(/^www\./, "");
}

/**
 * Watches for a site's first note. When it lands, the site's notes take this
 * panel's place, with that note open.
 */
function useFirstNote(site: ProjectWithSummary | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const siteId = site?.id;
  const first = useQuery({
    queryKey: ["first-note", siteId],
    queryFn: () => api.listAllFeedback({ projectId: siteId, sort: "time", dir: "desc", limit: 1 }),
    enabled: siteId !== undefined,
    refetchInterval: 4000,
  });
  const noteId = first.data?.data[0]?.id;

  useEffect(() => {
    if (!noteId || !siteId) return;
    void queryClient.invalidateQueries({ queryKey: keys.projects });
    navigate(`/?site=${siteId}&note=${noteId}`, { replace: true });
  }, [noteId, siteId, queryClient, navigate]);
}

type StepState = "done" | "current" | "upcoming";

/**
 * One step. Every step shows its title and a line about it; only the current
 * one opens, and finished ones fold into a summary that can be reopened.
 */
function Step({
  n,
  title,
  hint,
  state,
  summary,
  editLabel = "Edit",
  onEdit,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  state: StepState;
  summary?: ReactNode;
  editLabel?: string;
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
            <h3>
              {title}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </h3>
            {state === "done" ? summary : <span className="small muted">{hint}</span>}
          </div>
          {state === "done" && onEdit && (
            <button type="button" className="text-button" onClick={onEdit}>
              {editLabel}
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
 * No key (nothing to remember it for yet) is always "not yet".
 */
function useRememberedFlag(key: string | null): [boolean, () => void] {
  const read = () => {
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const [state, setState] = useState(() => ({ key, value: read() }));
  // A different site (or a new one just created): read its own flag.
  const value = state.key === key ? state.value : read();
  if (state.key !== key) setState({ key, value });

  const set = () => {
    setState({ key, value: true });
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Remembered for this visit only.
    }
  };
  return [value, set];
}
