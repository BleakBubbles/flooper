import type { Project } from "@flooper/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { api, keys } from "../api";
import { FieldErrors } from "./FieldErrors";

// The pieces of connecting a site, shared by the Setup page (first run) and
// Site settings (later changes).

/** The <script> tag for a site. The portal, API and SDK share this origin. */
export function snippetFor(project: Project): string {
  const origin = window.location.origin;
  return `<script
  src="${origin}/sdk/flooper.js"
  data-project-key="${project.publicKey}"
  data-api-url="${origin}"
  defer
></script>`;
}

/** `onCopy` fires once the snippet is copied (or selected for copying). */
export function Snippet({ project, onCopy }: { project: Project; onCopy?: () => void }) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const pre = useRef<HTMLPreElement>(null);
  const snippet = snippetFor(project);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setState("copied");
    } catch {
      // Clipboard access can be refused (permissions, embedded frames). Select
      // the text instead, so a Ctrl/Cmd+C finishes the job.
      if (pre.current) window.getSelection()?.selectAllChildren(pre.current);
      setState("selected");
    }
    onCopy?.();
    setTimeout(() => setState("idle"), 2500);
  }

  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";
  const label = { idle: "Copy", copied: "Copied", selected: `Press ${shortcut}` }[state];

  return (
    <div className="code-block">
      <pre className="code" ref={pre}>
        {snippet}
      </pre>
      <button type="button" className="copy-button" onClick={copy}>
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {label}
      </button>
      {/* Announce the result to screen readers, since the button text alone may not be re-read. */}
      <span className="sr-only" role="status">
        {state === "copied" ? "Snippet copied" : state === "selected" ? "Snippet selected" : ""}
      </span>
    </div>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CopyIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Edit the addresses the widget may run on, one per line. */
export function OriginsForm({ project, onSaved }: { project: Project; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const [origins, setOrigins] = useState(project.allowedOrigins.join("\n"));
  const save = useMutation({
    mutationFn: (allowedOrigins: string[]) => api.updateProject(project.id, { allowedOrigins }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated);
      queryClient.invalidateQueries({ queryKey: keys.projects });
      setOrigins(updated.allowedOrigins.join("\n"));
      onSaved?.();
    },
  });
  const unchanged = origins.trim() === project.allowedOrigins.join("\n");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(origins.split(/\s+/).filter(Boolean));
  }

  return (
    <form onSubmit={onSubmit} className="panel-body" style={{ padding: 0 }}>
      <label htmlFor={`origins-${project.id}`} className="sr-only">
        Allowed addresses, one per line
      </label>
      <textarea
        id={`origins-${project.id}`}
        className="mono"
        rows={Math.max(2, origins.split("\n").length)}
        placeholder="https://mysite.com"
        value={origins}
        onChange={(e) => setOrigins(e.target.value)}
      />
      <FieldErrors error={save.error} />
      <div className="row-inline">
        {/* Quiet (ghost) while there's nothing to save, solid once there is. */}
        <button
          type="submit"
          className={unchanged ? "btn ghost" : "btn primary"}
          disabled={save.isPending || unchanged}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isSuccess && unchanged && <span className="muted small">Saved</span>}
      </div>
    </form>
  );
}
